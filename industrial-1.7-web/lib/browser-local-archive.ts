import type { Asset, GenerationJob, GenerationResult, Message, Project } from "@/types/domain";
import type { BrowserRecycledProject, BrowserWorkspaceState, BrowserWorkspaceStore } from "@/lib/browser-local-store";
import { projectResultDisplayEntries } from "@/lib/project-results";

export const MAX_BROWSER_ARCHIVE_BYTES = 512 * 1024 * 1024;
export const MAX_BROWSER_ARCHIVE_ASSETS = 500;
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const MANIFEST = "workspace.json";
const FORMAT = "idai-browser-workspace";
const LOCAL_ASSET_PREFIX = "browser-local:";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
type Entry = { name: string; blob: Blob };
type BackupJob = Omit<GenerationJob, "userId">;
type BackupRecycle = Omit<BrowserRecycledProject, "jobs"> & { jobs: BackupJob[] };
type BackupWorkspace = { profileName: string; projects: Project[]; assets: Asset[]; messages: Message[]; jobs: BackupJob[]; recycleBin: BackupRecycle[] };
type Manifest = { format: typeof FORMAT; version: 1; exportedAt: string; workspace: BackupWorkspace; blobs: { assetId: string; path: string; type: string; size: number }[] };
function bad(message = "备份格式无效或已损坏，未导入任何内容。"): never { throw new Error(message); }
function limit() { bad("单次归档最多 500 个素材、合计 512 MiB，请分批导出或导入。"); }
function countAssets(count: number) { if (count > MAX_BROWSER_ARCHIVE_ASSETS) limit(); }
function byteLimit(size: number) { if (!Number.isSafeInteger(size) || size < 0 || size > MAX_BROWSER_ARCHIVE_BYTES) limit(); }

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
async function crc32(blob: Blob) {
  let value = 0xffffffff;
  // Read bounded slices; never materialize the complete ZIP or a large image.
  for (let offset = 0; offset < blob.size; offset += 1024 * 1024) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + 1024 * 1024).arrayBuffer());
    for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function safeName(name: string) {
  if (!name || name.length > 1024 || /[\\:%\u0000-\u001f\u007f]/.test(name) || name.split("/").some((part) => !part || part === "." || part === "..")) bad("ZIP 文件路径不安全，未导入任何内容。");
}
function header(size: number) { const bytes = new Uint8Array(size); return { bytes, view: new DataView(bytes.buffer) }; }
async function buildZip(entries: Entry[]): Promise<Blob> {
  const names = entries.map(({ name }) => { safeName(name); return encoder.encode(name); });
  if (new Set(entries.map((entry) => entry.name)).size !== entries.length) bad();
  let total = 22;
  entries.forEach((entry, index) => { total += entry.blob.size + 76 + names[index].length * 2; });
  byteLimit(total);
  const chunks: BlobPart[] = [], central: BlobPart[] = [];
  let offset = 0, centralSize = 0;
  for (let index = 0; index < entries.length; index++) {
    const { blob } = entries[index], name = names[index], crc = await crc32(blob);
    const local = header(30), directory = header(46);
    local.view.setUint32(0, 0x04034b50, true); local.view.setUint16(4, 20, true); local.view.setUint16(6, 0x800, true); local.view.setUint16(12, 33, true);
    local.view.setUint32(14, crc, true); local.view.setUint32(18, blob.size, true); local.view.setUint32(22, blob.size, true); local.view.setUint16(26, name.length, true);
    directory.view.setUint32(0, 0x02014b50, true); directory.view.setUint16(4, 20, true); directory.view.setUint16(6, 20, true); directory.view.setUint16(8, 0x800, true); directory.view.setUint16(14, 33, true);
    directory.view.setUint32(16, crc, true); directory.view.setUint32(20, blob.size, true); directory.view.setUint32(24, blob.size, true); directory.view.setUint16(28, name.length, true); directory.view.setUint32(42, offset, true);
    chunks.push(local.bytes, name, blob); central.push(directory.bytes, name);
    offset += 30 + name.length + blob.size; centralSize += 46 + name.length;
  }
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, entries.length, true); end.view.setUint16(10, entries.length, true); end.view.setUint32(12, centralSize, true); end.view.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end.bytes], { type: "application/zip" });
}
async function bytesAt(blob: Blob, offset: number, size: number) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > blob.size) bad();
  return new Uint8Array(await blob.slice(offset, offset + size).arrayBuffer());
}
function view(bytes: Uint8Array) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
async function parseZip(blob: Blob): Promise<Map<string, Blob>> {
  byteLimit(blob.size);
  if (blob.size < 22) bad();
  const end = view(await bytesAt(blob, blob.size - 22, 22));
  if (end.getUint32(0, true) !== 0x06054b50 || end.getUint16(4, true) || end.getUint16(6, true) || end.getUint16(20, true)) bad();
  const count = end.getUint16(10, true), directorySize = end.getUint32(12, true), directoryOffset = end.getUint32(16, true);
  if (!count || count !== end.getUint16(8, true) || count > MAX_BROWSER_ARCHIVE_ASSETS + 1 || directoryOffset + directorySize !== blob.size - 22) bad();
  const entries = new Map<string, Blob>();
  let cursor = directoryOffset, expectedOffset = 0, expandedBytes = 0;
  for (let index = 0; index < count; index++) {
    const central = view(await bytesAt(blob, cursor, 46));
    if (cursor + 46 > blob.size - 22 || central.getUint32(0, true) !== 0x02014b50 || central.getUint16(4, true) !== 20 || central.getUint16(6, true) !== 20 || central.getUint16(8, true) !== 0x800 || central.getUint16(10, true) !== 0 || central.getUint16(30, true) || central.getUint16(32, true) || central.getUint16(34, true) || central.getUint16(36, true) || central.getUint32(38, true)) bad("仅支持本应用生成的无压缩 STORE 备份，未导入任何内容。");
    const size = central.getUint32(24, true), nameSize = central.getUint16(28, true), localOffset = central.getUint32(42, true), crc = central.getUint32(16, true);
    if (!nameSize || nameSize > 4096 || size !== central.getUint32(20, true) || localOffset !== expectedOffset || cursor + 46 + nameSize > blob.size - 22) bad();
    expandedBytes += size; byteLimit(expandedBytes);
    let name: string;
    try { name = decoder.decode(await bytesAt(blob, cursor + 46, nameSize)); } catch { bad(); }
    safeName(name);
    if (entries.has(name)) bad("ZIP 包含重复文件，未导入任何内容。");
    const local = view(await bytesAt(blob, localOffset, 30));
    if (local.getUint32(0, true) !== 0x04034b50 || local.getUint16(4, true) !== 20 || local.getUint16(6, true) !== 0x800 || local.getUint16(8, true) || local.getUint16(10, true) !== central.getUint16(12, true) || local.getUint16(12, true) !== central.getUint16(14, true) || local.getUint32(14, true) !== crc || local.getUint32(18, true) !== size || local.getUint32(22, true) !== size || local.getUint16(26, true) !== nameSize || local.getUint16(28, true)) bad();
    const localName = await bytesAt(blob, localOffset + 30, nameSize), encodedName = encoder.encode(name);
    if (encodedName.length !== nameSize || localName.some((byte, offset) => byte !== encodedName[offset])) bad();
    const dataOffset = localOffset + 30 + nameSize;
    if (dataOffset + size > directoryOffset) bad();
    const data = blob.slice(dataOffset, dataOffset + size);
    if (await crc32(data) !== crc) bad("ZIP 校验失败，文件可能损坏，未导入任何内容。");
    entries.set(name, data); expectedOffset = dataOffset + size; cursor += 46 + nameSize;
  }
  if (cursor !== blob.size - 22 || expectedOffset !== directoryOffset) bad();
  return entries;
}

// Whitelists make credentials impossible to copy from future runtime fields.
// Export omits unknown fields; import rejects them instead of silently accepting
// a provider, session, authorization token or unsupported newer schema.
type Rule = (value: unknown, strict: boolean) => unknown;
const str: Rule = (value) => { if (typeof value !== "string") bad(); return value; };
const num: Rule = (value) => { if (typeof value !== "number" || !Number.isFinite(value)) bad(); return value; };
const bool: Rule = (value) => { if (typeof value !== "boolean") bad(); return value; };
const id: Rule = (value, strict) => { str(value, strict); if (!(value as string).trim() || (value as string).length > 512) bad(); return value; };
const enums = (...choices: (string | number)[]): Rule => (value) => { if (!choices.includes(value as string | number)) bad(); return value; };
const list = (rule: Rule): Rule => (value, strict) => { if (!Array.isArray(value)) bad(); return value.map((item) => rule(item, strict)); };
const secretKey = (key: string) => /^(?:providers?|(?:api[_-]?)?keys?|(?:(?:access|refresh|license|client|api)[_-]?)?tokens?|(?:(?:client|api)[_-]?)?secrets?|passwords?|credentials?|authorization|sessions?|cookies?|license(?:s|[_-]?(?:id|token|bindingid))?|webLicenseBindingId|deviceId|userId)$/i.test(key) || key === "__proto__" || key === "constructor" || key === "prototype";
const record = (rule: Rule): Rule => (value, strict) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) bad();
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) { if (secretKey(key)) { if (strict) bad("备份含有凭据或授权字段，未导入任何内容。"); continue; } output[key] = rule(item, strict); }
  return output;
};
function shape(fields: Record<string, Rule>, required: string[]): Rule {
  return (value, strict) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) bad();
    const input = value as Record<string, unknown>, output: Record<string, unknown> = {};
    for (const key of required) if (input[key] === undefined) bad();
    for (const [key, item] of Object.entries(input)) {
      if (item === undefined && !strict) continue;
      if (!Object.hasOwn(fields, key)) { if (strict) bad("备份含有未知字段或凭据，未导入任何内容。"); continue; }
      output[key] = fields[key](item, strict);
    }
    return output;
  };
}
const agent = enums("brief-director", "concept-architect", "appearance-variants", "cmf-colorways", "sketch-envelope", "render-studio", "local-retouch", "multi-view", "detail-view", "free-chat");
const status = enums("queued", "running", "succeeded", "failed", "cancelled");
const resolution = enums("1K", "2K", "4K"), aspect = enums("auto", "1:1", "4:3", "3:4", "16:9", "9:16"), workflow = enums("shape", "view", "cmf", "decal", "scene", "packaging", "detail"), mode = enums("source", "reference", "text", "local");
const scalar: Rule = (value, strict) => typeof value === "string" ? str(value, strict) : typeof value === "boolean" ? bool(value, strict) : Array.isArray(value) ? list(str)(value, strict) : num(value, strict);
const point = shape({ x: num, y: num }, ["x", "y"]);
const annotation = shape({ version: enums(1), sourceAssetId: id, shapes: list(shape({ id, type: enums("freehand", "rectangle", "ellipse", "arrow", "text"), color: str, strokeSize: num, x1: num, y1: num, x2: num, y2: num, points: list(point), text: str, fontSize: num, textWidth: num }, ["id", "type", "color", "strokeSize", "x1", "y1"])) }, ["version", "sourceAssetId", "shapes"]);
const annotationString: Rule = (value, strict) => { str(value, strict); try { return JSON.stringify(annotation(JSON.parse(value as string), strict)); } catch { bad("标注元数据无效，未导入任何内容。"); } };
const assetRule = shape({ id, projectId: id, projectFolder: str, name: str, type: str, size: (v, s) => { num(v, s); if ((v as number) < 0) bad(); return v; }, role: enums("structure", "style", "scene", "annotation", "mask", "result", "brief"), origin: enums("user", "generated", "annotation"), tags: list(str), url: str, createdAt: str, sha256: str, favorite: bool, note: str, localSaveError: str, nativeWidth: num, nativeHeight: num, exportWidth: num, exportHeight: num, upscaled: bool, annotationData: annotationString }, ["id", "projectId", "name", "type", "size", "role", "url", "createdAt"]);
const workspaceRule = shape({ selectedAssets: list(id), agentId: agent, workflowKind: workflow, overallWorkflowKind: workflow, specifiedAngle: str, showDimensions: bool, designDirections: record(str), reconstructionRatio: num, outputCount: num, boardItems: num, resolution, input: str, generationMode: mode, aspectRatio: aspect, workspaceMode: enums("parameter", "free-chat"), freeChatInput: str, freeChatSelectedAssets: list(id), freeResolution: resolution, freeAspectRatio: aspect, freeChatBoardItems: num }, []);
const projectRule = shape({ id, name: str, folderName: str, description: str, updatedAt: str, cover: str, activeAgentId: agent, canvas: shape({ items: list(shape({ assetId: id, x: num, y: num, width: num, height: num }, ["assetId", "x", "y", "width", "height"])), viewport: shape({ x: num, y: num, zoom: num }, ["x", "y", "zoom"]) }, ["items"]), workspaceState: workspaceRule }, ["id", "name", "description", "updatedAt", "activeAgentId"]);
const generationRule = shape({ jobId: id, status, imageUrls: list(str), imageAssets: list(assetRule), provider: str, model: str, prompt: str, requestSnapshot: shape({ endpoint: enums("/api/messages", "/api/free-chat"), content: str, agentId: agent, assetIds: list(id), settings: record(scalar), resolution, aspectRatio: aspect, boardItems: num, showDimensions: bool }, ["endpoint", "content", "assetIds"]), note: str, direction: str, requestedCount: num, deliveredCount: num, savedCount: num, startedAt: str, completedAt: str, durationMs: num, billingEstimate: shape({ textModel: str, imageModel: str, textCost: num, imageUnitCost: num, imageCost: num, totalCost: num, baseImageUnitCost: num, textAnalysisCalls: num, currency: enums("CNY") }, ["textModel", "imageModel", "currency"]), settingsSnapshot: shape({ agentId: agent, workflowKind: workflow, specifiedAngle: str, showDimensions: bool, designDirections: record(str), reconstructionRatio: num, direction: str, resolution, outputCount: num, boardItems: num, generationMode: mode, aspectRatio: aspect, sourceAssetIds: list(id), referenceAssetIds: list(id) }, ["reconstructionRatio", "direction", "resolution", "outputCount", "sourceAssetIds", "referenceAssetIds"]), designPlan: shape({ productCategory: str, coreFunctions: list(str), mandatoryConstraints: list(str), mutableFeatures: list(str) }, ["productCategory", "coreFunctions", "mandatoryConstraints", "mutableFeatures"]), designAnalysis: str, variants: list(shape({ index: num, assetId: id, designRoute: str, prompt: str, seed: (v, s) => typeof v === "string" ? str(v, s) : num(v, s) }, ["index", "designRoute"])) }, ["jobId", "status", "imageUrls", "provider", "model", "prompt"]);
const messageRule = shape({ id, jobId: id, projectId: id, role: enums("user", "assistant", "system"), content: str, createdAt: str, agentId: agent, assets: list(assetRule), generation: generationRule }, ["id", "projectId", "role", "content", "createdAt"]);
const jobRule = shape({ id, projectId: id, agentId: agent, status, progress: num, stage: enums("queued", "analyzing", "planning", "generating", "saving", "completed"), stageLabel: str, estimatedRemainingSeconds: num, completedOutputs: num, totalOutputs: num, prompt: str, inputAssets: list(assetRule), selectedAssetIds: list(id), result: generationRule, error: str, createdAt: str, updatedAt: str, idempotencyKey: id, recoveryAvailable: bool }, ["id", "projectId", "agentId", "status", "progress", "prompt", "inputAssets", "createdAt", "updatedAt", "idempotencyKey"]);
const backupRule = shape({ profileName: str, projects: list(projectRule), assets: list(assetRule), messages: list(messageRule), jobs: list(jobRule), recycleBin: list(shape({ id, deletedAt: str, project: projectRule, assets: list(assetRule), messages: list(messageRule), jobs: list(jobRule) }, ["id", "deletedAt", "project", "assets", "messages", "jobs"])) }, ["profileName", "projects", "assets", "messages", "jobs", "recycleBin"]);
const manifestRule = shape({ format: enums(FORMAT), version: enums(1), exportedAt: str, workspace: backupRule, blobs: list(shape({ assetId: id, path: str, type: str, size: num }, ["assetId", "path", "type", "size"])) }, ["format", "version", "exportedAt", "workspace", "blobs"]);
function allAssets(workspace: BackupWorkspace) { return [...workspace.assets, ...workspace.recycleBin.flatMap((record) => record.assets)]; }
function scopes(workspace: BackupWorkspace) {
  return [{ projects: workspace.projects, assets: workspace.assets, messages: workspace.messages, jobs: workspace.jobs }, ...workspace.recycleBin.map((record) => ({ projects: [record.project], assets: record.assets, messages: record.messages, jobs: record.jobs }))];
}
function validateLinks(workspace: BackupWorkspace) {
  const projects = new Set<string>(), assets = new Map<string, string>(), messages = new Set<string>(), jobs = new Map<string, string>(), trash = new Set<string>();
  const unique = (id: string, values: Set<string>) => { if (values.has(id)) bad(); values.add(id); };
  for (const scope of scopes(workspace)) {
    scope.projects.forEach((project) => unique(project.id, projects));
    const scopeIds = new Set(scope.projects.map((project) => project.id));
    for (const asset of scope.assets) { if (!scopeIds.has(asset.projectId) || assets.has(asset.id)) bad(); assets.set(asset.id, asset.projectId); }
    for (const message of scope.messages) { if (!scopeIds.has(message.projectId)) bad(); unique(message.id, messages); }
    for (const job of scope.jobs) { if (!scopeIds.has(job.projectId) || jobs.has(job.id)) bad(); jobs.set(job.id, job.projectId); }
  }
  for (const record of workspace.recycleBin) unique(record.id, trash);
  const checkIds = (ids: string[] | undefined, projectId: string) => { for (const id of ids || []) if (assets.has(id) && assets.get(id) !== projectId) bad(); };
  const checkAssets = (items: Asset[] | undefined, projectId: string) => { for (const asset of items || []) { if (asset.projectId !== projectId || (assets.has(asset.id) && assets.get(asset.id) !== projectId)) bad(); if (asset.annotationData) checkIds([(JSON.parse(asset.annotationData) as { sourceAssetId: string }).sourceAssetId], projectId); } };
  const checkJobId = (id: string | undefined, projectId: string) => { if (id && jobs.has(id) && jobs.get(id) !== projectId) bad(); };
  const checkResult = (result: GenerationResult | undefined, projectId: string) => { if (result) { checkJobId(result.jobId, projectId); checkAssets(result.imageAssets, projectId); checkIds(result.requestSnapshot?.assetIds, projectId); checkIds(result.settingsSnapshot?.sourceAssetIds, projectId); checkIds(result.settingsSnapshot?.referenceAssetIds, projectId); checkIds(result.variants?.flatMap((variant) => variant.assetId ? [variant.assetId] : []), projectId); } };
  for (const scope of scopes(workspace)) {
    for (const project of scope.projects) { checkIds(project.canvas?.items.map((item) => item.assetId), project.id); checkIds(project.workspaceState?.selectedAssets, project.id); checkIds(project.workspaceState?.freeChatSelectedAssets, project.id); if (project.cover?.startsWith(LOCAL_ASSET_PREFIX)) checkIds([project.cover.slice(LOCAL_ASSET_PREFIX.length)], project.id); }
    for (const message of scope.messages) { checkJobId(message.jobId, message.projectId); checkAssets(message.assets, message.projectId); checkResult(message.generation, message.projectId); }
    for (const job of scope.jobs) { checkAssets(job.inputAssets, job.projectId); checkIds(job.selectedAssetIds, job.projectId); checkResult(job.result, job.projectId); }
    for (const asset of scope.assets) if (asset.annotationData) checkIds([(JSON.parse(asset.annotationData) as { sourceAssetId: string }).sourceAssetId], asset.projectId);
  }
}
async function collectBlobs(store: BrowserWorkspaceStore, assets: Asset[]) {
  countAssets(assets.length);
  let total = 0;
  const blobs = new Map<string, Blob>();
  for (const asset of assets) {
    const blob = await store.getBlob(asset.id, asset.projectId);
    if (!blob) bad("部分素材尚未保存在当前浏览器，请先补齐本地文件再导出；本次没有请求服务器或模型。");
    total += blob.size; byteLimit(total); blobs.set(asset.id, blob);
  }
  return blobs;
}
async function unchanged(store: BrowserWorkspaceStore, revision: number) {
  if ((await store.getState()).revision !== revision) bad("导出期间工作区发生变化，请稍后重新导出以获得完整备份。");
}

export async function exportLocalProjectImages(store: BrowserWorkspaceStore, projectId: string, options: { assetIds?: string[]; favoritesOnly?: boolean } = {}): Promise<Blob> {
  const state = await store.getState();
  if (!state.projects.some((project) => project.id === projectId)) bad("项目不存在，无法导出。");
  const entries = projectResultDisplayEntries(state.assets.filter((asset) => asset.projectId === projectId));
  const requested = options.assetIds ? new Set(options.assetIds) : undefined;
  if (requested && [...requested].some((id) => !entries.some((entry) => entry.asset.id === id))) bad("所选成果不属于此项目，请重新选择。");
  const selected = entries.filter(({ asset }) => (!requested || requested.has(asset.id)) && (!options.favoritesOnly || asset.favorite));
  if (!selected.length) bad("没有可导出的成果图。");
  const blobs = await collectBlobs(store, selected.map((entry) => entry.asset));
  await unchanged(store, state.revision);
  return buildZip(selected.map(({ asset, displayName }) => ({ name: `图片/${displayName}`, blob: blobs.get(asset.id)! })));
}

export async function exportLocalWorkspaceBackup(store: BrowserWorkspaceStore): Promise<Blob> {
  const state = await store.getState();
  const workspace = backupRule(state, false) as BackupWorkspace;
  validateLinks(workspace);
  const assets = allAssets(workspace), blobs = await collectBlobs(store, assets);
  const records = assets.map((asset, index) => {
    const blob = blobs.get(asset.id)!;
    // Object URLs, signed supplier links and stale server paths are not portable.
    asset.url = `${LOCAL_ASSET_PREFIX}${asset.id}`; asset.size = blob.size;
    return { assetId: asset.id, path: `assets/${String(index + 1).padStart(4, "0")}.bin`, type: asset.type, size: blob.size };
  });
  for (const scope of scopes(workspace)) {
    const cleanAssets = (items: Asset[] | undefined) => { for (const asset of items || []) asset.url = `${LOCAL_ASSET_PREFIX}${asset.id}`; };
    const cleanResult = (result: GenerationResult | undefined) => { if (result) { cleanAssets(result.imageAssets); result.imageUrls = (result.imageAssets || []).map((asset) => asset.url); } };
    const originalAssets = [...state.assets, ...state.recycleBin.flatMap((record) => record.assets)];
    for (const project of scope.projects) if (project.cover) { const match = scope.assets.find((asset) => asset.projectId === project.id && (asset.id === project.cover || originalAssets.find((original) => original.id === asset.id)?.url === project.cover)); if (match) project.cover = `${LOCAL_ASSET_PREFIX}${match.id}`; else delete project.cover; }
    for (const message of scope.messages) { cleanAssets(message.assets); cleanResult(message.generation); }
    for (const job of scope.jobs) { cleanAssets(job.inputAssets); cleanResult(job.result); }
  }
  const manifest: Manifest = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), workspace, blobs: records };
  const meta = new Blob([JSON.stringify(manifest)], { type: "application/json" });
  if (meta.size > MAX_MANIFEST_BYTES) bad("备份元数据超过 16 MiB，请先精简历史记录后重试。");
  await unchanged(store, state.revision);
  return buildZip([{ name: MANIFEST, blob: meta }, ...records.map((record) => ({ name: record.path, blob: blobs.get(record.assetId)! }))]);
}

function remap(workspace: BackupWorkspace, userId: string) {
  const projectIds = new Map<string, string>(), assetIds = new Map<string, string>(), jobIds = new Map<string, string>();
  const canonicalAssets = new Map(allAssets(workspace).map((asset) => [asset.id, { ...asset }]));
  const fresh = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
  const mapped = (map: Map<string, string>, old: string, prefix: string) => { if (!map.has(old)) map.set(old, fresh(prefix)); return map.get(old)!; };
  for (const scope of scopes(workspace)) for (const project of scope.projects) projectIds.set(project.id, fresh("project"));
  const assetId = (old: string, projectId: string) => mapped(assetIds, JSON.stringify([projectId, old]), "asset");
  const mapAsset = (asset: Asset, oldProjectId: string) => {
    const canonical = canonicalAssets.get(asset.id);
    // Historical roles/tags can differ, but a nested snapshot cannot forge the
    // identity, MIME or size of the canonical local bytes it references.
    if (canonical) { asset.type = canonical.type; asset.size = canonical.size; asset.name = canonical.name; }
    asset.id = assetId(asset.id, oldProjectId); asset.projectId = projectIds.get(oldProjectId)!; asset.url = `${LOCAL_ASSET_PREFIX}${asset.id}`;
    if (asset.annotationData) { const data = JSON.parse(asset.annotationData) as { sourceAssetId: string }; data.sourceAssetId = assetId(data.sourceAssetId, oldProjectId); asset.annotationData = JSON.stringify(data); }
  };
  const mapResult = (result: GenerationResult | undefined, oldProjectId: string) => {
    if (!result) return;
    result.jobId = mapped(jobIds, result.jobId, "job");
    if (result.status === "queued" || result.status === "running") result.status = "failed";
    result.imageAssets?.forEach((asset) => mapAsset(asset, oldProjectId));
    result.imageUrls = (result.imageAssets || []).map((asset) => asset.url);
    if (result.requestSnapshot) result.requestSnapshot.assetIds = result.requestSnapshot.assetIds.map((id) => assetId(id, oldProjectId));
    if (result.settingsSnapshot) { result.settingsSnapshot.sourceAssetIds = result.settingsSnapshot.sourceAssetIds.map((id) => assetId(id, oldProjectId)); result.settingsSnapshot.referenceAssetIds = result.settingsSnapshot.referenceAssetIds.map((id) => assetId(id, oldProjectId)); }
    result.variants?.forEach((variant) => { if (variant.assetId) variant.assetId = assetId(variant.assetId, oldProjectId); });
  };
  for (const scope of scopes(workspace)) {
    for (const project of scope.projects) {
      const oldId = project.id; project.id = projectIds.get(oldId)!;
      if (project.cover?.startsWith(LOCAL_ASSET_PREFIX)) project.cover = `${LOCAL_ASSET_PREFIX}${assetId(project.cover.slice(LOCAL_ASSET_PREFIX.length), oldId)}`; else delete project.cover;
      project.canvas?.items.forEach((item) => { item.assetId = assetId(item.assetId, oldId); });
      if (project.workspaceState?.selectedAssets) project.workspaceState.selectedAssets = project.workspaceState.selectedAssets.map((id) => assetId(id, oldId));
      if (project.workspaceState?.freeChatSelectedAssets) project.workspaceState.freeChatSelectedAssets = project.workspaceState.freeChatSelectedAssets.map((id) => assetId(id, oldId));
    }
    for (const asset of scope.assets) mapAsset(asset, asset.projectId);
    for (const message of scope.messages) {
      const oldId = message.projectId; message.id = fresh("message"); message.projectId = projectIds.get(oldId)!;
      if (message.jobId) message.jobId = mapped(jobIds, message.jobId, "job");
      message.assets?.forEach((asset) => mapAsset(asset, oldId)); mapResult(message.generation, oldId);
    }
    for (const job of scope.jobs) {
      const oldId = job.projectId; job.id = mapped(jobIds, job.id, "job"); job.projectId = projectIds.get(oldId)!;
      job.inputAssets.forEach((asset) => mapAsset(asset, oldId));
      if (job.selectedAssetIds) job.selectedAssetIds = job.selectedAssetIds.map((id) => assetId(id, oldId));
      mapResult(job.result, oldId); job.idempotencyKey = fresh("import"); job.recoveryAvailable = false;
      if (job.status === "queued" || job.status === "running") { job.status = "failed"; job.stage = "completed"; job.stageLabel = "备份导入后已中断"; job.error = "从本地备份导入，原进行中任务已中断；请手动重新生成。"; delete job.estimatedRemainingSeconds; }
      (job as GenerationJob).userId = userId;
    }
  }
  for (const record of workspace.recycleBin) record.id = fresh("trash");
  return { assetIds, projectIds };
}

export async function importLocalWorkspaceBackup(store: BrowserWorkspaceStore, blob: Blob): Promise<{ projects: number; assets: number }> {
  const entries = await parseZip(blob), meta = entries.get(MANIFEST);
  if (!meta || meta.size > MAX_MANIFEST_BYTES) bad();
  let manifest: Manifest;
  try {
    const raw = JSON.parse(decoder.decode(await meta.arrayBuffer()));
    // Check the asset budget before cloning and validating potentially large
    // arrays. The ZIP entry limit independently bounds materialized files.
    if (Array.isArray(raw?.blobs)) countAssets(raw.blobs.length);
    if (Array.isArray(raw?.workspace?.assets) && Array.isArray(raw?.workspace?.recycleBin)) {
      let count = raw.workspace.assets.length;
      for (const record of raw.workspace.recycleBin) { if (Array.isArray(record?.assets)) count += record.assets.length; countAssets(count); }
      countAssets(count);
    }
    manifest = manifestRule(raw, true) as Manifest;
  } catch (error) { if (error instanceof Error && (error.message.includes("备份") || error.message.includes("512 MiB"))) throw error; bad(); }
  const workspace = manifest.workspace, assets = allAssets(workspace);
  countAssets(assets.length); validateLinks(workspace);
  if (manifest.blobs.length !== assets.length || entries.size !== assets.length + 1) bad();
  const originalAssets = new Map(assets.map((asset) => [asset.id, { projectId: asset.projectId, type: asset.type, size: asset.size }]));
  const bytes = new Map<string, Blob>(), paths = new Set<string>();
  for (const record of manifest.blobs) {
    const asset = originalAssets.get(record.assetId), entry = entries.get(record.path);
    if (!/^assets\/\d{4}\.bin$/.test(record.path) || paths.has(record.path) || bytes.has(record.assetId) || !asset || !entry || entry.size !== record.size || record.size !== asset.size || record.type !== asset.type) bad();
    paths.add(record.path); bytes.set(record.assetId, entry.slice(0, entry.size, record.type));
  }
  const counts = { projects: workspace.projects.length + workspace.recycleBin.length, assets: assets.length };
  const { assetIds } = remap(workspace, store.userId);
  // All parsing, CRCs, schema checks and Blob creation finish before opening the
  // single write transaction. Existing projects and providers are never replaced.
  await store.update((state, changes) => {
    state.projects.push(...workspace.projects); state.assets.push(...workspace.assets); state.messages.push(...workspace.messages); state.jobs.push(...workspace.jobs as GenerationJob[]); state.recycleBin.push(...workspace.recycleBin as BrowserRecycledProject[]);
    if (!state.profileName) state.profileName = workspace.profileName;
    for (const [oldId, original] of originalAssets) changes.putBlob(assetIds.get(JSON.stringify([original.projectId, oldId]))!, bytes.get(oldId)!);
  });
  return counts;
}
