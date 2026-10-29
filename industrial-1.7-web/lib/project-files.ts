import fs from "node:fs";
import path from "node:path";
import { dataPath } from "@/lib/data-path";

export const PROJECT_RESULTS_FOLDER = "成果图";
export const PROJECT_UPLOADS_FOLDER = "参考素材";
export const DELETED_PROJECT_RESULTS_FOLDER = "已删除项目成果";
export const PROJECT_RECYCLE_FOLDER = ".idai-recycle-bin";

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

export function projectFilesRoot() {
  const configured = process.env.IDAI_PROJECTS_DIR?.trim();
  return configured ? path.resolve(configured) : dataPath("projects");
}

export function cleanProjectFolderName(value: string) {
  let cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 48)
    .trim()
    .replace(/[. ]+$/g, "");
  if (!cleaned) cleaned = "未命名项目";
  if (WINDOWS_RESERVED_NAMES.test(cleaned)) cleaned = `设计项目-${cleaned}`;
  if ([DELETED_PROJECT_RESULTS_FOLDER, PROJECT_RECYCLE_FOLDER].some((name) => name.toLowerCase() === cleaned.toLowerCase())) cleaned = `设计项目-${cleaned}`;
  return cleaned;
}

export function recycleProjectDirectory(id: string) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error("回收站编号无效");
  const root = path.resolve(projectFilesRoot(), PROJECT_RECYCLE_FOLDER);
  const target = path.resolve(root, id);
  if (path.dirname(target) !== root) throw new Error("回收站路径无效");
  return target;
}

/** Older versions allowed a project to use the archive's reserved name. */
export function migrateReservedProjectDirectory(fromFolder: string, toFolder: string) {
  if (![DELETED_PROJECT_RESULTS_FOLDER, PROJECT_RECYCLE_FOLDER].includes(fromFolder)) return false;
  const source = path.resolve(projectFilesRoot(), fromFolder);
  const target = projectDirectory(toFolder);
  fs.mkdirSync(target, { recursive: true });
  // Move this project's own files, leaving unrelated archived results protected.
  for (const folder of [PROJECT_RESULTS_FOLDER, PROJECT_UPLOADS_FOLDER]) {
    const previous = path.join(/* turbopackIgnore: true */ source, folder);
    if (fs.existsSync(/* turbopackIgnore: true */ previous)) fs.renameSync(/* turbopackIgnore: true */ previous, path.join(/* turbopackIgnore: true */ target, folder));
  }
  return true;
}

export function isSafeProjectFolderName(value: string) {
  return Boolean(value)
    && value === cleanProjectFolderName(value)
    && value !== "."
    && value !== "..";
}

export function projectDirectory(folderName: string) {
  if (!isSafeProjectFolderName(folderName)) throw new Error("项目文件夹名称无效");
  const root = path.resolve(projectFilesRoot());
  const target = path.resolve(root, folderName);
  if (path.dirname(target).toLowerCase() !== root.toLowerCase()) throw new Error("项目文件夹路径无效");
  return target;
}

export function moveProjectDirectory(fromFolder: string, toFolder: string) {
  if (fromFolder === toFolder) return;
  const source = projectDirectory(fromFolder);
  const target = projectDirectory(toFolder);
  if (fs.existsSync(target)) throw new Error("目标项目文件夹已经存在");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (fs.existsSync(source)) fs.renameSync(source, target);
  else fs.mkdirSync(target, { recursive: true });
}

export function migrateLegacyProjectAssetFolders(folderName: string) {
  const directory = projectDirectory(folderName);
  let changed = false;
  for (const [legacy, current] of [["results", PROJECT_RESULTS_FOLDER], ["uploads", PROJECT_UPLOADS_FOLDER]]) {
    const source = path.join(/* turbopackIgnore: true */ directory, legacy);
    const target = path.join(/* turbopackIgnore: true */ directory, current);
    if (fs.existsSync(/* turbopackIgnore: true */ source) && !fs.existsSync(/* turbopackIgnore: true */ target)) { fs.renameSync(/* turbopackIgnore: true */ source, /* turbopackIgnore: true */ target); changed = true; }
  }
  return changed;
}

export function preserveProjectResultsBeforeDelete(folderName: string, projectName: string) {
  const sourceProject = projectDirectory(folderName);
  const sourceResults = path.resolve(sourceProject, PROJECT_RESULTS_FOLDER);
  if (!fs.existsSync(sourceResults) || !fs.readdirSync(sourceResults).length) return null;
  const root = path.resolve(projectFilesRoot());
  const archiveRoot = path.resolve(root, DELETED_PROJECT_RESULTS_FOLDER);
  if (path.dirname(archiveRoot).toLowerCase() !== root.toLowerCase()) throw new Error("成果归档路径无效");
  fs.mkdirSync(archiveRoot, { recursive: true });
  const base = cleanProjectFolderName(projectName);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let target = path.resolve(archiveRoot, `${base}-${stamp}`);
  let index = 2;
  while (fs.existsSync(target)) {
    target = path.resolve(archiveRoot, `${base}-${stamp}-${index}`);
    index += 1;
  }
  if (path.dirname(target).toLowerCase() !== archiveRoot.toLowerCase()) throw new Error("成果归档目标无效");
  fs.renameSync(sourceResults, target);
  return target;
}
