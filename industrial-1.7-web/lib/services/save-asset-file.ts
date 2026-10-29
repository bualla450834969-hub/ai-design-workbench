import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataPath } from "@/lib/data-path";
import { store } from "@/lib/store";
import { assetFilePath } from "@/lib/services/local-asset-files";
import type { Asset } from "@/types/domain";

/** Stage outside movable project folders, then commit against their current name. */
export async function saveAssetToCurrentProject(userId: string, asset: Asset, bytes: Buffer) {
  store.assertProject(userId, asset.projectId);
  const staging = dataPath("pending-assets");
  await mkdir(staging, { recursive: true });
  const temporary = path.join(staging, `${crypto.randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode: 0o600 });
    // No await between this ownership/folder check, final file commit and metadata.
    const project = store.assertProject(userId, asset.projectId);
    asset.projectFolder = project.folderName || project.id;
    const target = assetFilePath(asset);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    try { fs.renameSync(temporary, target); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
      const sibling = `${target}.pending-${crypto.randomUUID()}.tmp`;
      try {
        fs.copyFileSync(temporary, sibling, fs.constants.COPYFILE_EXCL);
        fs.renameSync(sibling, target);
      } finally { fs.rmSync(sibling, { force: true }); }
    }
    return store.addAsset(userId, asset);
  } finally { await rm(temporary, { force: true }).catch(() => {}); }
}
