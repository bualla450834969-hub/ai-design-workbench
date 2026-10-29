import { appPath } from "@/lib/app-path";
import { createBrowserAbort, type BrowserAbortScope } from "@/lib/browser-abort";
import { exportLocalWorkspaceBackup, importLocalWorkspaceBackup, MAX_BROWSER_ARCHIVE_ASSETS, MAX_BROWSER_ARCHIVE_BYTES } from "@/lib/browser-local-archive";
import type { BrowserWorkspaceState, BrowserWorkspaceStore } from "@/lib/browser-local-store";
import type { Asset, GenerationJob, GenerationResult, Message, Project } from "@/types/domain";

const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const AUTH_PATH = "/api/web/auth/status";
const LEGACY_PATH = "/api/web/local-legacy";
const running = new WeakSet<BrowserWorkspaceStore>();
const responseDeadlines = new WeakMap<Response, BrowserAbortScope>();
type Metadata = { projects: Project[]; assets: Asset[]; messages: Message[]; jobs: GenerationJob[] };
function fail(message: string): never { throw new Error(message); }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function id(value: unknown): asserts value is string { if (typeof value !== "string" || !/^[a-z0-9-]{1,128}$/i.test(value)) fail("旧资料编号无效，未导入任何内容。"); }
function budget(size: number) { if (!Number.isSafeInteger(size) || size < 0 || size > MAX_BROWSER_ARCHIVE_BYTES) fail("旧资料超过 512 MiB 上限，未导入任何内容。请联系管理员分批迁移。"); }
function mime(value: unknown): string { if (typeof value !== "string" || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(value)) fail("旧素材类型无效，未导入任何内容。"); return value.toLowerCase(); }
function disposeResponse(response: Response) { responseDeadlines.get(response)?.dispose(); responseDeadlines.delete(response); }
async function rejectBody(response: Response, message: string): Promise<never> { try { await response.body?.cancel().catch(() => undefined); } finally { disposeResponse(response); } fail(message); }

async function request(path: string) {
  let response: Response;
  const deadline = createBrowserAbort({ timeoutMs: 180_000 });
  try {
    response = await globalThis.fetch(appPath(path), {
      method: "GET", cache: "no-store", credentials: "same-origin", redirect: "error",
      referrerPolicy: "no-referrer", signal: deadline.signal,
    });
  } catch { deadline.dispose(); fail("旧资料读取失败，请检查网络后重试；本机和旧服务器资料均未改动。"); }
  // Keep the deadline until the entire streamed body is read, not just headers.
  responseDeadlines.set(response, deadline);
  if (response.status !== 200 || response.redirected) return rejectBody(response, response.status === 401 || response.status === 403 ? "授权已失效，请使用授权码重新进入后再导入。" : "旧资料暂时无法读取，请稍后重试；未导入任何内容。");
  return response;
}
async function boundedBody(response: Response, maximum: number, expectedSize?: number, type = "application/json") {
  try {
    const declared = response.headers.get("Content-Length");
    if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > maximum || (expectedSize !== undefined && Number(declared) !== expectedSize))) return rejectBody(response, "旧资料文件大小与记录不一致或超过上限，未导入任何内容。");
    if (!response.body) fail("旧资料响应缺少文件内容，未导入任何内容。");
    const reader = response.body.getReader(), parts: BlobPart[] = [];
    let received = 0;
    try {
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        received += value.byteLength;
        if (received > maximum || (expectedSize !== undefined && received > expectedSize)) fail("旧资料文件大小与记录不一致或超过上限，未导入任何内容。");
        // Preserve bounded network chunks, without allocating one archive-sized
        // ArrayBuffer. Blob composition and the archive use these immutable bytes.
        parts.push(new Uint8Array(value));
      }
      if (expectedSize !== undefined && received !== expectedSize) fail("旧资料文件不完整，未导入任何内容。");
      return new Blob(parts, { type });
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      if (error instanceof Error && error.message.includes("未导入")) throw error;
      fail("旧资料下载中断，未导入任何内容，请稍后重试。");
    } finally { reader.releaseLock(); }
  } finally { disposeResponse(response); }
}
async function json(response: Response, maximum: number) {
  const bytes = await boundedBody(response, maximum);
  try { return JSON.parse(await bytes.text()) as unknown; } catch { fail("旧资料响应格式无效，未导入任何内容。"); }
}
async function authorize(userId: string) {
  const value = await json(await request(AUTH_PATH), 64 * 1024);
  if (!object(value) || !object(value.user) || value.user.id !== userId || value.storageMode !== "browser-local") fail("当前授权身份已改变，请重新打开工作台后再导入；本机资料未改动。");
}
const forbidden = /^(?:providers|webProviderSnapshot|webTasks?|payload|(?:(?:api|client)[_-]?)?(?:keys?|secrets?)|(?:(?:access|refresh|license)[_-]?)?tokens?|passwords?|credentials?|authorization|sessions?|cookies?|webLicenseBindingId|licenses?|licenseId|licenseToken|deviceId|__proto__|constructor|prototype)$/i;
function noCredentials(value: unknown) {
  if (Array.isArray(value)) { value.forEach(noCredentials); return; }
  if (!object(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (forbidden.test(key) || (key === "provider" && typeof item !== "string")) fail("旧资料含有凭据或授权字段，未导入任何内容。");
    noCredentials(item);
  }
}
function metadata(value: unknown, userId: string): Metadata {
  if (!object(value) || Object.keys(value).some((key) => !["projects", "assets", "messages", "jobs"].includes(key)) || ["projects", "assets", "messages", "jobs"].some((key) => !Array.isArray(value[key]))) fail("旧资料列表格式无效，未导入任何内容。");
  noCredentials(value);
  const data = value as unknown as Metadata;
  if (data.assets.length > MAX_BROWSER_ARCHIVE_ASSETS) fail("旧资料超过 500 个素材上限，未导入任何内容。请联系管理员分批迁移。");
  const projects = new Set<string>(), assets = new Map<string, Asset>();
  for (const project of data.projects) {
    if (!object(project)) fail("旧项目格式无效，未导入任何内容。");
    id(project.id);
    if (projects.has(project.id) || (project.userId !== undefined && project.userId !== userId)) fail("旧项目编号或归属异常，未导入任何内容。");
    projects.add(project.id);
  }
  let size = 0;
  for (const asset of data.assets) {
    if (!object(asset)) fail("旧素材格式无效，未导入任何内容。");
    id(asset.id); id(asset.projectId);
    if (assets.has(asset.id) || !projects.has(asset.projectId) || !Number.isSafeInteger(asset.size) || asset.size < 0 || asset.url !== `browser-local:${asset.id}`) fail("旧素材编号、大小或项目归属异常，未导入任何内容。");
    asset.type = mime(asset.type); size += asset.size; budget(size); assets.set(asset.id, asset);
  }
  const references = (ids: string[] | undefined, projectId: string) => {
    if (ids === undefined) return;
    if (!Array.isArray(ids)) fail("旧素材引用格式无效，未导入任何内容。");
    for (const assetId of ids) { id(assetId); if (assets.get(assetId)?.projectId !== projectId) fail("旧资料引用了未保存或其他项目的素材，未导入任何内容。"); }
  };
  const embedded = (items: Asset[] | undefined, projectId: string) => {
    if (items === undefined) return;
    if (!Array.isArray(items)) fail("旧素材快照格式无效，未导入任何内容。");
    for (const asset of items) { if (!object(asset) || asset.projectId !== projectId) fail("旧素材快照归属异常，未导入任何内容。"); references([asset.id], projectId); if (asset.url !== `browser-local:${asset.id}`) fail("旧素材快照链接异常，未导入任何内容。"); }
  };
  const result = (value: GenerationResult | undefined, projectId: string) => {
    if (value === undefined) return;
    if (!object(value)) fail("旧生成结果格式无效，未导入任何内容。");
    embedded(value.imageAssets, projectId); references(value.requestSnapshot?.assetIds, projectId); references(value.settingsSnapshot?.sourceAssetIds, projectId); references(value.settingsSnapshot?.referenceAssetIds, projectId);
    if (value.variants !== undefined) { if (!Array.isArray(value.variants)) fail("旧方案记录格式无效，未导入任何内容。"); references(value.variants.flatMap((variant) => variant.assetId ? [variant.assetId] : []), projectId); }
  };
  for (const project of data.projects) {
    references(project.workspaceState?.selectedAssets, project.id); references(project.workspaceState?.freeChatSelectedAssets, project.id);
    if (project.canvas) { if (!Array.isArray(project.canvas.items)) fail("旧画布格式无效，未导入任何内容。"); references(project.canvas.items.map((item) => item.assetId), project.id); }
    if (project.cover) { const asset = data.assets.find((asset) => asset.url === project.cover); if (!asset || asset.projectId !== project.id) fail("旧项目封面归属异常，未导入任何内容。"); }
  }
  for (const asset of data.assets) if (asset.annotationData) {
    let annotation: unknown;
    try { annotation = JSON.parse(asset.annotationData); } catch { fail("旧标注格式无效，未导入任何内容。"); }
    noCredentials(annotation);
    if (!object(annotation)) fail("旧标注格式无效，未导入任何内容。"); references([annotation.sourceAssetId as string], asset.projectId);
  }
  for (const message of data.messages) { if (!object(message) || !projects.has(message.projectId)) fail("旧消息归属异常，未导入任何内容。"); embedded(message.assets, message.projectId); result(message.generation, message.projectId); }
  for (const job of data.jobs) { if (!object(job) || job.userId !== userId || !projects.has(job.projectId)) fail("旧任务用户或项目归属异常，未导入任何内容。"); embedded(job.inputAssets, job.projectId); references(job.selectedAssetIds, job.projectId); result(job.result, job.projectId); }
  return data;
}

/** Call only after the user explicitly chooses to import legacy cloud projects.
 * Repeating adds new copies. This never sends local state, names or keys, and
 * never deletes anything on the legacy server or replaces local projects. */
export async function importLegacyWebProjects(store: BrowserWorkspaceStore): Promise<{ projects: number; assets: number }> {
  if (running.has(store)) fail("旧资料正在导入，请等待本次完成。");
  running.add(store);
  try {
    await authorize(store.userId);
    const data = metadata(await json(await request(LEGACY_PATH), MAX_METADATA_BYTES), store.userId);
    await authorize(store.userId);
    if (!data.projects.length) return { projects: 0, assets: 0 };
    const state: BrowserWorkspaceState = { schemaVersion: 1, revision: 0, profileName: "", ...data, recycleBin: [], providers: [] };
    const assets = new Map(data.assets.map((asset) => [asset.id, asset]));
    let received = 0;
    const readonly = (): never => fail("旧资料迁移源只允许读取。");
    const source: BrowserWorkspaceStore = {
      userId: store.userId, partition: "legacy-readonly", getState: async () => state,
      async getBlob(assetId, projectId) {
        const asset = assets.get(assetId);
        if (!asset || asset.projectId !== projectId) fail("旧素材归属异常，未导入任何内容。");
        // Only a strict ID obtained from the fixed legacy response reaches the
        // server query. No local project/asset ID or credential is ever sent.
        const response = await request(`${LEGACY_PATH}?assetId=${encodeURIComponent(asset.id)}`);
        const responseType = response.headers.get("Content-Type")?.split(";", 1)[0]?.trim();
        if (!responseType || responseType.toLowerCase() !== mime(asset.type)) return rejectBody(response, "旧素材文件类型与记录不一致，未导入任何内容。");
        const blob = await boundedBody(response, MAX_BROWSER_ARCHIVE_BYTES - received, asset.size, asset.type);
        received += blob.size; budget(received); return blob;
      },
      update: async () => readonly(), putBlob: async () => readonly(), deleteBlob: async () => readonly(), requestPersistence: async () => readonly(), close() {},
    };
    // Export validates full domain shapes and all references before getBlob.
    // It retains Blob parts; neither operation creates an archive-sized buffer.
    const archive = await exportLocalWorkspaceBackup(source);
    await authorize(store.userId);
    return await importLocalWorkspaceBackup(store, archive);
  } finally { running.delete(store); }
}
