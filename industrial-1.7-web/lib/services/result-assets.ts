import crypto from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { store } from "@/lib/store";
import { PROJECT_RESULTS_FOLDER, projectDirectory, projectFilesRoot } from "@/lib/project-files";
import { assetFilePath, cleanMimeType, extensionForMime, legacyAssetFilePath, legacyProjectAssetFilePath } from "@/lib/services/local-asset-files";
import { lockGeometryWithGeneratedColor } from "@/lib/image/mask-lock";
import type { Asset } from "@/types/domain";
import sharp from "sharp";
import { MAX_ASSET_IMAGE_PIXELS, orientedImageDimensions } from "@/lib/image/asset-image";
import { trustedImageDownloadHeaders } from "@/lib/providers/geekai";
import { downloadPublicImage } from "@/lib/services/safe-image-download";
import { acquireDesktopOperation } from "@/lib/services/desktop-maintenance";
import { saveAssetToCurrentProject } from "@/lib/services/save-asset-file";
export { isPrivateNetworkAddress } from "@/lib/services/safe-image-download";

const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/svg+xml", "image/webp"]);
const mimeByFormat: Record<string, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", svg: "image/svg+xml" };
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const resultSequenceHighWater = new Map<string, number>();

function sanitizeResultLabel(value?: string) {
  return value?.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 48) || "";
}

function resultSequenceNumber(value: string) {
  const match = /^方案\s*0*(\d+)(?:\.[^.]+)?$/i.exec(value.trim());
  const number = match ? Number(match[1]) : 0;
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

/** Reserve display numbers synchronously so overlapping generation requests cannot reuse them. */
function reserveResultSequenceNumbers(userId: string, projectId: string, projectFolder: string, count: number, labels: string[]) {
  if (count <= 0) return [];
  const reservationKey = `${projectFilesRoot()}\u0000${projectId}`;
  let maximum = resultSequenceHighWater.get(reservationKey) || 0;
  for (const asset of store.listAssets(userId, projectId)) maximum = Math.max(maximum, resultSequenceNumber(asset.name));
  for (const label of labels) maximum = Math.max(maximum, resultSequenceNumber(label));
  try {
    const resultsDirectory = join(projectDirectory(projectFolder), PROJECT_RESULTS_FOLDER);
    for (const entry of readdirSync(resultsDirectory, { withFileTypes: true })) {
      if (entry.isFile()) maximum = Math.max(maximum, resultSequenceNumber(entry.name));
    }
  } catch {
    // A new project may not have its results directory until its first image is saved.
  }
  const numbers = Array.from({ length: count }, (_, index) => maximum + index + 1);
  resultSequenceHighWater.set(reservationKey, maximum + count);
  return numbers;
}

function mimeFromUrl(url: string) {
  const pathname = (() => {
    try { return new URL(url).pathname.toLowerCase(); }
    catch { return url.toLowerCase(); }
  })();
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

function fromDataUrl(url: string) {
  const comma = url.indexOf(",");
  if (comma === -1) throw new Error("图片 data URL 格式不正确");
  const meta = url.slice(5, comma);
  const mimeType = cleanMimeType(meta.split(";")[0] || "image/png");
  const raw = url.slice(comma + 1);
  if (raw.length > MAX_IMAGE_BYTES * 1.5) throw new Error("图片 data URL 超过安全大小限制");
  const bytes = meta.includes(";base64") ? Buffer.from(raw, "base64") : Buffer.from(decodeURIComponent(raw), "utf8");
  return { bytes, mimeType };
}

async function fromRemoteUrl(url: string) {
  const downloaded = await downloadPublicImage(url, { maxBytes: MAX_IMAGE_BYTES, headersForUrl: trustedImageDownloadHeaders });
  const mimeType = cleanMimeType(downloaded.contentType || mimeFromUrl(downloaded.finalUrl));
  if (!allowedImageTypes.has(mimeType)) throw new Error(`远程文件不是支持的图片格式（${mimeType || "未知类型"}）`);
  return { bytes: downloaded.bytes, mimeType };
}

async function readImage(url: string) {
  const output = url.startsWith("data:image/") ? fromDataUrl(url) : await fromRemoteUrl(url);
  if (output.bytes.length < 256) throw new Error("图片文件内容过小或已损坏");
  if (output.bytes.length > MAX_IMAGE_BYTES) throw new Error("图片文件超过 50MB，无法安全保存");
  const mimeType = allowedImageTypes.has(output.mimeType) ? output.mimeType : "image/png";
  return { ...output, mimeType };
}

const recoveringAssets = new Map<string, Promise<Asset>>();

export async function restoreGeneratedAsset(userId: string, assetId: string): Promise<Asset> {
  const asset = [...store.assets.values()].flat().find((item) => item.id === assetId);
  if (!asset) throw new Error("素材不存在");
  store.assertProject(userId, asset.projectId);
  if (!asset.type.startsWith("image/")) throw new Error("仅支持恢复图片");
  if (asset.origin !== "generated" && asset.role !== "result" && !asset.localSaveError) throw new Error("这张素材没有可恢复的供应商结果");
  const existing = recoveringAssets.get(assetId);
  if (existing) return existing;
  const operation = (async () => {
    const release = acquireDesktopOperation("保存已生成图片");
    try {
      let localBytes = await readFile(assetFilePath(asset))
        .catch(() => readFile(legacyProjectAssetFilePath(asset)))
        .catch(() => readFile(legacyAssetFilePath(asset)))
        .catch(() => null);
      let image: { bytes: Buffer; mimeType: string };
      let native: { width: number; height: number };
      let upscaled = asset.upscaled;
      const source = asset.remoteSourceUrl || (!asset.url.startsWith("/api/assets/") ? asset.url : "");
      const hasCanonicalFile = await access(assetFilePath(asset)).then(() => true).catch(() => false);
      if (localBytes) {
        try {
          const metadata = await sharp(localBytes, { failOn: "error", limitInputPixels: MAX_ASSET_IMAGE_PIXELS }).metadata();
          const dimensions = orientedImageDimensions(metadata);
          if (dimensions.width < 128 || dimensions.height < 128) localBytes = null;
        } catch { localBytes = null; }
      }
      if (localBytes) {
        const metadata = await sharp(localBytes, { failOn: "error", limitInputPixels: MAX_ASSET_IMAGE_PIXELS }).metadata();
        image = { bytes: localBytes, mimeType: metadata.format ? mimeByFormat[metadata.format] || asset.type : asset.type };
        const dimensions = orientedImageDimensions(metadata);
        native = { width: asset.nativeWidth || dimensions.width, height: asset.nativeHeight || dimensions.height };
        if (hasCanonicalFile && asset.url === `/api/assets/${asset.id}` && !asset.localSaveError && asset.size > 0 && image.mimeType === asset.type && image.mimeType !== "image/svg+xml") return asset;
      } else {
        if (!source) throw new Error("本地图片不存在，且没有可恢复的供应商链接；请重新上传已有图片，不会自动重新生图。");
        const downloaded = await readImage(source);
        const metadata = await sharp(downloaded.bytes, { failOn: "error", limitInputPixels: MAX_ASSET_IMAGE_PIXELS }).metadata();
        native = orientedImageDimensions(metadata);
        if (native.width < 128 || native.height < 128) throw new Error(`图片尺寸异常（${native.width}×${native.height}）`);
        image = { bytes: downloaded.bytes, mimeType: metadata.format ? mimeByFormat[metadata.format] || downloaded.mimeType : downloaded.mimeType };
        const generation = [...(store.messages.get(asset.projectId) || [])].map((message) => message.generation)
          .find((result) => result?.imageAssets?.some((item) => item.id === asset.id));
        const targetLongEdge = { "1K": 1024, "2K": 2048, "4K": 4096 }[generation?.settingsSnapshot?.resolution || "1K"];
        if (Math.max(native.width, native.height) < targetLongEdge) {
          image = { bytes: await sharp(image.bytes, { limitInputPixels: MAX_ASSET_IMAGE_PIXELS }).rotate().resize({
            width: native.width >= native.height ? targetLongEdge : undefined,
            height: native.height > native.width ? targetLongEdge : undefined, fit: "inside",
          }).png({ compressionLevel: 9 }).toBuffer(), mimeType: "image/png" };
          upscaled = true;
        } else upscaled = false;
      }
      if (image.mimeType === "image/svg+xml") {
        image = { bytes: await sharp(image.bytes, { failOn: "error", limitInputPixels: MAX_ASSET_IMAGE_PIXELS }).png().toBuffer(), mimeType: "image/png" };
      }
      const exported = orientedImageDimensions(await sharp(image.bytes, { limitInputPixels: MAX_ASSET_IMAGE_PIXELS }).metadata());
      const saved = { type: image.mimeType, size: image.bytes.length, url: `/api/assets/${asset.id}`,
        sha256: crypto.createHash("sha256").update(image.bytes).digest("hex"),
        nativeWidth: native.width, nativeHeight: native.height, exportWidth: exported.width, exportHeight: exported.height,
        upscaled, remoteSourceUrl: source.startsWith("http") ? source : undefined };
      // Re-read ownership/role/folder after network work; never resurrect an asset
      // deleted while downloading, and keep the canonical current role.
      const current = store.listAssets(userId, asset.projectId).find((item) => item.id === assetId);
      if (!current) throw new Error("素材已删除，未恢复图片");
      const target = assetFilePath({ ...current, type: image.mimeType });
      await mkdir(dirname(target), { recursive: true });
      const temporary = `${target}.restore-${crypto.randomUUID()}.tmp`;
      try {
        await writeFile(temporary, image.bytes, { flag: "wx", mode: 0o600 });
        await rename(temporary, target);
      } finally { await rm(temporary, { force: true }).catch(() => {}); }
      let finalAsset: Asset | undefined;
      try { finalAsset = store.listAssets(userId, asset.projectId).find((item) => item.id === assetId); }
      catch { /* The user may have deleted the entire project during disk I/O. */ }
      if (!finalAsset) {
        await rm(target, { force: true });
        throw new Error("素材已删除，未恢复图片");
      }
      const finalTarget = assetFilePath({ ...finalAsset, type: image.mimeType });
      if (finalTarget !== target) {
        // No await between the last canonical role/folder check and commit.
        // A role change during disk I/O must not point metadata at the old folder.
        mkdirSync(dirname(finalTarget), { recursive: true });
        renameSync(target, finalTarget);
      }
      return store.completeAssetLocalSave(userId, assetId, saved);
    } finally { release(); }
  })();
  recoveringAssets.set(assetId, operation);
  try { return await operation; }
  finally { if (recoveringAssets.get(assetId) === operation) recoveringAssets.delete(assetId); }
}

export async function persistGeneratedImages(input: {
  userId: string;
  projectId: string;
  jobId: string;
  imageUrls: string[];
  /** Optional angle names for multiview exports; ids remain unchanged. */
  labels?: string[];
  resolution?: "1K" | "2K" | "4K";
  geometryLock?: { original: Asset };
  noveltyReference?: Asset;
}) {
  const assets: Asset[] = new Array(input.imageUrls.length);
  const urls: string[] = new Array(input.imageUrls.length);
  const signatures: Array<Buffer | undefined> = new Array(input.imageUrls.length);
  const colorSignatures: Array<Buffer | undefined> = new Array(input.imageUrls.length);
  const errors: Array<{ index: number; message: string }> = [];
  const project = store.assertProject(input.userId, input.projectId);
  const labels = input.imageUrls.map((_, index) => sanitizeResultLabel(input.labels?.[index]));
  const unnamedIndexes = labels.flatMap((label, index) => label ? [] : [index]);
  const reservedNumbers = reserveResultSequenceNumbers(input.userId, input.projectId, project.folderName || project.id, unnamedIndexes.length, labels);
  const resultNumbers = new Map(unnamedIndexes.map((imageIndex, index) => [imageIndex, reservedNumbers[index]]));
  let sourceSignature: Buffer | undefined;
  if (input.noveltyReference) {
    const original = input.noveltyReference;
    const bytes = original.url.startsWith("data:image/") ? fromDataUrl(original.url).bytes
      : await readFile(assetFilePath(original)).catch(() => readFile(legacyProjectAssetFilePath(original))).catch(() => readFile(legacyAssetFilePath(original))).catch(() => null);
    if (bytes) sourceSignature = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_ASSET_IMAGE_PIXELS }).rotate().resize(32, 32, { fit: "fill" }).removeAlpha().raw().toBuffer().catch(() => undefined);
  }
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const resultName = (index: number, mimeType: string) => {
    const label = labels[index];
    return `${label || `方案 ${String(resultNumbers.get(index) || index + 1).padStart(3, "0")}`}${extensionForMime(mimeType)}`;
  };

  let nextIndex = 0;
  const persistOne = async (sourceUrl: string, index: number) => {
    let imageDimensions: Pick<Asset, "nativeWidth" | "nativeHeight" | "exportWidth" | "exportHeight" | "upscaled"> = {};
    try {
      let image: { bytes: Buffer<ArrayBufferLike>; mimeType: string } = await readImage(sourceUrl);
      const nativeMetadata = await sharp(image.bytes, { failOn: "error", limitInputPixels: MAX_ASSET_IMAGE_PIXELS }).metadata();
      const native = orientedImageDimensions(nativeMetadata);
      imageDimensions = { nativeWidth: native.width, nativeHeight: native.height };
      if (input.geometryLock) {
        const original = await readFile(assetFilePath(input.geometryLock.original))
          .catch(() => readFile(legacyProjectAssetFilePath(input.geometryLock!.original)))
          .catch(() => readFile(legacyAssetFilePath(input.geometryLock!.original)));
        image = { bytes: await lockGeometryWithGeneratedColor(original, image.bytes), mimeType: "image/png" };
      }
      const targetLongEdge = { "1K": 1024, "2K": 2048, "4K": 4096 }[input.resolution || "1K"];
      const metadata = await sharp(image.bytes, { failOn: "error", limitInputPixels: MAX_ASSET_IMAGE_PIXELS }).metadata();
      const { width, height } = orientedImageDimensions(metadata);
      if (width < 128 || height < 128) throw new Error(`图片尺寸异常（${width}×${height}）`);
      if (metadata.format && mimeByFormat[metadata.format]) image = { ...image, mimeType: mimeByFormat[metadata.format] };
      if (image.mimeType === "image/svg+xml") {
        image = { bytes: await sharp(image.bytes, { failOn: "error", limitInputPixels: MAX_ASSET_IMAGE_PIXELS }).png().toBuffer(), mimeType: "image/png" };
      }
      if (width > 0 && height > 0 && Math.max(width, height) < targetLongEdge) {
        image = {
          bytes: await sharp(image.bytes, { failOn: "error", limitInputPixels: MAX_ASSET_IMAGE_PIXELS }).rotate().resize({
            width: width >= height ? targetLongEdge : undefined,
            height: height > width ? targetLongEdge : undefined,
            fit: "inside",
            withoutEnlargement: false,
            kernel: sharp.kernel.lanczos3,
          }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer(),
          mimeType: "image/png",
        };
      }
      const exported = orientedImageDimensions(await sharp(image.bytes, { failOn: "error", limitInputPixels: MAX_ASSET_IMAGE_PIXELS }).metadata());
      imageDimensions = { ...imageDimensions, exportWidth: exported.width, exportHeight: exported.height, upscaled: exported.width > native.width || exported.height > native.height };
      const sequence = String(index + 1).padStart(3, "0");
      const id = `design-${stamp}-${sequence}-${crypto.randomBytes(2).toString("hex")}`;
      const sha256 = crypto.createHash("sha256").update(image.bytes).digest("hex");
      signatures[index] = await sharp(image.bytes).resize(16, 16, { fit: "fill" }).greyscale().raw().toBuffer();
      if (sourceSignature) colorSignatures[index] = await sharp(image.bytes).resize(32, 32, { fit: "fill" }).removeAlpha().raw().toBuffer();
      const asset: Asset = {
        id,
        projectId: input.projectId,
        projectFolder: project.folderName || project.id,
        name: resultName(index, image.mimeType),
        type: image.mimeType,
        size: image.bytes.length,
        role: "result",
        origin: "generated",
        url: `/api/assets/${id}`,
        createdAt: new Date().toISOString(),
        sha256,
        remoteSourceUrl: sourceUrl.startsWith("http") ? sourceUrl : undefined,
        ...imageDimensions,
      };
      await saveAssetToCurrentProject(input.userId, asset, image.bytes);
      assets[index] = asset;
      urls[index] = asset.url;
    } catch (error) {
      console.error("Failed to persist generated image", error);
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      const message = code === "ENOSPC" ? "本机磁盘空间不足，请清理空间后重新保存" : code === "EACCES" || code === "EPERM" ? "本机图片目录无写入权限，请检查权限后重新保存" : error instanceof Error ? error.message : "无法读取图片";
      const sequence = String(index + 1).padStart(3, "0");
      const asset: Asset = {
        id: `remote-${stamp}-${sequence}-${crypto.randomBytes(2).toString("hex")}`,
        projectId: input.projectId,
        projectFolder: store.assertProject(input.userId, input.projectId).folderName || project.id,
        name: resultName(index, mimeFromUrl(sourceUrl)),
        type: mimeFromUrl(sourceUrl),
        size: 0,
        role: "result",
        origin: "generated",
        url: sourceUrl,
        createdAt: new Date().toISOString(),
        localSaveError: message,
        remoteSourceUrl: sourceUrl.startsWith("http") ? sourceUrl : undefined,
        nativeWidth: imageDimensions.nativeWidth,
        nativeHeight: imageDimensions.nativeHeight,
      };
      store.addAsset(input.userId, asset);
      assets[index] = asset;
      urls[index] = sourceUrl;
      errors.push({ index, message });
    }
  };
  const workers = Array.from({ length: Math.min(3, input.imageUrls.length) }, async () => {
    while (nextIndex < input.imageUrls.length) {
      const index = nextIndex++;
      await persistOne(input.imageUrls[index], index);
    }
  });
  await Promise.all(workers);

  for (let index = 0; index < signatures.length; index += 1) {
    const current = signatures[index];
    if (!current || !assets[index]) continue;
    for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
      const previous = signatures[previousIndex];
      if (!previous || previous.length !== current.length) continue;
      let difference = 0;
      for (let pixel = 0; pixel < current.length; pixel += 1) difference += Math.abs(current[pixel] - previous[pixel]);
      if (difference / current.length < 5.5) {
        assets[index].tags = [...new Set([...(assets[index].tags || []), "疑似重复方案"] )];
        store.patchAsset(input.userId, assets[index].id, { tags: assets[index].tags });
        break;
      }
    }
  }

  let unchangedCount = 0;
  if (sourceSignature) for (let index = 0; index < colorSignatures.length; index += 1) {
    const current = colorSignatures[index];
    if (!current || !assets[index] || current.length !== sourceSignature.length) continue;
    let difference = 0;
    for (let channel = 0; channel < current.length; channel += 1) difference += Math.abs(current[channel] - sourceSignature[channel]);
    if (difference / current.length < 4) {
      unchangedCount += 1;
      assets[index].tags = [...new Set([...(assets[index].tags || []), "疑似未修改原图"])];
      store.patchAsset(input.userId, assets[index].id, { tags: assets[index].tags });
    }
  }

  return { assets, imageUrls: urls, errors, savedCount: assets.length - errors.length, unchangedCount };
}
