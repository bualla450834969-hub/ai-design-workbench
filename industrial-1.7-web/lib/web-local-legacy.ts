import path from "node:path";
import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { dataRoot } from "@/lib/data-path";
import { isSafeProjectFolderName, projectFilesRoot } from "@/lib/project-files";
import { assetFilePath, cleanMimeType, legacyAssetFilePath, legacyProjectAssetFilePath } from "@/lib/services/local-asset-files";
import type { Asset, GenerationJob, GenerationResult, Message, Project } from "@/types/domain";

const MAX_ASSETS = 500;
const MAX_BYTES = 512 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;
type OwnedProject = Project & { userId: string };
type Snapshot = { projects: Array<[string, OwnedProject]>; assets: Array<[string, Asset[]]>; messages: Array<[string, Message[]]>; jobs: Array<[string, GenerationJob]> };
export type WebLocalLegacyMetadata = { projects: Project[]; assets: Asset[]; messages: Message[]; jobs: GenerationJob[] };
export class WebLocalLegacyError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = "WebLocalLegacyError"; }
}
function fail(message: string, status = 503): never { throw new WebLocalLegacyError(message, status); }
function identifier(value: string) { if (!/^[a-z0-9-]{1,128}$/i.test(value)) fail("迁移资料编号无效", 400); }
function empty(): WebLocalLegacyMetadata { return { projects: [], assets: [], messages: [], jobs: [] }; }
function checkBudget(count: number, size: number) {
  if (count > MAX_ASSETS || !Number.isSafeInteger(size) || size < 0 || size > MAX_BYTES) fail("旧资料超过单次迁移的 500 个素材或 512 MiB 上限，请联系管理员分批迁移。", 413);
}

// Serialized, short-lived read-only connections. This migration path never
// imports DemoStore, takes the writer advisory lock, hydrates jobs or writes SQL.
let queryTail: Promise<unknown> = Promise.resolve();
async function readSnapshot(): Promise<Snapshot | undefined> {
  const connectionString = process.env.WEB_DATABASE_URL?.trim();
  if (!connectionString) return undefined;
  const run = async () => {
    let sql: import("postgres").Sql | undefined;
    try {
      const { default: postgres } = await import("postgres");
      sql = postgres(connectionString, { max: 1, connect_timeout: 5, idle_timeout: 1, prepare: false, onnotice: () => {}, connection: { statement_timeout: 10_000, application_name: "idai-local-legacy-readonly" } });
      return await sql.begin("isolation level repeatable read read only", async (tx) => {
        const [size] = await tx`SELECT octet_length(value::text) AS bytes FROM web_runtime_state WHERE id = 'main'`;
        if (!size || size.bytes === null) return undefined;
        if (!Number.isSafeInteger(Number(size.bytes)) || Number(size.bytes) > MAX_SNAPSHOT_BYTES) fail("旧资料快照过大，请联系管理员分批迁移。", 413);
        const [row] = await tx`SELECT value FROM web_runtime_state WHERE id = 'main'`;
        if (!row || row.value === null) return undefined;
        const value = row.value as Partial<Snapshot>;
        for (const field of ["projects", "assets", "messages", "jobs"] as const) if (!Array.isArray(value[field])) fail("旧资料快照格式异常，原资料已保留。");
        return value as Snapshot;
      });
    } catch (error) {
      if (error instanceof WebLocalLegacyError) throw error;
      // Driver messages can contain connection URLs, SQL and credentials.
      fail("旧资料数据库暂时不可读取，请稍后重试；原资料未改动。");
    } finally { await sql?.end({ timeout: 1 }).catch(() => undefined); }
  };
  const result = queryTail.then(run, run); queryTail = result.catch(() => undefined); return result;
}

const credential = /^(?:providers?|webProviderSnapshot|webTasks?|payload|(?:(?:api|client)[_-]?)?(?:keys?|secrets?)|(?:(?:access|refresh|license)[_-]?)?tokens?|passwords?|credentials?|authorization|sessions?|cookies?|webLicenseBindingId|licenses?|licenseId|licenseToken|deviceId|__proto__|constructor|prototype)$/i;
function safeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeValue);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) if (!credential.test(key)) result[key] = safeValue(item);
    return result;
  }
  return value;
}
function pick<T>(value: unknown, keys: string[]): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("旧资料记录格式异常，原资料已保留。");
  const result: Record<string, unknown> = {};
  for (const key of keys) if (Object.hasOwn(value, key)) result[key] = safeValue((value as Record<string, unknown>)[key]);
  return result as T;
}
function entries<T>(value: unknown): Array<[string, T]> {
  if (!Array.isArray(value) || value.some((row) => !Array.isArray(row) || row.length !== 2 || typeof row[0] !== "string")) fail("旧资料索引格式异常，原资料已保留。");
  return value as Array<[string, T]>;
}
const assetFields = ["id", "projectId", "name", "type", "size", "role", "origin", "tags", "createdAt", "sha256", "favorite", "note", "nativeWidth", "nativeHeight", "exportWidth", "exportHeight", "upscaled", "annotationData"];
const projectFields = ["id", "name", "folderName", "description", "updatedAt", "activeAgentId", "canvas", "workspaceState"];
const generationFields = ["jobId", "status", "provider", "model", "prompt", "requestSnapshot", "note", "direction", "requestedCount", "deliveredCount", "savedCount", "startedAt", "completedAt", "durationMs", "billingEstimate", "settingsSnapshot", "designPlan", "designAnalysis", "variants"];
const messageFields = ["id", "jobId", "projectId", "role", "content", "createdAt", "agentId"];
const jobFields = ["id", "userId", "projectId", "agentId", "status", "progress", "stage", "stageLabel", "estimatedRemainingSeconds", "completedOutputs", "totalOutputs", "prompt", "selectedAssetIds", "error", "createdAt", "updatedAt", "idempotencyKey"];
function selectOwned(snapshot: Snapshot, userId: string) {
  identifier(userId);
  const projects = entries<OwnedProject>(snapshot.projects).filter(([key, project]) => {
    if (!project || typeof project !== "object") fail("旧项目记录格式异常。");
    if (project.userId !== userId) return false;
    identifier(key); identifier(project.id);
    if (project.id !== key) fail("旧项目编号与索引不一致。");
    return true;
  }).map(([, project]) => project);
  const projectIds = new Set(projects.map((project) => project.id));
  if (projectIds.size !== projects.length) fail("旧项目编号重复。");
  const assetRows = entries<Asset[]>(snapshot.assets), assets: Asset[] = [], allOwners = new Map<string, string>();
  for (const [projectId, rows] of assetRows) {
    if (!Array.isArray(rows)) fail("旧素材索引格式异常。");
    for (const asset of rows) {
      if (!asset || typeof asset !== "object" || typeof asset.id !== "string") fail("旧素材记录格式异常。");
      if (allOwners.has(asset.id)) fail("旧素材编号重复，无法安全迁移。");
      allOwners.set(asset.id, projectId);
      if (!projectIds.has(projectId)) continue;
      identifier(asset.id); identifier(asset.projectId);
      if (asset.projectId !== projectId || typeof asset.type !== "string" || typeof asset.name !== "string" || !Number.isSafeInteger(asset.size) || asset.size < 0) fail("旧素材所属项目或格式异常。");
      assets.push(asset);
    }
  }
  checkBudget(assets.length, assets.reduce((sum, asset) => sum + asset.size, 0));
  const messages: Message[] = [];
  for (const [projectId, rows] of entries<Message[]>(snapshot.messages)) {
    if (!projectIds.has(projectId)) continue;
    if (!Array.isArray(rows)) fail("旧消息索引格式异常。");
    for (const message of rows) { if (!message || message.projectId !== projectId) fail("旧消息所属项目异常。"); identifier(message.id); messages.push(message); }
  }
  const jobs = entries<GenerationJob>(snapshot.jobs).filter(([key, job]) => {
    if (!job || typeof job !== "object" || job.userId !== userId || !projectIds.has(job.projectId)) return false;
    identifier(job.id); if (key !== job.id) fail("旧任务编号与索引不一致。"); return true;
  }).map(([, job]) => job);
  return { projects, assets, messages, jobs, assetOwners: allOwners };
}
function sanitizeOwned(owned: ReturnType<typeof selectOwned>, userId: string): WebLocalLegacyMetadata {
  const assetsById = new Map(owned.assets.map((asset) => [asset.id, asset]));
  const cleanAsset = (asset: Asset, projectId: string): Asset => {
    if (!asset || asset.projectId !== projectId) fail("旧记录包含其他项目的素材。");
    identifier(asset.id); identifier(asset.projectId);
    if (owned.assetOwners.has(asset.id) && owned.assetOwners.get(asset.id) !== projectId) fail("旧记录素材归属异常。");
    const canonical = assetsById.get(asset.id);
    if (canonical && canonical.projectId !== projectId) fail("旧记录素材归属异常。");
    const clean = pick<Asset>(canonical || asset, assetFields);
    clean.url = `browser-local:${clean.id}`;
    if (clean.annotationData) {
      try {
        const input = JSON.parse(clean.annotationData) as { version: number; sourceAssetId: string; shapes: unknown[] };
        identifier(input.sourceAssetId);
        if (input.version !== 1 || !Array.isArray(input.shapes) || (owned.assetOwners.has(input.sourceAssetId) && owned.assetOwners.get(input.sourceAssetId) !== projectId)) fail("旧标注格式或归属异常。");
        clean.annotationData = JSON.stringify({ version: 1, sourceAssetId: input.sourceAssetId, shapes: input.shapes.map((shape) => pick(shape, ["id", "type", "color", "strokeSize", "x1", "y1", "x2", "y2", "points", "text", "fontSize", "textWidth"])) });
      } catch { fail("旧标注格式或归属异常。"); }
    }
    return clean;
  };
  const cleanGeneration = (generation: GenerationResult | undefined, projectId: string) => {
    if (!generation) return undefined;
    const clean = pick<GenerationResult>(generation, generationFields);
    clean.imageAssets = (generation.imageAssets || []).map((asset) => cleanAsset(asset, projectId)); clean.imageUrls = clean.imageAssets.map((asset) => asset.url);
    if (clean.status === "queued" || clean.status === "running") clean.status = "failed";
    return clean;
  };
  const projects = owned.projects.map((project) => {
    const clean = pick<Project>(project, projectFields);
    const cover = owned.assets.find((asset) => asset.projectId === project.id && (project.cover === asset.id || project.cover === asset.url));
    if (cover) clean.cover = `browser-local:${cover.id}`;
    return clean;
  });
  const assets = owned.assets.map((asset) => cleanAsset(asset, asset.projectId));
  const messages = owned.messages.map((message) => { const clean = pick<Message>(message, messageFields); clean.assets = (message.assets || []).map((asset) => cleanAsset(asset, message.projectId)); clean.generation = cleanGeneration(message.generation, message.projectId); return clean; });
  const jobs = owned.jobs.map((job) => {
    const clean = pick<GenerationJob>(job, jobFields); clean.userId = userId; clean.inputAssets = (job.inputAssets || []).map((asset) => cleanAsset(asset, job.projectId)); clean.result = cleanGeneration(job.result, job.projectId); clean.recoveryAvailable = false;
    if (clean.status === "queued" || clean.status === "running") { clean.status = "failed"; clean.stage = "completed"; clean.error = "旧云端任务仅迁移历史记录，不会在浏览器中自动重试。"; delete clean.estimatedRemainingSeconds; }
    return clean;
  });
  const result = { projects, assets, messages, jobs };
  if (Buffer.byteLength(JSON.stringify(result)) > MAX_METADATA_BYTES) fail("旧资料元数据超过 16 MiB，请联系管理员分批迁移。", 413);
  return result;
}
function samePath(left: string, right: string) { return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right; }
function inside(root: string, target: string) { const relative = path.relative(root, target); return relative !== "" && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative); }
type ResolvedFile = { path: string; size: number };
async function locateFile(asset: Asset, project: OwnedProject): Promise<ResolvedFile> {
  // Only the owning project's trusted folder may select a current-format path.
  // Ignore an asset's own projectFolder field, which might be stale or forged.
  const folder = project.folderName || project.id;
  if (!isSafeProjectFolderName(folder)) fail("旧项目文件夹记录无效，无法安全迁移。");
  const safeAsset = { ...asset, projectFolder: folder };
  const roots = [...new Set([path.resolve(dataRoot()), path.resolve(projectFilesRoot())])];
  const resolvedRoots = await Promise.all(roots.map(async (root) => ({ root, real: await realpath(root).catch(() => undefined) })));
  for (const candidate of [assetFilePath(safeAsset), legacyProjectAssetFilePath(safeAsset), legacyAssetFilePath(safeAsset)]) {
    const target = path.resolve(candidate);
    if (!roots.some((root) => inside(root, target))) fail("旧素材路径不安全。");
    let actual: string;
    try { actual = await realpath(/* turbopackIgnore: true */ target); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; fail("旧素材文件暂时无法读取。"); }
    if (!resolvedRoots.some(({ root, real }) => real && inside(root, target) && samePath(actual, path.resolve(real, path.relative(root, target))))) fail("旧素材路径包含不安全的重定向。");
    const info = await stat(/* turbopackIgnore: true */ actual);
    if (!info.isFile()) fail("旧素材不是普通文件。");
    checkBudget(1, info.size); return { path: actual, size: info.size };
  }
  fail("部分旧素材原文件已缺失，请保留旧资料并联系管理员处理。", 422);
}
async function loadOwned(userId: string) {
  identifier(userId);
  const snapshot = await readSnapshot();
  if (!snapshot) return undefined;
  const owned = selectOwned(snapshot, userId), files = new Map<string, ResolvedFile>(), projects = new Map(owned.projects.map((project) => [project.id, project]));
  if (owned.assets.length && !process.env.IDAI_DATA_DIR?.trim()) fail("旧资料私有目录尚未配置，无法安全迁移。");
  let size = 0;
  for (const asset of owned.assets) { const file = await locateFile(asset, projects.get(asset.projectId)!); size += file.size; checkBudget(files.size + 1, size); files.set(asset.id, file); }
  return { owned, files };
}

export async function readWebLocalLegacyMetadata(userId: string): Promise<WebLocalLegacyMetadata> {
  const loaded = await loadOwned(userId);
  if (!loaded) return empty();
  const result = sanitizeOwned(loaded.owned, userId);
  for (const asset of result.assets) asset.size = loaded.files.get(asset.id)!.size;
  return result;
}

export async function readWebLocalLegacyAsset(userId: string, assetId: string) {
  identifier(userId); identifier(assetId);
  const loaded = await loadOwned(userId), asset = loaded?.owned.assets.find((asset) => asset.id === assetId), file = loaded?.files.get(assetId);
  if (!asset || !file) fail("旧素材不存在或不属于当前授权用户。", 404);
  const handle = await open(/* turbopackIgnore: true */ file.path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size !== file.size) fail("旧素材在读取时发生变化，请重新导入。", 409);
    const mime = cleanMimeType(asset.type);
    return { stream: Readable.toWeb(handle.createReadStream({ autoClose: true })) as ReadableStream<Uint8Array>, size: info.size, type: /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mime) ? mime : "application/octet-stream", name: Buffer.from(asset.name.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 512)).toString("utf8") };
  } catch (error) { await handle.close(); throw error; }
}
