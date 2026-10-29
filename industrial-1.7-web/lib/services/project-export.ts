import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { store } from "@/lib/store";
import { cleanProjectFolderName } from "@/lib/project-files";
import { assetFilePath, extensionForMime, legacyAssetFilePath, legacyProjectAssetFilePath } from "@/lib/services/local-asset-files";
import { projectResultRecords } from "@/lib/services/project-result-records";
import { zipStream, type ZipEntry } from "@/lib/services/zip-export";
import { acquireDesktopOperation } from "@/lib/services/desktop-maintenance";
import type { Asset } from "@/types/domain";

export async function exportProjectResults(userId: string, projectId: string, options: { assetIds?: string[]; favoritesOnly?: boolean; includeComparison?: boolean }) {
  const project = store.assertProject(userId, projectId);
  const projectRelease = store.acquireProjectRead(userId, projectId);
  let operationRelease: (() => void) | undefined;
  let streamed = false;
  const release = () => { operationRelease?.(); projectRelease(); };
  try {
    operationRelease = acquireDesktopOperation("导出项目成果");
    const records = projectResultRecords(userId, projectId);
    const requested = options.assetIds ? new Set(options.assetIds) : null;
    if (requested && [...requested].some((id) => !records.some((record) => record.asset.id === id))) throw new Error("选中的成果已不存在或不属于此项目，请重新选择");
    const selected = records.filter((record) => (!requested || requested.has(record.asset.id)) && (!options.favoritesOnly || record.asset.favorite));
    if (!selected.length) throw new Error("没有可导出的成果图");
    if (selected.length > 500) throw new Error("单次最多导出 500 张，请分批选择");
    const currentAsset = (asset: Asset) => store.listAssets(userId, projectId).find((item) => item.id === asset.id) ?? asset;
    const localPath = async (asset: Asset) => {
      const current = currentAsset(asset);
      for (const file of [assetFilePath(current), legacyProjectAssetFilePath(current), legacyAssetFilePath(current)]) {
        if (await stat(/* turbopackIgnore: true */ file).then((info) => info.isFile()).catch(() => false)) return file;
      }
      throw new Error(`“${asset.name}”尚未保存到项目，请先点击重新保存后再导出`);
    };
    const readImage = async (asset: Asset) => readFile(/* turbopackIgnore: true */ await localPath(asset));
    let total = 0;
    for (const { asset } of selected) total += (await stat(/* turbopackIgnore: true */ await localPath(asset))).size;
    if (total > 3.5 * 1024 ** 3) throw new Error("导出文件较大，请分批选择，单批不超过 3.5GB");
    const filenames = selected.map(({ asset }, index) => `图片/${String(index + 1).padStart(3, "0")}-${cleanProjectFolderName(asset.name.replace(/\.[^.]+$/, ""))}${extensionForMime(asset.type)}`);
    const description = [
      `# ${project.name}`, project.description || "", `导出 ${selected.length} 张项目成果。`,
      "参数.json 包含原始要求、原图与参考图编号、生成参数、原生像素及导出像素。对比图仅用于浏览，不替代原始图片。", "",
      ...selected.flatMap(({ asset, generation, input, variant }, index) => [
        `## ${index + 1}. ${asset.name}`, `文件：${filenames[index]}`, `创建时间：${asset.createdAt}`,
        `原始要求：${input || "历史记录未保存原始要求"}`, `设计路线：${variant?.designRoute || generation?.direction || "未记录"}`,
        `模型：${generation?.model || "未记录"}`, `原生像素：${asset.nativeWidth || "未知"} × ${asset.nativeHeight || "未知"}`,
        `导出像素：${asset.exportWidth || "未知"} × ${asset.exportHeight || "未知"}${asset.upscaled ? "（放大导出）" : ""}`,
        `备注：${asset.note || "无"}`, "",
      ]),
    ].join("\n");
    const entries: ZipEntry[] = [
      { name: "项目说明.md", bytes: async () => Buffer.from(description, "utf8") },
      { name: "参数.json", bytes: async () => Buffer.from(JSON.stringify({ project: { id: project.id, name: project.name, description: project.description }, exportedAt: new Date().toISOString(), results: selected.map((record, index) => ({ ...record, file: filenames[index] })) }, null, 2), "utf8") },
      ...selected.map(({ asset }, index) => ({ name: filenames[index], bytes: () => readImage(asset) })),
    ];
    if (options.includeComparison) entries.push({ name: "对比图.jpg", bytes: async () => {
      const tiles = selected.slice(0, 4);
      const columns = tiles.length === 1 ? 1 : 2;
      const composites = await Promise.all(tiles.map(async ({ asset }, index) => ({
        input: await sharp(await readImage(asset)).rotate().resize(720, 560, { fit: "contain", background: "#ffffff" }).png().toBuffer(),
        left: index % columns * 720, top: Math.floor(index / columns) * 560,
      })));
      return sharp({ create: { width: columns * 720, height: Math.ceil(tiles.length / columns) * 560, channels: 3, background: "#ffffff" } }).composite(composites).jpeg({ quality: 90 }).toBuffer();
    } });
    const stream = zipStream(entries, release);
    streamed = true;
    return { stream, filename: `${cleanProjectFolderName(project.name)}-成果.zip` };
  } finally { if (!streamed) release(); }
}
