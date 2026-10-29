import { readFile } from "node:fs/promises";
import type { Asset } from "@/types/domain";
import { assetFilePath, legacyAssetFilePath, legacyProjectAssetFilePath } from "@/lib/services/local-asset-files";
import { MAX_ASSET_IMAGE_PIXELS, MAX_PROVIDER_IMAGE_BYTES, MAX_PROVIDER_IMAGE_EDGE, orientedImageDimensions } from "@/lib/image/asset-image";
import sharp from "sharp";

export async function normalizeProviderImage(buffer: Buffer, originalType: string) {
  const source = sharp(buffer, { failOn: "error", limitInputPixels: MAX_ASSET_IMAGE_PIXELS });
  const metadata = await source.metadata();
  const { width, height } = orientedImageDimensions(metadata);
  if (!width || !height) throw new Error("无法识别图片尺寸");
  if ((metadata.pages || 1) > 1) throw new Error("请将多页或动画图片导出为单张 JPG、PNG 或 WEBP 后上传");
  for (const edge of [MAX_PROVIDER_IMAGE_EDGE, 3072, 2048, 1536]) {
    const resized = source.clone().rotate().resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true });
    const preservePng = metadata.hasAlpha || originalType === "image/png";
    let bytes = preservePng
      ? await resized.clone().png({ compressionLevel: 8, adaptiveFiltering: true }).toBuffer()
      : await resized.clone().jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    let type = preservePng ? "image/png" : "image/jpeg";
    if (bytes.length > MAX_PROVIDER_IMAGE_BYTES && !metadata.hasAlpha) {
      bytes = await resized.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
      type = "image/jpeg";
    }
    if (bytes.length <= MAX_PROVIDER_IMAGE_BYTES) return { bytes, type };
  }
  throw new Error("图片压缩后仍过大，请先导出较小的 JPG、PNG 或 WEBP 图片");
}

export async function prepareAssetContext(assets: Asset[]) {
  const providerAssets: Asset[] = [];
  const documentSections: string[] = [];
  for (const asset of assets) {
    const target = asset.url.startsWith("/") ? assetFilePath(asset) : null;
    if (!target) { providerAssets.push(asset); continue; }
    try {
      const buffer = await readFile(target)
        .catch(() => readFile(legacyProjectAssetFilePath(asset)))
        .catch(() => readFile(legacyAssetFilePath(asset)));
      if (asset.type.startsWith("image/")) {
        const normalized = await normalizeProviderImage(buffer, asset.type);
        providerAssets.push({ ...asset, type: normalized.type, size: normalized.bytes.length, url: `data:${normalized.type};base64,${normalized.bytes.toString("base64")}` });
      } else if (asset.type === "text/plain") {
        documentSections.push(`【${asset.name}】\n${buffer.toString("utf8").slice(0, 20_000)}`);
      } else if (asset.type === "application/pdf") {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        await parser.destroy();
        documentSections.push(`【${asset.name}】\n${result.text.slice(0, 20_000)}`);
      } else if (asset.type.includes("wordprocessingml")) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        documentSections.push(`【${asset.name}】\n${result.value.slice(0, 20_000)}`);
      }
    } catch (error) {
      if (asset.type.startsWith("image/")) {
        const detail = error instanceof Error ? error.message : "文件损坏或格式不受支持";
        throw new Error(`图片“${asset.name}”无法处理：${/pixel limit/i.test(detail) ? "总像素超过 1.6 亿，请按比例导出较小图片；长横板不会被裁切" : detail}`);
      }
      documentSections.push(`【${asset.name}】读取失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }
  return { providerAssets, documentContext: documentSections.join("\n\n") };
}
