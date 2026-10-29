import path from "node:path";
import type { Asset } from "@/types/domain";
import { dataPath } from "@/lib/data-path";
import { PROJECT_RESULTS_FOLDER, PROJECT_UPLOADS_FOLDER, projectDirectory } from "@/lib/project-files";

const extensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

export function cleanMimeType(value: string) {
  return value.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

export function extensionForMime(type: string) {
  return extensions[cleanMimeType(type)] || ".bin";
}

export function assetFilePath(asset: Pick<Asset, "id" | "projectId" | "projectFolder" | "role" | "type">) {
  const folder = asset.role === "result" ? PROJECT_RESULTS_FOLDER : PROJECT_UPLOADS_FOLDER;
  return path.join(/* turbopackIgnore: true */ projectDirectory(asset.projectFolder || asset.projectId), folder, `${asset.id}${extensionForMime(asset.type)}`);
}

export function legacyProjectAssetFilePath(asset: Pick<Asset, "id" | "projectId" | "role" | "type">) {
  const folder = asset.role === "result" ? "results" : "uploads";
  return dataPath("projects", asset.projectId, folder, `${asset.id}${extensionForMime(asset.type)}`);
}

export function legacyAssetFilePath(asset: Pick<Asset, "id" | "role" | "type">) {
  const folder = asset.role === "result" ? "results" : "uploads";
  return dataPath(folder, `${asset.id}${extensionForMime(asset.type)}`);
}

export function safeDownloadName(name: string, fallback: string, verifiedType?: string) {
  const cleaned = name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim();
  const basename = cleaned || fallback;
  const imageType = verifiedType ? cleanMimeType(verifiedType) : "";
  if (["image/jpeg", "image/png", "image/svg+xml", "image/webp"].includes(imageType)) {
    const previousExtension = path.extname(basename);
    const stem = previousExtension ? basename.slice(0, -previousExtension.length) : basename;
    return `${stem || fallback}${extensionForMime(imageType)}`;
  }
  return path.extname(basename) ? basename : `${basename}.png`;
}
