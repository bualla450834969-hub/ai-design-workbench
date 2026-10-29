import type { Asset } from "@/types/domain";
import { appPath } from "@/lib/app-path";

export const MAX_PROJECT_COMPARE_IMAGES = 4;

/** Converted generated images remain results even after their role changes. */
export function projectResultAssets(assets: Asset[]) {
  const unique = new Map<string, Asset>();
  for (const asset of assets) {
    if (asset.type.startsWith("image/") && (asset.origin === "generated" || asset.role === "result")) unique.set(asset.id, asset);
  }
  return [...unique.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export interface ProjectResultDisplayEntry { asset: Asset; displayName: string }

/** Use verified image types for recovered images whose historical extension may be stale. */
function resultExtension(asset: Asset) {
  const verified: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/svg+xml": ".svg", "image/webp": ".webp" };
  return verified[asset.type.split(";", 1)[0].trim().toLowerCase()] || asset.name.match(/\.[a-z0-9]{1,12}$/i)?.[0] || ".png";
}

/** Pass the complete project's assets so filtering and pagination never renumber a download. */
export function projectResultDisplayEntries(assets: Asset[]): ProjectResultDisplayEntry[] {
  const results = projectResultAssets(assets);
  const oldestFirst = [...results].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  const sequenceById = new Map(oldestFirst.map((asset, index) => [asset.id, index + 1]));
  return results.map((asset) => ({ asset, displayName: `方案 ${String(sequenceById.get(asset.id)!).padStart(3, "0")}${resultExtension(asset)}` }));
}

export function toggleProjectComparison(selectedIds: string[], id: string) {
  const unique = [...new Set(selectedIds)];
  if (unique.includes(id)) return unique.filter((item) => item !== id);
  return unique.length >= MAX_PROJECT_COMPARE_IMAGES ? unique : [...unique, id];
}

export function resultPixelLabels(asset: Asset) {
  const native = asset.nativeWidth && asset.nativeHeight ? `${asset.nativeWidth} × ${asset.nativeHeight}` : "未记录";
  const exported = asset.exportWidth && asset.exportHeight ? `${asset.exportWidth} × ${asset.exportHeight}` : "未记录";
  return {
    native: `原生 ${native}`,
    exported: asset.localSaveError ? "未保存本机" : `${asset.upscaled ? "放大导出" : "导出"} ${exported}`,
  };
}

export function resultThumbnailUrl(url: string) {
  return url.startsWith("/api/assets/") ? appPath(`${url}${url.includes("?") ? "&" : "?"}thumbnail=1`) : url;
}
