import { APP_BASE_PATH, appPath } from "@/lib/app-path";
import { isAuthorizationOnlyApi, isBrowserLocalMode } from "@/lib/browser-local-mode";
import { createBrowserAbort } from "@/lib/browser-abort";
import { openBrowserWorkspace, type BrowserWorkspaceState, type BrowserWorkspaceStore } from "@/lib/browser-local-store";
import { activeLocalProvider, handleLocalProviderRequest } from "@/lib/browser-local-providers";
import { directImages, directText, type DirectImageInput } from "@/lib/browser-direct-provider";
import type { BrowserDirectProvider } from "@/lib/browser-direct-provider";
import { buildBrowserImagePrompt, browserEnhancementMessages, parseBrowserDesignPlan, browserFinalImageAssets } from "@/lib/browser-generation-prompts";
import { agents, getAgent } from "@/lib/agents/catalog";
import { normalizeProjectWorkspaceState } from "@/lib/project-workspace-state";
import { normalizeBoardItemCount } from "@/lib/generation-board";
import { annotationSourceId, parameterAssetError } from "@/lib/workspace-generation";
import { resolveFreeChatImageCount, resolveFreeChatResolution, resolveParameterImageCount } from "@/lib/services/natural-intent";
import { sortAssetsByRole } from "@/lib/services/asset-roles";
import { browserLocalAttachmentIssue } from "@/lib/browser-local-attachments";
import { rememberBrowserImageBlob, forgetBrowserImageBlob } from "@/lib/browser-image-save";
import type { DesignPlan } from "@/lib/providers/types";
import type { AgentId, Asset, GenerationJob, GenerationResult, Message, Project, UserSession } from "@/types/domain";

type LocalContext = { user: UserSession; store: BrowserWorkspaceStore; lifecycle: AbortController };
type Json = Record<string, unknown>;
let current: Promise<LocalContext> | undefined;
let releaseWorkspaceLock: (() => void) | undefined;
type ObjectUrlRecord = { promise: Promise<string>; valid: boolean; url?: string };
const objectUrls = new Map<string, ObjectUrlRecord>();
const controllers = new Map<string, AbortController>();
const running = new Set<string>();
const now = () => new Date().toISOString();
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
function error(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
function text(value: unknown, label: string, maximum = 5000, required = true) {
  if (typeof value !== "string" || value.length > maximum || required && !value.trim()) error(`${label}无效`);
  return (value as string).trim();
}
function list(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 9 || value.some((item) => typeof item !== "string")) error("每次最多选择9张本机图片");
  return [...new Set(value as string[])];
}
function projectOf(projects: Project[], id: string) { return projects.find((project) => project.id === id) || error("项目不存在或不属于当前本机工作区", 404); }
function assertProjectIdle(state: BrowserWorkspaceState, projectId: string) {
  if (state.jobs.some((job) => job.projectId === projectId && ["queued", "running"].includes(job.status))) error("请先结束本项目生成任务再删除", 409);
}
function revokeAssetUrl(store: BrowserWorkspaceStore, assetId: string) {
  const key = `${store.partition}:${assetId}`, record = objectUrls.get(key);
  if (!record) return;
  record.valid = false; objectUrls.delete(key);
  if (record.url) { forgetBrowserImageBlob(record.url); URL.revokeObjectURL(record.url); }
}
function cleanWorkspaceReferences(project: Project, assets: Asset[]) {
  const ids = new Set(assets.filter((asset) => asset.projectId === project.id).map((asset) => asset.id));
  if (project.workspaceState?.selectedAssets) project.workspaceState.selectedAssets = project.workspaceState.selectedAssets.filter((id) => ids.has(id));
  if (project.workspaceState?.freeChatSelectedAssets) project.workspaceState.freeChatSelectedAssets = project.workspaceState.freeChatSelectedAssets.filter((id) => ids.has(id));
  if (project.canvas) project.canvas.items = project.canvas.items.filter((item) => ids.has(item.assetId));
  if (project.cover?.startsWith("browser-local:") && !ids.has(project.cover.slice("browser-local:".length))) delete project.cover;
}
function canvasState(value: unknown, assets: Asset[], projectId: string): NonNullable<Project["canvas"]> {
  if (!value || typeof value !== "object" || !Array.isArray((value as Project["canvas"])?.items)) error("画布格式无效");
  const canvas = value as NonNullable<Project["canvas"]>, ids = new Set(assets.filter((asset) => asset.projectId === projectId).map((asset) => asset.id));
  const items = canvas.items.filter((item) => item && ids.has(item.assetId)).map((item) => {
    if (![item.x, item.y, item.width, item.height].every(Number.isFinite) || item.width <= 0 || item.height <= 0) error("画布位置或尺寸无效");
    return { assetId: item.assetId, x: item.x, y: item.y, width: item.width, height: item.height };
  });
  if (canvas.viewport && (![canvas.viewport.x, canvas.viewport.y, canvas.viewport.zoom].every(Number.isFinite) || canvas.viewport.zoom <= 0)) error("画布视图无效");
  return { items, ...(canvas.viewport ? { viewport: { x: canvas.viewport.x, y: canvas.viewport.y, zoom: canvas.viewport.zoom } } : {}) };
}
function synchronizeAsset(state: BrowserWorkspaceState, asset: Asset) {
  const replace = (items: Asset[] | undefined) => items?.map((item) => item.id === asset.id ? { ...asset } : item);
  const result = (generation: GenerationResult | undefined) => { if (generation?.imageAssets) { generation.imageAssets = replace(generation.imageAssets); generation.imageUrls = generation.imageAssets!.map((item) => item.url); } };
  for (const message of state.messages) if (message.projectId === asset.projectId) { message.assets = replace(message.assets); result(message.generation); }
  for (const job of state.jobs) if (job.projectId === asset.projectId) { job.inputAssets = replace(job.inputAssets)!; result(job.result); }
}
function removeAsset(state: BrowserWorkspaceState, asset: Asset) {
  state.assets = state.assets.filter((item) => item.id !== asset.id);
  const remove = (items: Asset[] | undefined) => items?.filter((item) => item.id !== asset.id);
  const ids = (items: string[] | undefined) => items?.filter((id) => id !== asset.id);
  const result = (generation: GenerationResult | undefined) => {
    if (!generation) return;
    const indexes = new Set<number>();
    generation.imageAssets?.forEach((item, index) => { if (item.id === asset.id) indexes.add(index); });
    generation.imageAssets = remove(generation.imageAssets);
    generation.imageUrls = generation.imageAssets ? generation.imageAssets.map((item) => item.url) : generation.imageUrls.filter((url) => url !== asset.url);
    generation.variants = generation.variants?.filter((variant, index) => variant.assetId ? variant.assetId !== asset.id : !indexes.has(index));
    if (generation.requestSnapshot) generation.requestSnapshot.assetIds = ids(generation.requestSnapshot.assetIds)!;
    if (generation.settingsSnapshot) { generation.settingsSnapshot.sourceAssetIds = ids(generation.settingsSnapshot.sourceAssetIds)!; generation.settingsSnapshot.referenceAssetIds = ids(generation.settingsSnapshot.referenceAssetIds)!; }
    // Historical delivered counts, costs, prompts and timing remain unchanged.
  };
  for (const message of state.messages) if (message.projectId === asset.projectId) { message.assets = remove(message.assets); result(message.generation); }
  for (const job of state.jobs) if (job.projectId === asset.projectId) { job.inputAssets = remove(job.inputAssets)!; job.selectedAssetIds = ids(job.selectedAssetIds); result(job.result); }
  const project = projectOf(state.projects, asset.projectId);
  if (project.cover === asset.id || project.cover === asset.url) delete project.cover;
  cleanWorkspaceReferences(project, state.assets); project.updatedAt = now();
}
function selectedLocalAssets(all: Asset[], projectId: string, ids: string[], expandAnnotations = false) {
  const output: Asset[] = [];
  const append = (asset: Asset) => {
    const issue = browserLocalAttachmentIssue([asset]); if (issue) error(issue);
    if (!output.some((item) => item.id === asset.id)) output.push(asset);
  };
  for (const id of ids) {
    const asset = all.find((item) => item.id === id && item.projectId === projectId) || error("附件不存在或不属于当前项目");
    if (expandAnnotations && asset.role === "annotation") {
      const sourceId = annotationSourceId(asset);
      const source = all.find((item) => item.id === sourceId && item.projectId === projectId && item.type.startsWith("image/") && !["annotation", "mask"].includes(item.role));
      if (!source) error("标注对应的干净原图不存在或不属于本项目，请重新标注；尚未调用模型。");
      append({ ...source, role: "structure" });
    }
    append(asset);
  }
  if (output.length > 9) error("标注及其干净原图合计超过9张，请减少附件；尚未调用模型。");
  return output;
}

/** Sends only the existing signed browser/device cookies. Never include a prompt,
 * image, project identifier or supplier credential in this authorization call. */
export async function checkBrowserAuthorization(expectedUserId?: string) {
  const abort = createBrowserAbort({ timeoutMs: 15_000 });
  try {
    const response = await globalThis.fetch(appPath("/api/web/auth/status"), { cache: "no-store", credentials: "same-origin", redirect: "error", signal: abort.signal });
    const value = await response.json() as { user?: UserSession; error?: string; storageMode?: string };
    if (!response.ok || !value.user || value.storageMode !== "browser-local") error(value.error || "请使用授权码重新进入本地网页版", response.status === 401 || response.status === 403 ? response.status : 503);
    if (expectedUserId && value.user.id !== expectedUserId) error("授权身份已改变，请重新打开工作台；旧任务不会改用另一份密钥继续执行。", 401);
    return value.user;
  } finally { abort.dispose(); }
}

async function context() {
  current ??= (async () => {
    const user = await checkBrowserAuthorization();
    if (!navigator.locks) error("此浏览器不支持可靠的本地任务锁，请更新浏览器后再使用本地网页版；不会回退到服务器存储。", 503);
    await new Promise<void>((resolve, reject) => {
      void navigator.locks.request(`idai-browser-workspace:${APP_BASE_PATH}:${user.id}`, { ifAvailable: true }, async (lock) => {
        if (!lock) { reject(Object.assign(new Error("此工作区已在另一个标签页打开，请关闭其他标签页后刷新，避免重复出图和覆盖草稿。"), { status: 409 })); return; }
        const held = new Promise<void>((unlock) => { releaseWorkspaceLock = unlock; }); resolve(); await held;
      }).catch(reject);
    });
    const store = await openBrowserWorkspace(user.id);
    // A browser cannot finish paid work after it has been closed. Never replay it.
    const state = await store.getState();
    if (state.jobs.some((job) => ["queued", "running"].includes(job.status) && !controllers.has(job.id))) {
      await store.update((draft) => { for (const job of draft.jobs) if (["queued", "running"].includes(job.status) && !controllers.has(job.id)) {
        job.status = "failed"; job.error = "页面已关闭或刷新，生成已中断；不会自动重试，请先核对供应商账单和已有图片。"; job.updatedAt = now(); job.recoveryAvailable = false;
      } });
    }
    return { user, store, lifecycle: new AbortController() };
  })().catch((reason) => { current = undefined; releaseWorkspaceLock?.(); releaseWorkspaceLock = undefined; throw reason; });
  return current;
}

export async function localWorkspaceStore() { return (await context()).store; }
export async function closeBrowserLocalSession() {
  for (const controller of controllers.values()) controller.abort();
  controllers.clear(); running.clear();
  const previous = current; current = undefined;
  if (previous) { try { const session = await previous; session.lifecycle.abort(); session.store.close(); } catch { /* No local data is deleted on logout. */ } }
  for (const record of objectUrls.values()) { record.valid = false; if (record.url) { forgetBrowserImageBlob(record.url); URL.revokeObjectURL(record.url); } }
  objectUrls.clear();
  releaseWorkspaceLock?.(); releaseWorkspaceLock = undefined;
}

async function hydrated<T>(value: T, session: LocalContext): Promise<T> {
  const convert = async (item: unknown): Promise<unknown> => {
    if (typeof item === "string" && item.startsWith("browser-local:")) {
      const id = item.slice("browser-local:".length), key = `${session.store.partition}:${id}`;
      const existing = objectUrls.get(key);
      if (existing) return existing.promise;
      const record: ObjectUrlRecord = { valid: true, promise: Promise.resolve("") };
      objectUrls.set(key, record);
      record.promise = (async () => {
        const blob = await session.store.getBlob(id);
        if (!blob || !record.valid || session.lifecycle.signal.aborted) {
          if (objectUrls.get(key) === record) objectUrls.delete(key);
          return "";
        }
        const url = URL.createObjectURL(blob); rememberBrowserImageBlob(url, blob); record.url = url; return url;
      })().catch((reason) => { if (objectUrls.get(key) === record) objectUrls.delete(key); throw reason; });
      return record.promise;
    }
    if (Array.isArray(item)) return Promise.all(item.map(convert));
    if (item && typeof item === "object") return Object.fromEntries(await Promise.all(Object.entries(item).map(async ([key, entry]) => [key, await convert(entry)])));
    return item;
  };
  return await convert(value) as T;
}

function changed(jobId: string) { window.dispatchEvent(new CustomEvent("idai-browser-job", { detail: jobId })); }
export function createBrowserJobEventSource(jobId: string): EventSource {
  let closed = false, reading = false;
  const source = { onmessage: null as ((event: MessageEvent) => void) | null, onerror: null as (() => void) | null,
    close() { closed = true; clearInterval(timer); window.removeEventListener("idai-browser-job", listener); } };
  const update = async () => {
    if (closed || reading) return;
    reading = true;
    try { const session = await context(); const job = (await session.store.getState()).jobs.find((item) => item.id === jobId); if (job && !closed) source.onmessage?.(new MessageEvent("message", { data: JSON.stringify(await hydrated(job, session)) })); }
    catch { if (!closed) source.onerror?.(); }
    finally { reading = false; }
  };
  const listener = (event: Event) => { if ((event as CustomEvent).detail === jobId) void update(); };
  const timer = setInterval(() => { void update(); }, 1500);
  window.addEventListener("idai-browser-job", listener); queueMicrotask(() => { void update(); });
  return source as unknown as EventSource;
}

export async function browserBlobImage(blob: Blob): Promise<DirectImageInput> {
  if (!blob.type.startsWith("image/") || blob.size > 24 * 1024 * 1024) error("仅支持24MB以内的图片");
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve({ mimeType: blob.type, data: String(reader.result).split(",")[1] }); reader.onerror = () => reject(new Error("本机图片读取失败")); reader.readAsDataURL(blob);
  });
}
async function imageInputs(session: LocalContext, assets: Asset[]) {
  const issue = browserLocalAttachmentIssue(assets); if (issue) error(issue);
  const images: DirectImageInput[] = [];
  for (const asset of sortAssetsByRole(assets)) {
    const blob = await session.store.getBlob(asset.id, asset.projectId);
    if (!blob) error("本机图片内容缺失，请重新选择文件；本次未调用模型。");
    const blobIssue = browserLocalAttachmentIssue([blob]); if (blobIssue) error(blobIssue);
    images.push(await browserBlobImage(blob));
  }
  return images;
}
async function dimensions(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try { return await new Promise<{ width: number; height: number }>((resolve, reject) => { const image = new Image(); image.onload = () => image.naturalWidth * image.naturalHeight > 64_000_000 ? reject(new Error("图片像素过大，请缩小到6400万像素以内")) : resolve({ width: image.naturalWidth, height: image.naturalHeight }); image.onerror = () => reject(new Error("图片格式无法解码，请使用PNG、JPEG或WebP")); image.src = url; }); }
  finally { URL.revokeObjectURL(url); }
}
async function newAsset(session: LocalContext, projectId: string, blob: Blob, name: string, role: Asset["role"], origin: Asset["origin"], extras: Partial<Asset> = {}) {
  const size = await dimensions(blob);
  const id = crypto.randomUUID();
  const asset: Asset = { id, projectId, name, type: blob.type, size: blob.size, role, origin, createdAt: now(), ...extras, url: `browser-local:${id}`, nativeWidth: size.width, nativeHeight: size.height, exportWidth: size.width, exportHeight: size.height, upscaled: false };
  await session.store.update((draft, blobs) => {
    const project = projectOf(draft.projects, projectId) as Project & { browserResultSequence?: number };
    if (origin === "generated") {
      const maximum = draft.assets.filter((item) => item.projectId === projectId && item.origin === "generated").reduce((max, item) => Math.max(max, Number(item.name.match(/^方案\s*(\d+)/)?.[1]) || 0), project.browserResultSequence || 0);
      project.browserResultSequence = maximum + 1;
      const extension = blob.type.includes("jpeg") ? "jpg" : blob.type.includes("webp") ? "webp" : "png";
      asset.name = `方案 ${String(project.browserResultSequence).padStart(3, "0")}.${extension}`;
    }
    project.updatedAt = now(); draft.assets.push(asset); blobs.putBlob(id, blob);
  });
  return asset;
}

async function patchJob(session: LocalContext, id: string, patch: Partial<GenerationJob>) {
  await session.store.update((state) => { const job = state.jobs.find((item) => item.id === id); if (!job) error("任务不存在"); if (job.status === "cancelled" && patch.status !== "cancelled") return; Object.assign(job, patch, { updatedAt: now() }); });
  changed(id);
}

async function performJob(session: LocalContext, job: GenerationJob, body: Json, free: boolean, controller: AbortController, provider: BrowserDirectProvider) {
  try {
    const beforeRequest = async () => { if (controller.signal.aborted || session.lifecycle.signal.aborted) throw new DOMException("已取消", "AbortError"); await checkBrowserAuthorization(session.user.id); };
    await patchJob(session, job.id, { status: "running", progress: 5, stage: "planning", stageLabel: "正在本机准备，直接连接你的模型供应商" });
    const project = projectOf((await session.store.getState()).projects, job.projectId);
    const settings = { ...(body.settings as Record<string, string | number | boolean> || {}) };
    const assets = job.inputAssets;
    const images = await imageInputs(session, assets);
    let content = job.prompt;
    let agentId = job.agentId;
    let count = free ? resolveFreeChatImageCount(content) : resolveParameterImageCount(agentId, settings, content);
    let designPlan: DesignPlan | undefined;
    let reply = "";
    let textOnly = !free && !getAgent(agentId).requiresImage;
    if (free) {
      const history = (await session.store.getState()).messages.filter((message) => message.projectId === project.id && message.jobId !== job.id).slice(-12).map((message) => `${message.role}：${message.content}`).join("\n").slice(-8000);
      const logical = (job.selectedAssetIds || assets.map((asset) => asset.id)).map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is Asset => Boolean(asset));
      const manifest = logical.map((asset, index) => `附件${index + 1}：${asset.name}（${asset.role}${asset.role === "annotation" ? "；另附同一附件的干净底图，不另计附件号" : ""}）`).join("；");
      const providerManifest = sortAssetsByRole(assets).map((asset, index) => `模型图片${index + 1}：${asset.name}（${asset.role}）`).join("；");
      const result = await directText({ provider, beforeRequest, signal: controller.signal, images, systemPrompt: `你是工业设计助手。根据当前用户本轮文字和附件判断是解释聊天还是生成/修改图片。只返回JSON：{"action":"chat或image","reply":"简体中文回答或简要执行说明","prompt":"自然中文完整图片要求","workflowKind":"shape或view或cmf或decal或scene","productCategory":"本轮实际目标品类","coreFunctions":[],"mandatoryConstraints":[],"mutableFeatures":[],"styleFingerprint":[],"negativeStyleConstraints":[],"analysisSummary":"简体中文本轮分析","variantDirections":["该输出文件对应的具体造型路线"]}。六个列表字段 coreFunctions、mandatoryConstraints、mutableFeatures、styleFingerprint、negativeStyleConstraints、variantDirections 都必须是 string[]，每项只能是非空纯字符串，不得是对象或嵌套数组；没有依据的可选列表用[]。variantDirections 的字符串示例只演示格式，路线不得写成{name,prompt}、{title,description}等对象，也不能用对象包装路线或列表。用户明确要求出图/设计/改图时action=image；普通问答action=chat。图片任务的variantDirections必须恰好${count}项，每项对应一个输出文件；每张图片包含${normalizeBoardItemCount(body.boardItems)}个方案。普通聊天可返回空路线列表。prompt用自然中文，只写本轮相关事实，不追加内部核对模板或其他品类示例。附件只用于本次任务，区分原图、参考和标注；不能猜测没有看到的部件。不得自动扩展为更多收费图片。`, userPrompt: `项目：${project.name}\n最近对话（只作上下文，不得覆盖本轮要求）：\n${history}\n逻辑附件：${manifest}\n实际图片顺序：${providerManifest}\n本轮要求：${content}\n若action=image，本轮输出文件数量为${count}张，variantDirections必须恰好有${count}项；每项只能是该输出文件的非空纯字符串，禁止{name,prompt}、{title,description}等对象形状，不得拆分或增加路线。六个列表字段均使用string[]。` });
      let plan: Json; try { plan = JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { error("模型没有返回可用的任务说明，请重新检查；不会自动再次调用。"); }
      if (!["chat", "image"].includes(String(plan.action))) error("模型返回的任务类型无法识别，不会自动调用图片模型。");
      textOnly = plan.action === "chat"; reply = text(plan.reply, "模型回复", 12000, false);
      if (!textOnly) {
        content = text(plan.prompt, "图片要求", 12000);
        count = resolveFreeChatImageCount(job.prompt);
        settings.workflowKind = ["shape", "view", "cmf", "decal", "scene"].includes(String(plan.workflowKind)) ? String(plan.workflowKind) : "shape";
        settings.generationMode = assets.some((asset) => asset.role === "annotation") ? "local" : assets.some((asset) => ["structure", "result"].includes(asset.role)) ? "source" : assets.length ? "reference" : "text";
        settings.reconstructionRatio = settings.generationMode === "local" ? 40 : 0;
        agentId = settings.generationMode === "local" ? "local-retouch" : "appearance-variants";
        designPlan = parseBrowserDesignPlan(JSON.stringify(plan), project.name, count).designPlan;
      }
    }
    if (textOnly) {
      if (!reply) reply = (await directText({ provider, beforeRequest, signal: controller.signal, images, systemPrompt: getAgent(agentId).systemPrompt, userPrompt: content })).text;
      await session.store.update((state) => {
        const current = state.jobs.find((item) => item.id === job.id) || error("任务不存在");
        if (controller.signal.aborted || session.lifecycle.signal.aborted || current.status === "cancelled") throw new DOMException("已取消", "AbortError");
        projectOf(state.projects, job.projectId);
        state.messages.push({ id: crypto.randomUUID(), jobId: job.id, projectId: job.projectId, role: "assistant", content: reply, createdAt: now(), agentId: job.agentId });
        Object.assign(current, { status: "succeeded", progress: 100, stage: "completed", stageLabel: "已完成", updatedAt: now() });
      });
      changed(job.id); return;
    }
    settings.resolution = free ? String(body.resolution || "1K") : String(settings.resolution || "1K");
    settings.aspectRatio = free ? String(body.aspectRatio || "auto") : String(settings.aspectRatio || "auto");
    settings.boardItems = normalizeBoardItemCount(free ? body.boardItems : settings.boardItems);
    settings.outputCount = Math.max(1, Math.min(100, count));
    const promptInput = { project, content, assets, agentId, settings };
    // Analysis and final-image selection use the same local policies as the UI.
    if (designPlan) {
      // Free chat already planned this same paid task in its one text call.
    } else if (typeof settings.preparedDesignPlan === "string") {
      let prepared: unknown; try { prepared = JSON.parse(settings.preparedDesignPlan); } catch { error("已整理的设计路线无效，请重新整理后再生成"); }
      designPlan = parseBrowserDesignPlan(JSON.stringify({ ...(prepared as Json), prompt: job.prompt }), project.name, count).designPlan;
    } else {
      const enhanced = browserEnhancementMessages(promptInput);
      const planned = await directText({ provider, beforeRequest, signal: controller.signal, images, ...enhanced });
      designPlan = parseBrowserDesignPlan(planned.text, project.name, count).designPlan;
    }
    const finalAssets = browserFinalImageAssets({ ...promptInput, designPlan });
    const finalImages = finalAssets === assets ? images : await imageInputs(session, finalAssets);
    const imagePrompt = buildBrowserImagePrompt({ ...promptInput, designPlan, count });
    await patchJob(session, job.id, { stage: "generating", progress: 15, totalOutputs: count, completedOutputs: 0, stageLabel: `正在直连生成 0/${count} 张` });
    const saved: Asset[] = [];
    const output = await directImages({ provider, beforeRequest, signal: controller.signal, images: finalImages, systemPrompt: getAgent(agentId).systemPrompt, userPrompt: imagePrompt, promptForIndex: (index) => buildBrowserImagePrompt({ ...promptInput, designPlan, count, index }), count, resolution: String(settings.resolution) as "1K" | "2K" | "4K", aspectRatio: String(settings.aspectRatio), onImage: async (image) => {
      if (controller.signal.aborted) throw new DOMException("已取消", "AbortError");
      const state = await session.store.getState();
      const sequence = state.assets.filter((asset) => asset.projectId === job.projectId && (asset.origin === "generated" || asset.role === "result")).length + 1;
      const extension = image.blob.type.includes("jpeg") ? "jpg" : image.blob.type.includes("webp") ? "webp" : "png";
      const asset = await newAsset(session, job.projectId, image.blob, `方案 ${String(sequence).padStart(3, "0")}.${extension}`, "result", "generated"); saved.push(asset);
      await patchJob(session, job.id, { completedOutputs: saved.length, progress: Math.round(15 + 80 * saved.length / count), stageLabel: `已生成并保存到本机 ${saved.length}/${count} 张` });
    } });
    const result: GenerationResult = { jobId: job.id, status: "succeeded", provider: output.provider, model: output.model, prompt: imagePrompt, imageUrls: saved.map((asset) => asset.url), imageAssets: saved, requestedCount: count, deliveredCount: saved.length, savedCount: saved.length,
      requestSnapshot: free ? { endpoint: "/api/free-chat", content: job.prompt, assetIds: job.selectedAssetIds || assets.map((asset) => asset.id), resolution: String(settings.resolution) as "1K" | "2K" | "4K", aspectRatio: String(settings.aspectRatio) as "auto", boardItems: Number(settings.boardItems) } : { endpoint: "/api/messages", content: job.prompt, agentId: job.agentId, assetIds: assets.map((asset) => asset.id), settings },
      startedAt: job.createdAt, completedAt: now(), note: output.failureSummary,
      settingsSnapshot: { agentId: job.agentId, workflowKind: String(settings.workflowKind || "shape") as "shape", direction: String(settings.designDirection || "造型焕新"), reconstructionRatio: Number(settings.reconstructionRatio || 0), resolution: String(settings.resolution) as "1K" | "2K" | "4K", outputCount: count, boardItems: Number(settings.boardItems), generationMode: String(settings.generationMode || "text") as "text", aspectRatio: String(settings.aspectRatio) as "auto", sourceAssetIds: assets.filter((asset) => asset.role === "structure").map((asset) => asset.id), referenceAssetIds: assets.filter((asset) => asset.role === "style").map((asset) => asset.id) },
    };
    await session.store.update((state) => {
      const current = state.jobs.find((item) => item.id === job.id) || error("任务不存在");
      if (controller.signal.aborted || session.lifecycle.signal.aborted || current.status === "cancelled") throw new DOMException("已取消", "AbortError");
      projectOf(state.projects, job.projectId);
      const canonical = saved.map((asset) => state.assets.find((item) => item.id === asset.id && item.projectId === job.projectId) || error("生成结果记录已变化，请保留已有图片并检查本机项目"));
      const latestResult = { ...result, imageAssets: canonical, imageUrls: canonical.map((asset) => asset.url) };
      state.messages.push({ id: crypto.randomUUID(), jobId: job.id, projectId: job.projectId, role: "assistant", content: `已生成 ${canonical.length} 张图片，已保存到本机浏览器。${output.failureSummary ? `\n${output.failureSummary}` : ""}`, createdAt: now(), agentId: job.agentId, assets: canonical, generation: latestResult });
      Object.assign(current, { status: "succeeded", progress: 100, stage: "completed", stageLabel: "已完成", result: latestResult, updatedAt: now() });
    });
    changed(job.id);
  } catch (reason) {
    await patchJob(session, job.id, { status: controller.signal.aborted ? "cancelled" : "failed", progress: 100, error: reason instanceof Error ? reason.message : "本机生成失败；不会自动重试", recoveryAvailable: false }).catch(() => {});
  } finally { controllers.delete(job.id); running.delete(job.id); }
}

async function localApi(session: LocalContext, path: string, url: URL, method: string, init: RequestInit) {
  const state = await session.store.getState();
  const readBody = (): Json => {
    if (typeof init.body !== "string" || init.body.length > 1_000_000) error("本机请求格式无效");
    try { const value = JSON.parse(init.body); if (value && typeof value === "object" && !Array.isArray(value)) return value; } catch { /* Below returns a local error. */ }
    return error("本机请求格式无效");
  };
  const respond = async (value: unknown, status = 200) => json(await hydrated(value, session), status);
  if (path.startsWith("/api/web/providers")) return json(await handleLocalProviderRequest(session.store, path, method, method === "GET" ? undefined : readBody(), async () => { if (session.lifecycle.signal.aborted) throw new DOMException("已退出", "AbortError"); await checkBrowserAuthorization(session.user.id); }, init.signal || undefined));
  if (path === "/api/agents" && method === "GET") return json({ agents: agents.map(({ systemPrompt: _systemPrompt, ...agent }) => agent) });
  if (path === "/api/projects") {
    if (method === "GET") return respond({ projects: state.projects.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), user: { ...session.user, name: state.profileName || session.user.name } });
    const body = readBody();
    if (method === "POST") {
      const project: Project = { id: crypto.randomUUID(), name: body.restoreDefault ? "我的第一个设计项目" : text(body.name, "项目名称", 60), description: typeof body.description === "string" ? body.description.slice(0, 300) : "", activeAgentId: "appearance-variants", updatedAt: now() };
      await session.store.update((draft) => { draft.projects.push(project); }); return respond({ project }, 201);
    }
    const id = text(body.projectId, "项目编号", 512);
    if (method === "PATCH") {
      const project = await session.store.update((draft) => { const project = projectOf(draft.projects, id); if (body.name !== undefined) project.name = text(body.name, "项目名称", 60); if (body.description !== undefined) project.description = text(body.description, "项目说明", 300, false); project.updatedAt = now(); return project; });
      return respond({ project });
    }
    if (method === "DELETE") {
      const project = await session.store.update((draft) => { const project = projectOf(draft.projects, id); assertProjectIdle(draft, id); draft.recycleBin.push({ id: crypto.randomUUID(), deletedAt: now(), project, assets: draft.assets.filter((asset) => asset.projectId === id), messages: draft.messages.filter((message) => message.projectId === id), jobs: draft.jobs.filter((job) => job.projectId === id) }); draft.projects = draft.projects.filter((item) => item.id !== id); draft.assets = draft.assets.filter((item) => item.projectId !== id); draft.messages = draft.messages.filter((item) => item.projectId !== id); draft.jobs = draft.jobs.filter((item) => item.projectId !== id); return project; }); return respond({ project });
    }
  }
  const projectPath = path.match(/^\/api\/projects\/([^/]+)(?:\/(results|export))?$/);
  if (projectPath) {
    const id = decodeURIComponent(projectPath[1]); const project = projectOf(state.projects, id);
    if (projectPath[2] === "export" && method === "POST") { const { exportLocalProjectImages } = await import("@/lib/browser-local-archive"); return new Response(await exportLocalProjectImages(session.store, id, readBody()), { headers: { "Content-Type": "application/zip" } }); }
    if (projectPath[2] === "results" && method === "GET") return respond({ results: state.assets.filter((asset) => asset.projectId === id && asset.origin === "generated").map((asset) => ({ asset, generation: state.messages.find((message) => message.generation?.imageAssets?.some((item) => item.id === asset.id))?.generation })) });
    if (!projectPath[2] && method === "GET") return respond({ project });
    if (!projectPath[2] && method === "PATCH") { const body = readBody(); const next = await session.store.update((draft) => { const current = projectOf(draft.projects, id); if (body.workspaceState) current.workspaceState = normalizeProjectWorkspaceState({ ...current.workspaceState, ...(body.workspaceState as Project["workspaceState"]) }); if (body.canvas) current.canvas = canvasState(body.canvas, draft.assets, id); cleanWorkspaceReferences(current, draft.assets); current.updatedAt = now(); return current; }); return respond({ project: next }); }
  }
  if (["/api/conversations", "/api/messages"].includes(path) && method === "GET") {
    const id = text(url.searchParams.get("projectId"), "项目编号", 512); projectOf(state.projects, id);
    const eligible = state.messages.filter((message) => message.projectId === id && (!url.searchParams.get("before") || message.createdAt < url.searchParams.get("before")!));
    const limit = Math.max(10, Math.min(100, Number(url.searchParams.get("limit")) || 40));
    return respond({ messages: eligible.slice(-limit), assets: state.assets.filter((asset) => asset.projectId === id), hasMore: eligible.length > limit });
  }
  if (path === "/api/assets/upload" && method === "POST") {
    if (!(init.body instanceof FormData)) error("请选择本机图片");
    const form = init.body as FormData; const file = form.get("file");
    if (!(file instanceof Blob) || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 24 * 1024 * 1024) error("本地网页版支持24MB以内的PNG、JPEG、WebP或GIF图片；资料文件请先转成图片或文字。");
    const id = text(form.get("projectId"), "项目编号", 512); projectOf(state.projects, id);
    const role = String(form.get("role") || "structure"); if (!["structure", "style", "scene", "annotation", "mask", "brief"].includes(role)) error("素材角色无效");
    const extras: Partial<Asset> = {}; const tags = form.get("tags"); if (tags) { try { const value = JSON.parse(String(tags)); if (Array.isArray(value) && value.every((tag) => typeof tag === "string")) extras.tags = value; } catch { error("素材标签无效"); } }
    const annotation = form.get("annotationData"); if (typeof annotation === "string" && annotation.length <= 200_000) extras.annotationData = annotation;
    return respond({ asset: await newAsset(session, id, file, "name" in file ? String(file.name) : "图片.png", role as Asset["role"], role === "annotation" ? "annotation" : "user", extras) }, 201);
  }
  const assetPath = path.match(/^\/api\/assets\/([^/]+)$/);
  if (assetPath) {
    const id = decodeURIComponent(assetPath[1]); const asset = state.assets.find((item) => item.id === id) || error("本机图片不存在", 404); projectOf(state.projects, asset.projectId);
    if (method === "GET") { const blob = await session.store.getBlob(id, asset.projectId) || error("本机图片内容缺失", 404); return new Response(blob, { headers: { "Content-Type": blob.type, "Cache-Control": "no-store", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}` } }); }
    if (method === "POST") return respond({ asset });
    if (method === "PATCH") { const body = readBody(); const patched = await session.store.update((draft) => { const asset = draft.assets.find((item) => item.id === id) || error("本机图片不存在", 404); if (body.role !== undefined) { if (!["structure", "style", "scene", "annotation", "mask", "brief", "result"].includes(String(body.role))) error("素材角色无效"); asset.role = body.role as Asset["role"]; } if (body.favorite !== undefined) asset.favorite = Boolean(body.favorite); if (body.note !== undefined) asset.note = text(body.note, "备注", 240, false); if (body.tags !== undefined) { if (!Array.isArray(body.tags) || body.tags.some((tag) => typeof tag !== "string")) error("标签无效"); asset.tags = body.tags as string[]; } if (typeof body.annotationData === "string" && body.annotationData.length <= 200_000) asset.annotationData = body.annotationData; synchronizeAsset(draft, asset); return asset; }); return respond({ asset: patched }); }
    if (method === "DELETE") {
      const removed = await session.store.update((draft) => {
        const current = draft.assets.find((item) => item.id === id) || error("本机图片不存在", 404);
        assertProjectIdle(draft, current.projectId);
        removeAsset(draft, current); return current;
      });
      revokeAssetUrl(session.store, id); return respond({ asset: removed });
    }
  }
  if (path === "/api/recycle-bin") {
    if (method === "GET") {
      const items = [];
      for (const record of state.recycleBin) {
        let byteSize = 0;
        for (const asset of record.assets) byteSize += (await session.store.getBlob(asset.id, record.project.id))?.size || 0;
        items.push({ id: record.id, projectId: record.project.id, name: record.project.name, deletedAt: record.deletedAt, assetCount: record.assets.length, resultCount: record.assets.filter((asset) => asset.origin === "generated").length, byteSize });
      }
      return json({ items, storage: { kind: "browser", byteSize: items.reduce((total, item) => total + item.byteSize, 0) } });
    }
    const body = readBody();
    if (method === "POST" && body.action === "restore") { const project = await session.store.update((draft) => { const record = draft.recycleBin.find((item) => item.id === body.id) || error("回收项目不存在", 404); draft.projects.push(record.project); draft.assets.push(...record.assets); draft.messages.push(...record.messages); draft.jobs.push(...record.jobs); draft.recycleBin = draft.recycleBin.filter((item) => item.id !== record.id); return record.project; }); return respond({ project }); }
    if (method === "DELETE" && body.confirm === true) {
      const removed = await session.store.update((draft) => { const records = draft.recycleBin.filter((record) => body.all === true || record.id === body.id); for (const record of records) if (record.jobs.some((job) => ["queued", "running"].includes(job.status))) error("回收项目仍有未结束任务，请先保留资料并重新打开工作台", 409); draft.recycleBin = draft.recycleBin.filter((record) => !records.includes(record)); return { count: records.length, assetIds: records.flatMap((record) => record.assets.map((asset) => asset.id)) }; });
      removed.assetIds.forEach((id) => revokeAssetUrl(session.store, id)); return json({ deleted: removed.count });
    }
  }
  if (path === "/api/profile" && method === "PATCH") { const body = readBody(); const name = text(body.name, "显示名称", 24); await session.store.update((draft) => { draft.profileName = name; }); return json({ user: { ...session.user, name } }); }
  if (path === "/api/generation-jobs" && method === "GET") return respond({ jobs: state.jobs.filter((job) => !url.searchParams.get("projectId") || job.projectId === url.searchParams.get("projectId")).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  const jobPath = path.match(/^\/api\/generation-jobs\/([^/]+)$/);
  if (jobPath && method === "DELETE") { const id = decodeURIComponent(jobPath[1]); if (!state.jobs.some((job) => job.id === id)) error("任务不存在", 404); controllers.get(id)?.abort(); await patchJob(session, id, { status: "cancelled", error: "已取消；已发送的供应商请求可能已计费，请核对账单。" }); return respond({ job: (await session.store.getState()).jobs.find((job) => job.id === id) }); }
  if (["/api/prompt-enhance", "/api/free-chat/enhance"].includes(path) && method === "POST") {
    const body = readBody(); const project = projectOf(state.projects, text(body.projectId, "项目编号", 512)); const ids = list(body.assetIds || []); const free = path.includes("free-chat"); const assets = selectedLocalAssets(state.assets, project.id, ids, free); const provider = await activeLocalProvider(session.store);
    const input = { project, content: String(free ? body.content : body.draft || ""), draft: String(free ? body.content : body.draft || ""), assets, agentId: String(body.agentId || "appearance-variants") as AgentId, settings: { ...body, userRequirements: String(body.draft || body.content || "") } as Record<string, string | number | boolean> };
    const messages = browserEnhancementMessages(input); const result = await directText({ provider, images: await imageInputs(session, assets), ...messages, beforeRequest: async () => { await checkBrowserAuthorization(session.user.id); }, signal: init.signal || undefined });
    return json({ ...parseBrowserDesignPlan(result.text, project.name, Number(body.outputCount) || 1), provider: result.provider, model: result.model });
  }
  if (["/api/messages", "/api/free-chat"].includes(path) && method === "POST") {
    const body = readBody(); const projectId = text(body.projectId, "项目编号", 512); projectOf(state.projects, projectId);
    const prompt = text(body.content, "生成要求"); const ids = list(body.assetIds || []); const free = path === "/api/free-chat"; const assets = selectedLocalAssets(state.assets, projectId, ids, free);
    const agentId = String(free ? "free-chat" : body.agentId || "appearance-variants") as AgentId;
    if (!free && !agents.some((agent) => agent.id === agentId)) error("设计模式无效");
    if (!free) { const settings = body.settings as Record<string, string | number | boolean> || {}; const issue = parameterAssetError(assets, String(settings.generationMode || "text")); if (issue) error(issue); }
    const idempotencyKey = text(body.idempotencyKey, "任务标识", 100);
    const existing = state.jobs.find((job) => job.idempotencyKey === idempotencyKey); if (existing) return respond({ job: existing, created: false });
    if (running.size >= 2) error("本机已有两个生成任务，请等待其中一个完成再提交；其他用户不受影响。", 429);
    if (state.jobs.some((job) => job.projectId === projectId && ["running", "queued"].includes(job.status))) error("当前项目正在生成，请结束后再提交");
    await checkBrowserAuthorization(session.user.id); const provider = await activeLocalProvider(session.store);
    const job: GenerationJob = { id: crypto.randomUUID(), userId: session.user.id, projectId, agentId, status: "queued", progress: 0, prompt, inputAssets: assets, selectedAssetIds: ids, idempotencyKey, createdAt: now(), updatedAt: now() };
    const committed = await session.store.update((draft) => {
      const duplicate = draft.jobs.find((item) => item.idempotencyKey === idempotencyKey); if (duplicate) return { job: duplicate, created: false };
      projectOf(draft.projects, projectId);
      if (draft.jobs.filter((item) => ["running", "queued"].includes(item.status)).length >= 2) error("本机已有两个生成任务，请等待其中一个完成再提交。", 429);
      if (draft.jobs.some((item) => item.projectId === projectId && ["running", "queued"].includes(item.status))) error("当前项目正在生成，请结束后再提交", 409);
      const newestAssets = selectedLocalAssets(draft.assets, projectId, ids, free);
      if (JSON.stringify(newestAssets) !== JSON.stringify(assets)) error("提交期间附件已变化，请重新选择", 409);
      draft.jobs.push(job); draft.messages.push({ id: crypto.randomUUID(), jobId: job.id, projectId, role: "user", content: prompt, assets: free ? assets.filter((asset) => ids.includes(asset.id)) : assets, createdAt: job.createdAt, agentId }); return { job, created: true };
    });
    if (!committed.created) return respond(committed);
    const controller = new AbortController(); controllers.set(job.id, controller); running.add(job.id);
    void performJob(session, job, body, free, controller, provider);
    return respond({ job, created: true, user: session.user }, 201);
  }
  return error("此操作未在本地网页版实现；请求未发送到服务器。", 405);
}

/** All data APIs are handled locally or rejected. Only the tiny explicit
 * authorization/update allowlist reaches the application server. */
export async function browserLocalFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  if (!isBrowserLocalMode()) return globalThis.fetch(input, init);
  const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
  if (url.origin !== window.location.origin) error("本地数据请求不能发送到其他网站");
  let path = url.pathname; if (APP_BASE_PATH && path.startsWith(APP_BASE_PATH + "/")) path = path.slice(APP_BASE_PATH.length);
  path = path.replace(/\/+$/, "") || "/";
  const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (isAuthorizationOnlyApi(path)) {
    if (path === "/api/web/auth/activate" && method === "POST") {
      // The login form uses the shared client transport too. This is the only
      // allowed body-bearing server call, and it carries one validated code.
      let value: unknown;
      try { if (typeof init.body !== "string" || init.body.length > 5000) throw new Error(); value = JSON.parse(init.body); }
      catch { return json({ error: "授权请求格式无效，请仅提交授权码。" }, 400); }
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !("code" in value) || typeof value.code !== "string") return json({ error: "授权请求只能包含授权码，不接收项目、图片或模型 Key。" }, 400);
      const code = value.code.trim();
      if (code.length > 4096 || !(/^ID2(?:-[A-F0-9]{4}){6}$/.test(code) || /^IDAI1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(code))) return json({ error: "授权码格式不正确，请重新粘贴。" }, 400);
      return globalThis.fetch(appPath("/api/web/auth/activate"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }), cache: "no-store", credentials: "same-origin", redirect: "error", signal: init.signal });
    }
    // The calling application can never attach a local project or Key to these calls.
    if (path !== "/api/auth/logout" && method !== "GET") return json({ error: "请通过授权码登录页激活" }, 405);
    const response = await globalThis.fetch(appPath(path), { method, cache: "no-store", credentials: "same-origin", redirect: "error", signal: init.signal });
    if (path === "/api/auth/logout") await closeBrowserLocalSession(); return response;
  }
  if (!path.startsWith("/api/")) return json({ error: "本地请求路径无效" }, 400);
  try {
    if (init.signal?.aborted) throw init.signal.reason;
    const session = await context();
    const abort = createBrowserAbort({ signals: [session.lifecycle.signal, init.signal] });
    try { return await localApi(session, path, url, method, { ...init, signal: abort.signal }); }
    finally { abort.dispose(); }
  }
  catch (reason) {
    // IndexedDB correctly waits for rollback and wraps callback failures. Keep
    // intentional local policy errors actionable after that rollback completes.
    const cause = reason instanceof Error && reason.name === "BrowserStorageError" ? reason.cause : undefined;
    const failure = cause && typeof cause === "object" && "status" in cause && Number(cause.status) >= 400 && Number(cause.status) < 500 ? cause : reason;
    return json({ error: failure instanceof Error ? failure.message : "本机操作失败" }, failure && typeof failure === "object" && "status" in failure ? Number(failure.status) : 400);
  }
}
