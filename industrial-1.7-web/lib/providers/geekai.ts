import { readFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ImageOutput, ImageProvider, ProviderContext, TextOutput, TextProvider } from "./types";
import { ProviderError } from "./types";
import { assetRoleLabel, sortAssetsByRole } from "@/lib/services/asset-roles";
import { detectNaturalDesignIntent, DRAWING_STYLE_REFERENCE_CONSTRAINT, isSurfaceEditingTask, multiViewBoardLabel, requestedMultiViewViews, requestedStandardViewCount, resolveMultiViewBoard, standardMultiViewViews, SURFACE_ONLY_CONSTRAINT } from "@/lib/services/natural-intent";
import type { Asset } from "@/types/domain";
import { isLocalSurfaceEditing, localSurfaceContract } from "@/lib/services/local-edit-policy";
import { highReconstructionPrompt, usesAnalysisOnlyFinalImage } from "@/lib/services/reconstruction-policy";
import { boardPrompt, normalizeBoardItemCount, normalizeNaturalBoardItemCount } from "@/lib/generation-board";
import { productIdentityContract, stripGeneratedPromptBoilerplate } from "@/lib/product-identity";
import { webSafeFetch } from "@/lib/web-network";
import { assertWebGenerationLicense } from "@/lib/web-generation-license";
import { isRelayRouterGeminiImageModel, isRelayRouterImageModel } from "@/lib/model-pricing";
import { isPackagingDielineDirection, isPackagingWorkflow, packagingBoardContract, packagingModeContract, packagingReferenceRules, validatePackagingAssets } from "@/lib/packaging-design";
import { DETAIL_IMAGE_CONTRACT, detailDirectionContract, detailReferenceRules, isDetailWorkflow, validateDetailAssets } from "@/lib/detail-images";
import { containsDimensionInstruction, sixViewDimensionContract, sixViewSourceFidelityContract } from "@/lib/dimension-annotations";

export type RuntimeConfig = {
  WEB_USER_ID?: string;
  WEB_LICENSE_BINDING_ID?: string;
  GEEKAI_API_KEY?: string;
  GEEKAI_BASE_URL?: string;
  GEEKAI_PROVIDER_TYPE?: string;
  GEEKAI_TEXT_MODEL?: string;
  GEEKAI_IMAGE_MODEL?: string;
  ACTIVE_PROVIDER_NAME?: string;
};

const RUNTIME_FILE = process.env.DESKTOP_PROVIDER_RUNTIME_FILE || "";
const providerSettingsScope = new AsyncLocalStorage<RuntimeConfig>();

function loadRuntimeConfig(): RuntimeConfig {
  if (!RUNTIME_FILE) return {};
  try {
    return JSON.parse(readFileSync(/* turbopackIgnore: true */ RUNTIME_FILE, "utf8")) as RuntimeConfig || {};
  } catch {
    return {};
  }
}

function pickConfig(key: keyof RuntimeConfig, envKey: string, fallback = ""): string {
  const runtime = providerSettingsScope.getStore() || loadRuntimeConfig();
  const fromRuntime = runtime[key];
  if (runtime.WEB_USER_ID) return typeof fromRuntime === "string" ? fromRuntime : "";
  if (process.env.WEB_MODE === "true" && process.env.DESKTOP_MODE !== "true") return "";
  if (typeof fromRuntime === "string" && fromRuntime) return fromRuntime;
  return process.env[envKey] || fallback;
}

/** Keep every model call and billing record on the settings selected when the job was created. */
export function withProviderSettingsSnapshot<T>(run: () => T): T {
  if (providerSettingsScope.getStore()) return run();
  const runtime = loadRuntimeConfig();
  const snapshot: RuntimeConfig = {
    GEEKAI_API_KEY: runtime.GEEKAI_API_KEY || process.env.GEEKAI_API_KEY || "",
    GEEKAI_BASE_URL: runtime.GEEKAI_BASE_URL || process.env.GEEKAI_BASE_URL || "",
    GEEKAI_PROVIDER_TYPE: runtime.GEEKAI_PROVIDER_TYPE || process.env.GEEKAI_PROVIDER_TYPE || "",
    GEEKAI_TEXT_MODEL: runtime.GEEKAI_TEXT_MODEL || process.env.GEEKAI_TEXT_MODEL || "",
    GEEKAI_IMAGE_MODEL: runtime.GEEKAI_IMAGE_MODEL || process.env.GEEKAI_IMAGE_MODEL || "",
    ACTIVE_PROVIDER_NAME: runtime.ACTIVE_PROVIDER_NAME || process.env.ACTIVE_PROVIDER_NAME || "",
  };
  return providerSettingsScope.run(snapshot, run);
}

/** A user's settings are immutable within this asynchronous task. */
export function withExplicitProviderSettings<T>(settings: RuntimeConfig, run: () => T): T {
  return providerSettingsScope.run(Object.freeze({ ...settings }), run);
}
export function providerScopeUserId() { return providerSettingsScope.getStore()?.WEB_USER_ID; }
async function providerFetch(url: string | URL, init?: RequestInit) {
  const scope = providerSettingsScope.getStore();
  if (scope?.WEB_USER_ID || (process.env.WEB_MODE === "true" && process.env.DESKTOP_MODE !== "true")) {
    if (!scope?.WEB_USER_ID) throw Object.assign(new Error("模型调用缺少浏览器设备授权上下文"), { status: 403 });
    // Every attempt and every image in a batch rechecks the submitting device.
    // A job-wide check cannot authorize a later retry after remote revocation.
    await assertWebGenerationLicense(scope.WEB_USER_ID, scope.WEB_LICENSE_BINDING_ID);
    return webSafeFetch(url, init);
  }
  return fetch(url, init);
}

export function activeProviderSettings() {
  return {
    type: pickConfig("GEEKAI_PROVIDER_TYPE", "GEEKAI_PROVIDER_TYPE", "geekai"),
    textModel: pickConfig("GEEKAI_TEXT_MODEL", "GEEKAI_TEXT_MODEL"),
    imageModel: pickConfig("GEEKAI_IMAGE_MODEL", "GEEKAI_IMAGE_MODEL"),
  };
}

function requestSignal(timeout: number, signal?: AbortSignal) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
}

function baseUrl() {
  return (pickConfig("GEEKAI_BASE_URL", "GEEKAI_BASE_URL", "https://geeknow.ai")).replace(/\/$/, "");
}

function v1ApiUrl(endpoint: string) {
  const base = baseUrl();
  const parsed = new URL(base);
  return /(^|\/)v1$/i.test(parsed.pathname.replace(/\/$/, ""))
    ? `${base}/${endpoint.replace(/^\/+/, "")}`
    : `${base}/v1/${endpoint.replace(/^\/+/, "")}`;
}

function v1BetaUrl(endpoint: string) {
  const root = baseUrl().replace(/\/v1$/i, "");
  return `${root}/v1beta/${endpoint.replace(/^\/+/, "")}`;
}

/** Private download authorization is never forwarded to supplier-provided foreign URLs. */
export function trustedImageDownloadHeaders(value: string): Record<string, string> | undefined {
  if (pickConfig("GEEKAI_PROVIDER_TYPE", "GEEKAI_PROVIDER_TYPE", "geekai") !== "aihubmix") return undefined;
  const apiKey = pickConfig("GEEKAI_API_KEY", "GEEKAI_API_KEY");
  if (!apiKey) return undefined;
  try {
    const configured = new URL(baseUrl());
    const target = new URL(value);
    if (configured.protocol !== "https:" || target.protocol !== "https:" || configured.origin !== target.origin || configured.username || configured.password || target.username || target.password) return undefined;
    return { Authorization: `Bearer ${apiKey}` };
  } catch { return undefined; }
}

function providerHttpReason(status: number, detail = "") {
  if (/no account capacity available/i.test(detail)) return "供应商报告无可用账号容量";
  if (status === 401) return "供应商拒绝 API Key";
  if (status === 402) return "供应商账户余额不足";
  if (status === 403) return "供应商账号或所选模型权限不足";
  if (status === 404) return "供应商接口或所选模型不存在";
  if (status === 408) return "供应商请求超时";
  if (status === 413) return "供应商拒绝过大的图片或请求";
  if (status === 429) return "供应商限流或额度已用尽";
  if (status >= 500) return "供应商或当前模型通道暂不可用，可能是容量不足或服务繁忙";
  return "供应商拒绝请求";
}

function providerHttpAdvice(status: number) {
  if (status === 401 || status === 403) return "请检查供应商 Key 与模型权限。";
  if (status === 402) return "请检查供应商余额。";
  if (status === 404) return "请刷新模型目录并核对所选模型。";
  if (status === 429) return "请检查供应商限流与余额，稍后再尝试。";
  return "请核对供应商日志及任务记录；若是图片生成，先确认扣费情况再重试。";
}

function providerRequestId(response: Response) {
  const value = (response.headers.get("x-request-id") || response.headers.get("x-trace-id") || "").trim();
  return /^(?:[a-f0-9]{16,64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|req[_-][a-z0-9]{16,48})$/i.test(value) ? value : "";
}

async function parseError(response: Response, action = "模型调用") {
  const requestId = providerRequestId(response);
  const requestLabel = requestId ? `；供应商请求编号 ${requestId}` : "";
  if (providerScopeUserId()) {
    await response.body?.cancel();
    return `${action}：${providerHttpReason(response.status)}（HTTP ${response.status}${requestLabel}）。${providerHttpAdvice(response.status)}`;
  }
  const body = await response.text().catch(() => "");
  let message = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; code?: string }; message?: string };
    message = parsed.error?.message || parsed.message || body;
  } catch { /* Some suppliers return plain text. */ }
  const capacity = /no account capacity available/i.test(message);
  const detail = capacity ? "" : `；供应商返回：${(message || response.statusText).replace(/\s+/g, " ").slice(0, 400)}`;
  return `${action}：${providerHttpReason(response.status, message)}（HTTP ${response.status}${requestLabel}）${detail}。${providerHttpAdvice(response.status)}`;
}

async function parseJsonPayload<T>(response: Response, provider: string, label: string): Promise<T> {
  const body = await response.text().catch(() => "");
  if (!body.trim()) throw new ProviderError(`${label}返回了空内容`, provider, true, response.status);
  try { return JSON.parse(body) as T; }
  catch { throw new ProviderError(`${label}返回的内容格式不正确`, provider, true, response.status); }
}

function assetInputs(context: ProviderContext) {
  const assets = sortAssetsByRole(context.assets ?? [])
    .filter((asset) => asset.type.startsWith("image/") && (/^https?:\/\//.test(asset.url) || asset.url.startsWith("data:")));
  if (assets.length > 9) throw new ProviderError("本轮文字分析最多处理9张图片，请减少素材；不会静默省略附件", "geekai", false);
  return assets.map((asset) => ({ type: "image_url" as const, image_url: { url: asset.url } }));
}

function userIntent(context: ProviderContext) {
  if (context.settings?.workflowKind === "shape") return "standard";
  return detectNaturalDesignIntent(String(context.settings?.userRequirements ?? context.userPrompt));
}

function isSurfaceOnly(context: ProviderContext) {
  return isSurfaceEditingTask({ content: String(context.settings?.userRequirements ?? context.userPrompt), agentId: context.agentId, generationMode: String(context.settings?.generationMode || "source"), hasProductImage: (context.assets || []).some((asset) => asset.type.startsWith("image/") && (asset.role === "structure" || asset.role === "result")), surfaceOnly: context.settings?.surfaceOnly === true || context.settings?.freeChatAction === "cmf", workflowKind: String(context.settings?.workflowKind || "") });
}

type RawReferenceImage = { mimeType: string; data: string };
type ReferenceImage = RawReferenceImage & { role: Asset["role"]; name: string; primaryProduct: boolean; tags?: string[] };
type ImageTaskResult = { image: string; prompt: string; designRoute: string; revisedPrompt?: string; seed?: string | number };
type ChatImagePart = { text?: string; inline_data?: { mime_type?: string; data?: string }; image_url?: string | { url?: string }; url?: string };
type GeminiGenerateResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string }; fileData?: { fileUri?: string } }> } }>;
  choices?: Array<{ message?: { content?: string | ChatImagePart[]; multi_mod_content?: ChatImagePart[]; images?: ChatImagePart[] } }>;
  data?: ImagesGenerateResponse["data"];
  error?: { message?: string };
};
type ImagesGenerateResponse = { data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string; seed?: string | number }>; error?: { message?: string }; id?: string; task_id?: string };

function imageFromResponse(payload: GeminiGenerateResponse | ImagesGenerateResponse) {
  const gemini = payload as GeminiGenerateResponse;
  const parts = gemini.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
  const inline = parts.map((part) => part.inlineData ?? (part.inline_data ? { mimeType: part.inline_data.mime_type, data: part.inline_data.data } : undefined))
    .find((part) => Boolean(part?.data));
  const chatParts = gemini.choices?.flatMap((choice) => {
    const message = choice.message;
    return [
      ...(message?.multi_mod_content ?? []),
      ...(Array.isArray(message?.content) ? message.content : []),
      ...(message?.images ?? []),
    ];
  }) ?? [];
  const chatInline = chatParts.map((part) => part.inline_data).find((part) => Boolean(part?.data));
  const chatImageUrl = chatParts.map((part) => typeof part.image_url === "string" ? part.image_url : part.image_url?.url || part.url).find(Boolean);
  const text = [...parts.map((part) => part.text), ...chatParts.map((part) => part.text), ...(gemini.choices?.map((choice) => typeof choice.message?.content === "string" ? choice.message.content : "") ?? [])].filter(Boolean).join("\n").trim();
  const data = payload.data || [];
  const fileImage = parts.map((part) => part.fileData?.fileUri).find((value) => /^https:\/\//i.test(value || ""));
  return { image: parseImageDataUrl(inline?.mimeType, inline?.data) || parseImageDataUrl(chatInline?.mime_type, chatInline?.data) || fileImage || chatImageUrl || data.map((item) => item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : "")).find(Boolean) || imageUrlFromText(text), text };
}

function emptyImageError(payload: GeminiGenerateResponse | ImagesGenerateResponse, provider: string, label: string) {
  const reason = payload.error?.message?.slice(0, 300);
  const taskId = "task_id" in payload ? payload.task_id || payload.id : undefined;
  return new ProviderError(`${label}未返回图片${reason ? `：${reason}` : ""}${taskId ? `；供应商任务编号 ${taskId}` : ""}。请先核对供应商任务记录和扣费情况，不要直接重试付费请求。`, provider, false);
}

function dataUrlReference(url: string): RawReferenceImage | null {
  if (!url.startsWith("data:image/")) return null;
  const comma = url.indexOf(",");
  if (comma === -1) return null;
  const meta = url.slice(5, comma);
  if (!meta.includes(";base64")) return null;
  return { mimeType: meta.split(";")[0] || "image/png", data: url.slice(comma + 1) };
}

async function downloadReference(url: string, signal?: AbortSignal): Promise<RawReferenceImage | null> {
  try {
    const response = await providerFetch(url, { signal: requestSignal(60_000, signal) });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") || "image/png";
    return { mimeType, data: buffer.toString("base64") };
  } catch {
    return null;
  }
}

async function imageReferences(context: ProviderContext) {
  const ordered = sortAssetsByRole(context.assets ?? []).filter((asset) => asset.type.startsWith("image/"));
  const appearance = context.agentId === "appearance-variants";
  const styles = ordered.filter((asset) => asset.role === "style" || asset.role === "scene")
    .sort((left, right) => Number(Boolean(right.tags?.includes("主要设计参考图"))) - Number(Boolean(left.tags?.includes("主要设计参考图"))));
  const structures = ordered.filter((asset) => asset.role === "structure" || asset.role === "result");
  const others = ordered.filter((asset) => !styles.includes(asset) && !structures.includes(asset));
  const primaryProductId = structures[0]?.id;
  if (appearance && context.settings?.generationMode === "source" && !structures.length) {
    throw new ProviderError("本轮产品原图缺失，请重新选择原图；本次尚未发起出图。", "geekai", false);
  }
  const analysisOnly = usesAnalysisOnlyFinalImage({
    agentId: context.agentId,
    generationMode: context.settings?.generationMode,
    workflowKind: context.settings?.workflowKind,
    freeChatAction: context.settings?.freeChatAction,
    reconstructionRatio: context.settings?.reconstructionRatio,
    naturalIntent: userIntent(context),
    surfaceOnly: isSurfaceOnly(context),
    hasAnnotation: ordered.some((asset) => asset.role === "annotation" || asset.role === "mask"),
  });
  const assets = analysisOnly ? [] : appearance ? [...structures, ...styles, ...others] : ordered;
  const model = pickConfig("GEEKAI_IMAGE_MODEL", "GEEKAI_IMAGE_MODEL").toLowerCase();
  // Google documents 14 references for its current image models. For other
  // relay protocols we keep the previous conservative limit, but never drop inputs silently.
  const limit = /^gemini-(?:3\.|3-pro|nano-banana)/.test(model) ? 14 : /^gemini-2\.5/.test(model) ? 3 : 4;
  if (assets.length > limit) throw new ProviderError(`当前图片模型最多按已确认能力接收 ${limit} 张参考图，本轮选择 ${assets.length} 张；请减少素材或选择支持多图的 Gemini 模型。不会静默省略。`, "geekai", false);
  const results: ReferenceImage[] = [];
  for (const asset of assets) {
    const fromData = dataUrlReference(asset.url);
    if (fromData) { results.push({ ...fromData, role: asset.role, name: asset.name, primaryProduct: asset.id === primaryProductId, tags: asset.tags }); continue; }
    if (/^https?:\/\//i.test(asset.url)) {
      const fromRemote = await downloadReference(asset.url, context.signal);
      if (!fromRemote) throw new ProviderError(`无法读取参考图片“${asset.name}”，本次尚未发起出图，请检查素材链接或重新上传`, "geekai", false);
      results.push({ ...fromRemote, role: asset.role, name: asset.name, primaryProduct: asset.id === primaryProductId, tags: asset.tags });
    } else {
      throw new ProviderError(`参考图片“${asset.name}”不是可读取的图片输入，本次尚未发起出图，请重新上传`, "geekai", false);
    }
  }
  return results;
}

function isMultiViewContext(context: ProviderContext) {
  return context.agentId === "multi-view" || context.settings?.freeChatAction === "multi-view";
}

function referenceRoleLabel(image: ReferenceImage, context: ProviderContext) {
  if (isDetailWorkflow(context.settings?.workflowKind)) {
    if (image.primaryProduct) return "展示产品主原图（锁定真实比例、结构、颜色、材质和已有标识；允许重构展示画面）";
    if (image.role === "structure" || image.role === "result") return "同一产品辅助角度（只补充真实可见细节）";
    if (image.role === "style") return "展示风格参考（只借鉴抽象构图、背景和灯光，不复制商品或文案）";
  }
  if (isPackagingWorkflow(context.settings?.workflowKind)) {
    if (image.primaryProduct) return "被包装产品原图（锁定产品身份、形态与尺度；包装容器可以新增，不继承原图拍摄构图）";
    if (image.role === "structure" || image.role === "result") return "同一产品辅助角度（只补充产品形态与尺寸关系）";
    if (image.role === "style") return "包装设计参考（只借鉴抽象包装形式、材料和风格，不复制品牌商标文字）";
  }
  if (image.primaryProduct) return isMultiViewContext(context) ? "主产品原图（只锁定产品身份、品类、结构、功能、比例与CMF；不锁定原拍摄视角或拼版布局）" : "主产品原图（决定构图、主要视角、品类、结构、功能与比例）";
  if (image.role === "structure" || image.role === "result") return isMultiViewContext(context) ? "同一产品辅助角度（只补充可见结构依据，不要求复制其视角和布局）" : "同一产品辅助角度（补充不可见结构，不改变主图构图）";
  return `${assetRoleLabel(image.role)}${image.tags?.length ? `；参考维度=[${image.tags.join("，")}]` : ""}${image.role === "style" && image.tags?.includes("参考绘画风格") ? `；${DRAWING_STYLE_REFERENCE_CONSTRAINT}` : ""}`;
}

function cameraForView(label: string) {
  if (/左前?.*45/.test(label)) return "相机位于产品正前方偏产品自身左侧45°，保持水平，展示前面与左面；不是右前45°，也不是正侧视。";
  if (/右前?.*45/.test(label)) return "相机位于产品正前方偏产品自身右侧45°，保持水平，展示前面与右面；不是左前45°，也不是正侧视。";
  if (/后|背/.test(label)) return "相机沿产品正后方水平观察，严格后视正投影，不显示正面，不用三分之四斜视代替。";
  if (/左/.test(label)) return "相机沿产品自身左侧垂直于纵向轴观察，严格左侧正投影；左右按产品自身坐标，不按画面左右或简单镜像判断。";
  if (/右/.test(label)) return "相机沿产品自身右侧垂直于纵向轴观察，严格右侧正投影；必须依据右侧结构，不镜像左侧图代替。";
  if (/俯|顶|上/.test(label)) return "相机在产品正上方垂直向下观察，严格顶视正投影；显示实际顶部，不能把侧视图旋转90°冒充顶视。";
  if (/底|仰|下/.test(label)) return "相机在产品正下方垂直向上观察，严格底视正投影；显示实际底部而非顶部，不透视、不剖切、不爆炸、不发明底盘结构；缺少证据的隐藏结构只能保守推断。";
  if (/正|前/.test(label)) return "相机沿产品正前方水平观察，严格正视正投影，不能用左前或右前斜视代替，不展示顶面来冒充正视。";
  return `严格执行用户指定的观察方向「${label}」，不替换成原图角度。`;
}

/** Never carry a full-board request or an unrelated redesign template into a single-view call. */
function multiViewPrompt(context: ProviderContext, index: number, count: number) {
  const content = stripGeneratedPromptBoilerplate(String(context.settings?.userRequirements ?? context.userPrompt));
  const requestedBoard = context.settings?.multiViewBoard ?? context.settings?.freeChatMultiViewBoard;
  const board = resolveMultiViewBoard(content, count, typeof requestedBoard === "boolean" ? requestedBoard : undefined);
  const fallbackCount = Number(context.settings?.freeChatViewCount ?? context.settings?.viewCount ?? count);
  const views = board ? standardMultiViewViews(content, fallbackCount) : requestedMultiViewViews(content, fallbackCount);
  const suppliedViews = String(context.settings?.freeChatViews || "").split("|").filter((view) => view && !/整版|拼版|拼图/.test(view));
  const offset = Math.max(0, Math.trunc(Number(context.settings?.batchOffset) || 0));
  const target = suppliedViews[index + offset] || views[index + offset] || `环绕视角 ${Math.round((index + offset) * 360 / count)}°`;
  const resolution = String(context.settings?.resolution || (board ? "4K" : "1K"));
  const extras = content.split(/[。；;\n]/).filter((clause) => clause.trim() && !/角度|视角|视图|张|整版|拼图|拼版|布局/.test(clause) && !(context.settings?.showDimensions === false && containsDimensionInstruction(clause))).join("；").slice(0, 2000);
  const presentation = context.assets?.some((asset) => asset.role === "style" && asset.tags?.includes("参考绘画风格")) ? DRAWING_STYLE_REFERENCE_CONSTRAINT : "保持同一产品的材质、颜色和光照表达，不做新的造型设计。";
  return [
    `本次只生成 1 张图片，目标输出 ${resolution}。这是同一已完成产品的视角重建，不是外观改款。`,
    `最高优先级：只能改变相机观察方向，严禁改变造型、增删部件或换一个产品。以产品自身前后左右坐标定义角度，不以屏幕左右定义。${sixViewSourceFidelityContract()}`,
    "主原图和辅助图仅作为同一产品的身份及可见结构依据，不是相机或版式模板。若参考图已有多个视图，只提取同一产品结构，绝不能照抄、裁切、镜像或复刻参考图的整板排布。隐藏面缺少依据时只做保守概念推断，不能凭空添加零件。",
    board
      ? `只输出${multiViewBoardLabel(content, fallbackCount)}，严格${requestedStandardViewCount(content, fallbackCount)}格：${views.map((view, viewIndex) => `第${viewIndex + 1}格=${view}（${cameraForView(view)}）`).join("；")}。每格仅一个完整产品，角度不重复；所有格统一比例、主体尺度、白色背景、光照和安全边距。`
      : `本张唯一目标视角：「${target}」。${cameraForView(target)}画面中只放一个该角度的完整产品，不得再制作多视图拼版、接触表、缩略图、画中画或多个角度。不得输出另一视角，也不得重复主原图的三分之四角度。`,
    board && requestedStandardViewCount(content, fallbackCount) === 6
      ? `严格执行本次目标相机，不复制参考图的拍摄角度。完整入镜，主体居中，统一尺度、背景和光照，四周留${context.settings?.showDimensions === false ? "产品轮廓" : "尺寸线"}所需的安全边距。${sixViewDimensionContract(content, { showDimensions: context.settings?.showDimensions !== false, category: context.designPlan?.productCategory })}`
      : "严格执行本次目标相机，不复制参考图的拍摄角度。完整入镜，主体居中，统一尺度、背景和光照，四周留安全边距。不要文字、角度名称、数字、标签、说明或水印。",
    productIdentityContract(board ? requestedStandardViewCount(content, fallbackCount) : 1, content),
    presentation,
    extras ? `用户额外约束（不能解除以上产品身份锁定）：${extras}` : "",
  ].filter(Boolean).join("\n\n");
}

function imageDesignRoute(context: ProviderContext, index: number, count: number) {
  if (!isMultiViewContext(context)) return context.designPlan?.variantDirections[index] || `方案 ${index + 1}`;
  const content = String(context.settings?.userRequirements ?? context.userPrompt);
  const requestedBoard = context.settings?.multiViewBoard ?? context.settings?.freeChatMultiViewBoard;
  const fallbackCount = Number(context.settings?.freeChatViewCount ?? context.settings?.viewCount ?? count);
  if (resolveMultiViewBoard(content, count, typeof requestedBoard === "boolean" ? requestedBoard : undefined)) return multiViewBoardLabel(content, fallbackCount);
  const offset = Math.max(0, Math.trunc(Number(context.settings?.batchOffset) || 0));
  const supplied = String(context.settings?.freeChatViews || "").split("|").filter((view) => view && !/整版|拼版|拼图/.test(view));
  return supplied[index + offset] || requestedMultiViewViews(content, fallbackCount)[index + offset] || `环绕视角 ${Math.round((index + offset) * 360 / count)}°`;
}

function useGeminiNativeImageApi(model: string) {
  const normalized = model.toLowerCase();
  const provider = pickConfig("GEEKAI_PROVIDER_TYPE", "GEEKAI_PROVIDER_TYPE", "geekai");
  // API易 publishes this native endpoint, including Nano 2.1 imageConfig.
  // https://help.apiyi.com/en/nano-banana-2-1-improvements-vs-nano-banana-pro-en.html
  return (provider === "geekai" && normalized.startsWith("gemini-") && (normalized.includes("image") || normalized === "gemini-nano-banana-2.1"))
    || (provider === "apiyi" && /^gemini-(?:3\.1-flash-image(?:-preview)?|3-pro-image(?:-preview)?|nano-banana-2\.1)$/.test(normalized))
    || (provider === "relayrouter" && isRelayRouterGeminiImageModel(normalized));
}

function useAiHubMixImageApi(model: string) {
  return pickConfig("GEEKAI_PROVIDER_TYPE", "GEEKAI_PROVIDER_TYPE", "geekai") === "aihubmix"
    && /^gemini-.*(?:image|nano-banana)/i.test(model);
}

function useAiHubMixGptImageApi(model: string) {
  return pickConfig("GEEKAI_PROVIDER_TYPE", "GEEKAI_PROVIDER_TYPE", "geekai") === "aihubmix"
    && /^gpt-image-/i.test(model);
}

function synchronousImageExtension() {
  const provider = pickConfig("GEEKAI_PROVIDER_TYPE", "GEEKAI_PROVIDER_TYPE", "geekai");
  // This relay extension is not part of the OpenAI Images protocol. AIHubMix
  // rejects it, including when false, on its /v1 compatibility endpoints.
  return provider === "geekai" || provider === "apiyi" ? { async: false } : {};
}

function aiHubMixGptImageSize(ratio: string) {
  if (ratio === "1:1") return "1024x1024";
  return ratio === "3:4" || ratio === "9:16" ? "1024x1536" : "1536x1024";
}

function standardGptImageEditForm(model: string, prompt: string, size: string, references: ReferenceImage[]) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ model, prompt, n: "1", size, output_format: "png" })) form.set(key, value);
  // OpenAI-compatible image edits use binary multipart input, rather than
  // GeekAI's base64 image array on the generations JSON endpoint.
  references.forEach((image, index) => {
    const mimeType = image.mimeType.split(";")[0];
    const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    const blob = new Blob([new Uint8Array(Buffer.from(image.data, "base64"))], { type: mimeType });
    form.append(references.length === 1 ? "image" : "image[]", blob, `reference-${index + 1}.${extension}`);
  });
  return form;
}


function imageSizeFor(model: string, ratio: string) {
  const normalized = model.toLowerCase();
  if (ratio === "1:1") return "1024x1024";
  const vertical = ratio === "3:4" || ratio === "9:16";
  if (normalized.includes("gpt-image-2-pro")) return vertical ? "1536x2048" : "2048x1536";
  if (normalized.includes("gpt-image-2") || normalized.includes("seedream") || normalized.includes("grok")) return vertical ? "1152x1536" : "1536x1152";
  return vertical ? "1024x1536" : "1536x1024";
}

function imageConcurrency() {
  const configured = Number(process.env.GEEKAI_IMAGE_CONCURRENCY ?? 2);
  return Math.max(1, Math.min(Number.isFinite(configured) ? Math.trunc(configured) : 2, 4));
}

async function mapWithConcurrency<T>(count: number, concurrency: number, worker: (index: number) => Promise<T>, signal?: AbortSignal) {
  const results = new Array<T | undefined>(count);
  const failures: Array<{ index: number; reason: string }> = [];
  let nextIndex = 0;
  let lastError: unknown;
  const runners = Array.from({ length: Math.min(concurrency, count) }, async () => {
    while (nextIndex < count && !signal?.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        // Do not retry a paid generation automatically. A timeout can happen after
        // the upstream provider has already generated and billed the image.
        results[index] = await worker(index);
      } catch (error) {
        lastError = error;
        const status = error instanceof ProviderError ? error.status : undefined;
        const message = error instanceof Error ? error.message : "";
        failures.push({ index, reason: status === 429 ? "供应商限流" : status && status >= 500 ? "供应商服务繁忙" : /abort|timeout|timed out|fetch failed/i.test(message) ? "连接中断或超时" : /空图像|没有图片内容/i.test(message) ? "接口未返回图片" : "请求失败" });
      }
    }
  });
  await Promise.all(runners);
  const completed = results.filter((result): result is T => result !== undefined);
  if (!completed.length && lastError) throw lastError;
  return { results: completed, failures };
}

function imageFailureSummary(failures: Array<{ index: number; reason: string }>) {
  if (!failures.length) return undefined;
  const counts = new Map<string, number>();
  for (const failure of failures) counts.set(failure.reason, (counts.get(failure.reason) || 0) + 1);
  return [...counts].map(([reason, count]) => `${reason} ${count} 次`).join("、");
}

function optionPrompt(context: ProviderContext, index: number, count: number) {
  context = { ...context, userPrompt: stripGeneratedPromptBoilerplate(context.userPrompt) };
  const rawBoardItems = context.settings?.boardItems ?? context.settings?.freeChatBoardItems;
  const boardItems = context.settings?.generationMode === "free-chat"
    ? normalizeNaturalBoardItemCount(rawBoardItems)
    : normalizeBoardItemCount(rawBoardItems);
  const hasBoard = boardItems > 1;
  const identityContract = productIdentityContract(boardItems, String(context.settings?.userRequirements ?? context.userPrompt), {
    productCategory: context.designPlan?.productCategory,
    hasProductImage: context.assets?.some((asset) => asset.role === "structure" || asset.role === "result"),
  });
  if (isDetailWorkflow(context.settings?.workflowKind)) {
    validateDetailAssets(context.assets || [], String(context.settings?.generationMode || "source"));
    const base = context.userPrompt.includes("<generation_contract>") ? context.userPrompt : `${context.userPrompt}\n\n${DETAIL_IMAGE_CONTRACT}\n${detailDirectionContract(context.settings?.designDirection)}\n${detailReferenceRules(context.assets || [])}`;
    return [base, `本次只生成一张完整产品展示图，批次第 ${index + 1}/${count} 张，目标输出 ${String(context.settings?.resolution || "1K")}，画幅 ${aspectRatio(context)}。`,
      context.designPlan ? `本张展示路线：${context.designPlan.variantDirections[index] || "展示同一原产品"}` : "",
    ].filter(Boolean).join("\n\n");
  }
  if (isPackagingWorkflow(context.settings?.workflowKind)) {
    validatePackagingAssets(context.assets || [], String(context.settings?.generationMode || "source"));
    const direction = context.settings?.designDirection;
    const dieline = isPackagingDielineDirection(direction);
    return [context.userPrompt, `本次只生成一张完整${dieline ? "包装概念刀版展开图" : "包装展示图"}，批次第 ${index + 1}/${count} 张，目标输出 ${String(context.settings?.resolution || "1K")}。`,
      packagingModeContract(direction), packagingReferenceRules(context.assets || []), packagingBoardContract(boardItems, direction),
      context.designPlan ? `本张包装路线：${context.designPlan.variantDirections[index] || "设计适配原产品的包装"}。产品本体必须保留：${context.designPlan.mandatoryConstraints.join("；")}` : "",
      dieline ? "画面主体仅是可阅读的平面展开刀版，不放产品渲染、立体包装效果图或展示场景。" : "每套包装与其对应的原产品应有清楚、合理的容纳与陈列关系；允许展示产品和包装两个对象，不能把包装变化画成产品造型变化。",
    ].filter(Boolean).join("\n\n");
  }
  if (isLocalSurfaceEditing({ agentId: context.agentId, generationMode: context.settings?.generationMode, workflowKind: context.settings?.workflowKind })) {
    const kind = context.settings?.workflowKind === "decal" ? "decal" : "cmf";
    const annotation = context.assets?.some((asset) => asset.role === "annotation");
    return [context.userPrompt, `本次只生成一张完整图片，批次第 ${index + 1}/${count} 张，目标输出 ${String(context.settings?.resolution || "1K")}。`, localSurfaceContract(kind), identityContract, annotation ? "干净产品原图是全部画面的基准；对应标注图只用于定位本轮修改区域，最终完全去除标记。" : "本轮没有标注图，仅按文字定位修改区域，不得擅自改动整图。", context.designPlan ? `必须保留：${context.designPlan.mandatoryConstraints.join("；")}\n局部执行路线：${context.designPlan.variantDirections[index] || "只执行指定区域的表面修改"}` : "", hasBoard ? `${boardPrompt(boardItems, "local")}每个网格只能在同一指定区域内采用不同表面方案；其余壳体、功能件、轮廓、结构、视角和背景完全一致。` : "批次差异只能发生在已指定区域内；不规划整体配色，不额外修改其他壳体、功能件或背景，不新增视角和对比板，不改变任何结构或轮廓。"].filter(Boolean).join("\n\n");
  }
  if (isMultiViewContext(context)) return multiViewPrompt(context, index, count);
  if (context.settings?.workflowKind === "scene" || context.settings?.freeChatAction === "scene") {
    return [context.userPrompt, `本次第 ${index + 1}/${count} 张，目标输出 ${String(context.settings?.resolution || "1K")}。`, "只处理场景呈现。产品原图的造型、轮廓、结构、比例、部件数量、配色、材质、贴花及标识都要原样保留。可根据场景调整环境、光照及人物使用姿态，但不得重画成另一款产品。场景参考图只提供环境，不提供替代产品。", identityContract, hasBoard ? `${boardPrompt(boardItems, "scene")}每个网格采用清楚可辨的不同使用场景，产品本体、角度和尺寸始终一致。` : ""].filter(Boolean).join("\n\n");
  }
  if (isSurfaceOnly(context)) {
    const board = hasBoard;
    return [context.userPrompt, `本次只生成1张图片，批次第 ${index + 1}/${count} 张；目标输出 ${String(context.settings?.resolution || "1K")}。`,
      `本轮是表面编辑，用户明确要求优先于所有默认设计模板、重构滑杆、历史任务和方案差异规则。${SURFACE_ONLY_CONSTRAINT}`,
      identityContract,
      board ? `${boardPrompt(boardItems, "cmf")}用户要求 ${boardItems} 种表面方案对比：每个网格复制完整原图视图板，各组保留原有视图数量、角度和布局，只改变指定表面处理；不得在每组内新增视角。每组都必须有可辨识的表面变化，不能把上传原图直接当成其中一组。` : "忠实保留主原图的完整画幅、全部已有视图、其顺序与布局。原图有五个视图就保留五个，不能套用单产品、六视图、镜头后移或重新排版模板。必须实际改变用户指定的可见表面，不能原样返回上传图片。",
      "辅助角度图仅补充结构；图案/贴花参考仅提供图形内容与用户指定的表面语言，不得替换目标产品。",
      context.designPlan ? `必须保留：${context.designPlan.mandatoryConstraints.join("；")}\n表面执行路线：${context.designPlan.variantDirections[index] || "仅执行用户本轮要求"}` : "",
      "贴花应贴合原曲面和透视，只覆盖用户允许的壳体表面，不覆盖黑色功能件、开孔、接口、镜片或用户禁止区域。用户没有要求时不添加文字、水印或新标识。",
    ].filter(Boolean).join("\n\n");
  }
  const freeChatAction = String(context.settings?.freeChatAction || "");
  const isFreeCmf = freeChatAction === "cmf";
  const isLocalEdit = context.agentId === "local-retouch" || freeChatAction === "local-edit";
  const cmfBoard = hasBoard && (isFreeCmf || context.agentId === "cmf-colorways" || context.settings?.workflowKind === "cmf" || context.settings?.workflowKind === "decal");
  const localBoard = hasBoard && isLocalEdit && !cmfBoard;
  const variantBoard = hasBoard && !cmfBoard && !localBoard;
  const hasLocalAnnotation = context.assets?.some((asset) => asset.role === "annotation");
  const sceneEnvironments = [
    "真实居家日常", "整洁办公桌面", "自然户外随身", "通勤途中便携", "零售陈列展示",
    "近距离人物交互", "厨房或卫浴使用", "旅行收纳使用", "功能细节演示", "品牌广告主视觉",
  ];
  const lightingDirections = [
    "清晨柔光", "午后自然光", "阴天漫射光", "傍晚暖光", "夜间环境光",
    "高调棚拍光", "低调轮廓光", "侧逆光", "窗边光影", "彩色品牌氛围光",
  ];
  const fallbackLabels = ["方案一", "方案二", "方案三", "方案四", "方案五", "方案六"];
  const offset = Math.max(0, Math.trunc(Number(context.settings?.batchOffset) || 0));
  const total = Math.max(count, Math.trunc(Number(context.settings?.batchTotal) || count));
  const selectedDirection = String(context.settings?.designDirection || "自动判断");
  const reconstructionRatio = Math.max(0, Math.min(100, Math.trunc(Number(context.settings?.reconstructionRatio) || 0)));
  const generationMode = String(context.settings?.generationMode || "source");
  const hasDrawingReference = context.assets?.some((asset) => asset.role === "style" && asset.tags?.includes("参考绘画风格"));
  const naturalIntent = userIntent(context);
  const analysisOnlyFinalImage = usesAnalysisOnlyFinalImage({
    agentId: context.agentId,
    generationMode,
    workflowKind: context.settings?.workflowKind,
    freeChatAction,
    reconstructionRatio,
    naturalIntent,
    surfaceOnly: isSurfaceOnly(context),
    hasAnnotation: Boolean(context.assets?.some((asset) => asset.role === "annotation" || asset.role === "mask")),
  });
  const requestedResolution = String(context.settings?.resolution || "1K");
  const overallIndex = offset + index;
  const sceneIndex = overallIndex % sceneEnvironments.length;
  const lightIndex = Math.floor(overallIndex / sceneEnvironments.length) % lightingDirections.length;
  const label = isFreeCmf
      ? `配色方案 ${overallIndex + 1}`
    : context.agentId === "appearance-variants"
      ? (context.designPlan?.variantDirections[overallIndex] || `方案 ${overallIndex + 1}：重新组织整体轮廓、主次体块、功能区布局与交互关系`)
      : context.agentId === "render-studio"
        ? `${sceneEnvironments[sceneIndex]} × ${lightingDirections[lightIndex]} × 第 ${overallIndex + 1} 组构图`
        : (fallbackLabels[overallIndex] ?? `第 ${overallIndex + 1} 张`);
  const differentiation = cmfBoard
      ? `${boardPrompt(boardItems, "cmf")}本张是一张配色对比板，${boardItems} 个产品必须使用完全一致的观察角度、透视、姿态、轮廓、比例、结构、开孔、分件与部件位置，只改变颜色、材质、纹理、光泽和工艺分区，方便直接对比。`
    : isFreeCmf
      ? `本张只执行第 ${overallIndex + 1} 个配色方案。严格锁定原产品的观察角度、透视、姿态、轮廓、比例、结构、开孔、分件与部件位置，只改变颜色、材质、纹理、光泽和工艺分区；至少两处允许修改的可见表面须与原图明显不同，不能直接返回未改色原图，不得借配色之名改变造型。`
    : localBoard
      ? `${boardPrompt(boardItems, "local")}每个网格都以同一张无标记产品原图为基准，只重新设计用户标注或文字指定的同一局部，且各格局部方案明显不同。未指定区域的轮廓、比例、结构、部件、CMF、构图、视角、背景和产品身份必须完全一致；最终彻底去除全部标记。`
    : variantBoard
      ? `${boardPrompt(boardItems, "variants")}各方案使用完全一致的观察角度、透视、姿态、画面尺寸、背景和光线，但轮廓比例、主次体块、分件与标志性特征面必须一眼可辨地不同；上传原图仅作产品功能和结构参考，不能作为任何一个输出方案，不得只换颜色、材质、装饰或相机角度。`
    : isLocalEdit
      ? `本张只执行${hasLocalAnnotation ? "用户标注和文字" : "用户文字"}明确指向的局部修改。输入中的无标记产品原图是最终画面的严格基准；${hasLocalAnnotation ? "对应标注图只用于定位修改部位与理解用户意图。方框、圆框、圈线、箭头和标注文字只是位置提示，不是蒙版、零件、孔洞或装饰。" : "本轮没有标注图，按文字定位部件，不得声称已读取圈选；目标不清楚时不得擅自扩大修改范围。"}除指定局部外，主体轮廓、比例、结构、部件、CMF、构图、视角、背景和产品身份必须与干净原图视觉一致；修改区域的几何、材质、光影、透视和边缘必须与相邻结构连续融合，最终彻底去除全部标记。`
    : context.agentId === "appearance-variants"
    ? generationMode === "text"
      ? `本张是无图从零设计路线「${label}」。依据项目名称与用户文字建立目标品类、核心功能、使用方式和全新视觉识别；不存在产品原图或重构百分比，不得声称保留或修改原图。与同批方案在轮廓、比例、体块、功能区和交互组织上形成明显差异。`
      : generationMode === "reference"
        ? `本张是仅参考图的全新设计路线「${label}」。以项目名称与用户文字确定目标品类和功能，只抽象迁移参考图的造型、曲面、CMF和细节语言；不存在产品原图或重构百分比，不得复制参考图中的具体产品。`
        : reconstructionRatio === 0
      ? `本张执行「${selectedDirection}」，但重构幅度为 0%，必须启用最高优先级的原造型锁定。逐像素级忠实遵循产品原图的外轮廓、长宽高比例、结构拓扑、全部边线、体块边界、分件、开孔、接口、按键和零部件位置；不得改变、增删或美化任何几何。${naturalIntent === "multi-view" ? "用户明确要求换角度，只改变观察方向，产品几何和全部结构保持同一；" : "用户未要求换角度，视角、镜头透视和姿态也完全不变；"}完整入镜优先于继承原图裁切：主体贴边时只能把镜头后移、等比例缩小主体并扩展背景。若原图为草图/线稿，只把这张完全相同的线稿转成${hasDrawingReference ? "符合指定绘画表现的完整产品图，不强制写实" : "真实产品渲染"}；若参考图提供配色或材质，只将被分类允许的CMF覆盖到锁定几何上。设计参考图绝不能替代产品原图。`
      : naturalIntent === "scoped-edit"
        ? `本张只执行用户明确点名的局部修改，独立路线为「${label}」。未点名区域的轮廓、比例、结构、部件数量、CMF、视角、光影和背景全部保持原图一致；禁止将局部修改扩展为整机重设计。`
      : analysisOnlyFinalImage
        ? highReconstructionPrompt(reconstructionRatio, selectedDirection, label)
        : `本张只执行用户单选的设计方向「${selectedDirection}」，批次独立路线为「${label}」。重构幅度按 ${reconstructionRatio}% 执行：1–29% 轻微调整；30–49% 中度改款；50–64% 强改款，必须至少同时改变主体轮廓比例、主次体块、分件和特征面中的三类，55% 不能只做小修小补。用户未明确要求换角度时，严格保持原图观察角度、镜头透视和产品姿态；禁止用镜头、背景、换色或材质冒充重构。`
    : context.agentId === "render-studio"
      ? `本张场景方向为「${label}」，环境、构图、镜头距离和人物互动必须与同批其他场景明显不同，同时保持产品本体一致。`
      : context.agentId === "cmf-colorways"
        ? `本张执行「${label}」CMF 方向。必须严格锁定原产品轮廓、比例、结构、接口和视角，只改变颜色、材质、纹理、光泽和工艺分区；不得把配色变化误做成外观改款。`
        : context.agentId === "sketch-envelope"
          ? `本张只执行「${selectedDirection}」。以手绘草图或内部堆叠为硬约束建立可制造外壳，输出一个完成度高的真实成品效果图。保留内部部件包络、接口、散热、装配与避让空间，把参考外观语言转化为完整、连续、结构可信的外壳。禁止线稿、工程图、爆炸图、文字说明和多方案拼贴。`
      : context.agentId === "detail-view"
          ? `本张只执行「${selectedDirection}」细节特写。保持原产品身份、造型语言、CMF 与装配关系一致，只展示一个用户指定的局部及足够的相邻结构，不得发明多余部件，不得拼图。`
          : context.agentId === "local-retouch"
            ? `本张根据无标记的干净产品原图与对应标注图执行「${selectedDirection}」，局部重构幅度为 ${reconstructionRatio}%：干净原图负责锁定产品身份和全部未标记区域；方框、圆框、箭头、圈线和标注文字只用于指出要修改的位置与意图。若用户仅说“修改这部分”“改变这里的造型”等通用表达，默认含义就是重新设计标记明确指向的局部。0% 保持该局部原样；1–29% 轻微修整；30–59% 中度变化；60–79% 明显重组局部造型；80–100% 大幅重塑局部但与相邻结构自然衔接。最终必须返回完整产品图并彻底移除所有标记，不得把标记轮廓变成零件、孔洞或装饰。`
            : `本张主题为「${selectedDirection} · ${label}」，与同批结果保持可辨识差异。`;
  const compositionRule = cmfBoard
      ? `画面只包含一张规范的 ${boardItems} 方案配色对比板，不得再嵌套小图或增加重复方案；不得添加说明文字、编号、标签或水印。`
      : localBoard
        ? `画面只包含一张规范的 ${boardItems} 方案局部改款对比板，每格都是完整产品，不得只返回局部裁切、贴片、画中画或标记区域。`
      : variantBoard
        ? `画面只包含一张规范的 ${boardItems} 方案外观对比板，不得再嵌套小图、增加重复方案或添加说明文字、编号、标签和水印。`
      : isLocalEdit
        ? "必须直接生成完整单张成品图，不能只返回标记区域。修改后的局部必须成为产品自身连续、自然的一部分；严禁局部裁切小窗、画中画、矩形贴片、白边、边框、拼接缝或局部图层感。画面中只能有一个完整产品，不保留圈线、箭头、方框、说明文字或水印。"
        : "最终画面只允许一个完整产品和一处完整拍摄场景；不要拼图，严禁四宫格、重复产品、接触表、分屏或左右对比；不要把多个方案放在同一张图片里，不要文字水印。";
  const analysis = context.designPlan ? `
前置视觉分析（所有上传图片均已参与）：
产品类别：${context.designPlan.productCategory}
核心功能：${context.designPlan.coreFunctions.join("；") || "依据品类保持"}
必须保留：${context.designPlan.mandatoryConstraints.join("；") || (isLocalEdit ? "干净原图中除标注目标局部以外的全部可见内容" : "核心功能、安全与人体工学")}
允许改变：${context.designPlan.mutableFeatures.join("；") || (isLocalEdit ? "仅允许改变标注明确指向的局部" : "非必要外观几何")}
参考图设计语言：${context.designPlan.styleFingerprint.join("；") || "以用户文字要求为准"}
禁止风格：${context.designPlan.negativeStyleConstraints.join("；") || "禁止无关机甲、装甲、尖锐切面和菱形装饰"}
优先级：用户文字要求 > 设计参考图 > 执行方向 > 系统默认。` : "";
  const framingRule = isLocalEdit
    ? "严格继承干净产品原图的画幅、主体位置、镜头距离、观察角度、透视、姿态和背景；不得重新构图、改变主体大小或通过换角度制造变化。"
    : "上传图片的裁切和画面占比不是输出构图要求；必须将镜头适当后移，让产品或局部主体完整位于画面中央，外接矩形距离上下左右边缘尽量不小于 12%，任何顶部、底座、支脚、轮子、扶手、工作端、把手、线缆和附件都不得接触或超出画面边界。";
  return `${context.userPrompt}${analysis}

本次只生成 1 张图片：批次第 ${overallIndex + 1}/${total} 张。
目标输出 ${requestedResolution}，先追求原生细节。${framingRule}
${differentiation}
${compositionRule}
如果参考图中包含被承载物、配件或操作部件，它们必须保持原有几何比例，不得拉伸、融化、扭曲、增生或与主体错误融合。产品结构应稳定、合理、可制造，边界清晰，不出现重复部件、断裂支撑或悬空连接。
${identityContract}
${analysisOnlyFinalImage
    ? "设计参考图的抽象语言已经写入前置视觉分析；只能依据这些文字化特征重新创作，禁止还原任何一张上传图片的具体主体、构图、文字、水印、标识或背景。"
    : "如果有参考图，只将用户允许的抽象设计语言应用到主产品原图所代表的目标产品；主要参考图优先，其他参考图只补充不冲突的线索。不得把参考图主体、文字、水印、标识或背景复制到结果中。"}若参考图圆润、有机或柔和，禁止无故生成机甲、装甲、尖锐切面、硬朗菱形纹或碎片化模块。`;
}

function parseImageDataUrl(mimeType: string | undefined, data: string | undefined) {
  if (!data) return "";
  if (/^https?:\/\//i.test(data) || data.startsWith("data:image/")) return data;
  return `data:${mimeType || "image/png"};base64,${data}`;
}

function imageUrlFromText(text: string | undefined) {
  if (!text) return "";
  const markdown = text.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i)?.[1];
  if (markdown) return markdown;
  return text.match(/https?:\/\/[^\s<>"')\]]+\.(?:png|jpe?g|webp)(?:\?[^\s<>"')\]]*)?/i)?.[0] ?? "";
}

function aspectRatio(context: ProviderContext) {
  const ratio = String(context.settings?.aspectRatio || context.settings?.ratio || "4:3");
  if (ratio === "auto") return "4:3";
  return ["1:1", "4:3", "3:4", "16:9", "9:16"].includes(ratio) ? ratio : "4:3";
}

function requestedImageSize(context: ProviderContext, model: string) {
  const requested = String(context.settings?.resolution || "1K");
  if (/^gemini-3\.1-flash-lite-image$/i.test(model)) return "1K";
  if (!/^gemini-(?:3|nano-banana)/i.test(model)) return undefined;
  return requested === "4K" || requested === "2K" ? requested : "1K";
}

export class GeekAiProvider implements TextProvider, ImageProvider {
  get name() { return pickConfig("ACTIVE_PROVIDER_NAME", "ACTIVE_PROVIDER_NAME", "geekai"); }
  isConfigured() { return Boolean(pickConfig("GEEKAI_API_KEY", "GEEKAI_API_KEY")); }
  configuredImageModel() { return pickConfig("GEEKAI_IMAGE_MODEL", "GEEKAI_IMAGE_MODEL"); }

  async generateText(context: ProviderContext): Promise<TextOutput> {
    const model = pickConfig("GEEKAI_TEXT_MODEL", "GEEKAI_TEXT_MODEL");
    if (!this.isConfigured() || !model) throw new ProviderError("GeekAI 文本模型尚未配置", this.name, false);
    const fastEnhancement = context.settings?.task === "prompt-enhancement";
    const attempts = fastEnhancement ? 1 : 2;
    const apiKey = pickConfig("GEEKAI_API_KEY", "GEEKAI_API_KEY");
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await providerFetch(v1ApiUrl("chat/completions"), {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: context.systemPrompt },
              { role: "user", content: [{ type: "text", text: context.userPrompt }, ...assetInputs(context)] },
            ],
            temperature: fastEnhancement ? 0.2 : 0.45,
            ...(fastEnhancement ? { max_tokens: 700 } : {}),
          }),
          signal: requestSignal(fastEnhancement ? 25_000 : 150_000, context.signal),
        });
        if (!response.ok) throw new ProviderError(await parseError(response, "文字分析"), this.name, response.status === 429 || response.status >= 500, response.status);
        const payload = await parseJsonPayload<{ choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> }>(response, this.name, "文字模型");
        const raw = payload.choices?.[0]?.message?.content;
        const text = typeof raw === "string" ? raw : raw?.map((part) => part.text ?? "").join("\n") ?? "";
        if (!text.trim()) throw new ProviderError("GeekAI 返回了空文本", this.name, true);
        return { text, provider: this.name, model };
      } catch (error) {
        lastError = error;
        if (error instanceof ProviderError && !error.retryable) throw error;
        if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 700));
      }
    }
    const message = lastError instanceof Error && !/timeout|aborted/i.test(`${lastError.name} ${lastError.message}`)
      ? lastError.message
      : "文字模型响应超时，已自动重试";
    throw new ProviderError(message, this.name, true);
  }

  async generateImages(context: ProviderContext, count: number): Promise<ImageOutput> {
    const model = this.configuredImageModel();
    if (!this.isConfigured() || !model) throw new ProviderError("GeekAI 图像模型尚未配置", this.name, false);
    if (isPackagingWorkflow(context.settings?.workflowKind)) validatePackagingAssets(context.assets || [], String(context.settings?.generationMode || "source"));
    if (isDetailWorkflow(context.settings?.workflowKind)) validateDetailAssets(context.assets || [], String(context.settings?.generationMode || "source"));
    if (pickConfig("GEEKAI_PROVIDER_TYPE", "GEEKAI_PROVIDER_TYPE", "geekai") === "relayrouter" && !isRelayRouterImageModel(model)) {
      throw new ProviderError("RelayRouter 当前仅开放已适配的 Gemini 图片、GPT Image 2 与 2.5 型号；本次未发起付费请求。", this.name, false);
    }
    const targetCount = Math.max(1, Math.min(Math.trunc(count || 1), 100));
    if (useGeminiNativeImageApi(model)) return this.generateGeminiImages(context, model, targetCount);
    if (useAiHubMixImageApi(model)) return this.generateAiHubMixImages(context, model, targetCount);
    return this.generateOpenAiImages(context, model, targetCount);
  }

  private async generateGeminiImages(context: ProviderContext, model: string, count: number): Promise<ImageOutput> {
    const references = await imageReferences(context);
    const apiKey = pickConfig("GEEKAI_API_KEY", "GEEKAI_API_KEY");
    const relayRouter = pickConfig("GEEKAI_PROVIDER_TYPE", "GEEKAI_PROVIDER_TYPE", "geekai") === "relayrouter";
    let completed = 0;
    const batch = await mapWithConcurrency<ImageTaskResult>(count, imageConcurrency(), async (index) => {
      const prompt = optionPrompt(context, index, count);
      const response = await providerFetch(v1BetaUrl(`models/${encodeURIComponent(model)}:generateContent`), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(!relayRouter ? { "x-goog-api-key": String(apiKey) } : {}),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [
              { text: references.length
                ? `${prompt}\n\n以下是正式生图阶段筛选出的关键图片。每张图片前的角色说明是硬约束，绝不能把设计参考图当作产品原图：`
                : `${prompt}\n\n本次正式生图没有附带上传图片的原始像素；严格依据前置视觉分析和本张设计路线生成。` },
              ...references.flatMap((image, referenceIndex) => [
                { text: `图片 ${referenceIndex + 1}：${referenceRoleLabel(image, context)}；文件名=${image.name}` },
                relayRouter ? { inline_data: { mime_type: image.mimeType, data: image.data } } : { inlineData: { mimeType: image.mimeType, data: image.data } },
              ]),
            ],
          }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            maxOutputTokens: 4096,
            imageConfig: { ...(isSurfaceOnly(context) && String(context.settings?.aspectRatio || "auto") === "auto" ? {} : { aspectRatio: aspectRatio(context) }), imageSize: requestedImageSize(context, model) },
          },
        }),
        signal: requestSignal(180_000, context.signal),
      });
      if (!response.ok) throw new ProviderError(await parseError(response, "图片生成"), this.name, response.status === 429 || response.status >= 500, response.status);
      const payload = await parseJsonPayload<GeminiGenerateResponse>(response, this.name, "Gemini 图片模型");
      const { image, text } = imageFromResponse(payload);
      if (!image) throw emptyImageError(payload, this.name, "Gemini 图片模型");
      completed += 1;
      context.onProgress?.({ stage: "generating", label: `正在生成第 ${completed}/${count} 张方案`, completed, total: count });
      return { image, prompt, designRoute: imageDesignRoute(context, index, count), revisedPrompt: imageUrlFromText(text) ? undefined : text || undefined };
    }, context.signal);
    const results = batch.results;
    return {
      imageUrls: results.map((result) => result.image),
      provider: this.name,
      model,
      failureSummary: imageFailureSummary(batch.failures),
      revisedPrompt: results.find((result) => result.revisedPrompt)?.revisedPrompt,
      variants: results.map((result) => ({ prompt: result.prompt, designRoute: result.designRoute, seed: result.seed })),
    };
  }

  private async generateOpenAiImages(context: ProviderContext, model: string, count: number): Promise<ImageOutput> {
    const references = await imageReferences(context);
    const apiKey = pickConfig("GEEKAI_API_KEY", "GEEKAI_API_KEY");
    const aiHubMixGpt = useAiHubMixGptImageApi(model);
    const relayRouterGpt = pickConfig("GEEKAI_PROVIDER_TYPE", "GEEKAI_PROVIDER_TYPE", "geekai") === "relayrouter" && isRelayRouterImageModel(model);
    const standardGpt = aiHubMixGpt || relayRouterGpt;
    const standardGptEdit = standardGpt && references.length > 0;
    const size = standardGpt ? aiHubMixGptImageSize(aspectRatio(context)) : imageSizeFor(model, aspectRatio(context));
    let completed = 0;
    const batch = await mapWithConcurrency<ImageTaskResult>(count, imageConcurrency(), async (index) => {
      const basePrompt = optionPrompt(context, index, count);
      const finalPrompt = references.length
        ? `${basePrompt}\n\n图片已按角色排序，角色优先于上传顺序：\n${references.map((image, referenceIndex) => `图片 ${referenceIndex + 1}：${referenceRoleLabel(image, context)}；文件名=${image.name}`).join("\n")}\n${isDetailWorkflow(context.settings?.workflowKind) ? "产品原图只锁定产品身份和外观；按本轮详情图方向重新构图和布光，不继承原图背景、画幅或相机布局，不做半透明叠图。" : isPackagingWorkflow(context.settings?.workflowKind) ? "产品原图锁定被包装产品的形态和尺度，不锁定包装展示构图；参考图只提供抽象包装语言，包装容器可以新增。" : isMultiViewContext(context) ? "主产品原图只锁定产品身份和结构；必须使用本次唯一目标角度或指定整版角度，不继承原图构图、相机和排布。" : "主产品原图决定构图和主要视角；辅助角度只补充同一产品的结构。"}设计参考图绝不能成为目标产品，只能迁移被用户允许的参考维度。`
        : basePrompt;
      const body: Record<string, unknown> = {
        model,
        prompt: finalPrompt,
        n: 1,
        size,
        ...synchronousImageExtension(),
        ...(standardGpt ? { output_format: "png" } : {}),
        ...(!standardGpt && references.length ? { image: references.map((image) => image.data) } : {}),
      };
      const response = await providerFetch(v1ApiUrl(standardGptEdit ? "images/edits" : "images/generations"), {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, ...(standardGptEdit ? {} : { "Content-Type": "application/json" }) },
        body: standardGptEdit ? standardGptImageEditForm(model, finalPrompt, size, references) : JSON.stringify(body),
        // AIHubMix documents GPT Image 2 generations taking >5 minutes and
        // recommends >=10 minutes. Timeout must not issue another paid call.
        signal: requestSignal(standardGpt ? 600_000 : 180_000, context.signal),
      });
      if (!response.ok) throw new ProviderError(await parseError(response, "图片生成"), this.name, response.status === 429 || response.status >= 500, response.status);
      const payload = await parseJsonPayload<ImagesGenerateResponse>(response, this.name, "图片模型");
      const image = imageFromResponse(payload).image;
      const prompt = (payload.data ?? []).map((item) => item.revised_prompt).find(Boolean);
      const seed = (payload.data ?? []).map((item) => item.seed).find((value) => value !== undefined);
      if (!image) throw emptyImageError(payload, this.name, "图片模型");
      completed += 1;
      context.onProgress?.({ stage: "generating", label: `正在生成第 ${completed}/${count} 张方案`, completed, total: count });
      return { image, prompt: finalPrompt, designRoute: imageDesignRoute(context, index, count), revisedPrompt: prompt, seed };
    }, context.signal);
    const results = batch.results;
    return {
      imageUrls: results.map((result) => result.image),
      provider: this.name,
      model,
      failureSummary: imageFailureSummary(batch.failures),
      revisedPrompt: results.find((result) => result.revisedPrompt)?.revisedPrompt,
      variants: results.map((result) => ({ prompt: result.prompt, designRoute: result.designRoute, seed: result.seed })),
    };
  }

  private async generateAiHubMixImages(context: ProviderContext, model: string, count: number): Promise<ImageOutput> {
    const references = await imageReferences(context);
    const apiKey = pickConfig("GEEKAI_API_KEY", "GEEKAI_API_KEY");
    let completed = 0;
    const batch = await mapWithConcurrency<ImageTaskResult>(count, imageConcurrency(), async (index) => {
      const prompt = `${optionPrompt(context, index, count)}${references.length ? `\n\n参考图角色（不得混淆）：\n${references.map((image, referenceIndex) => `图片 ${referenceIndex + 1}：${referenceRoleLabel(image, context)}；文件名=${image.name}`).join("\n")}` : ""}`;
      // AIHubMix publishes Gemini image output through multimodal Chat Completions.
      // https://aihubmix.com/model/gemini-nano-banana-2.1
      const response = await providerFetch(v1ApiUrl("chat/completions"), {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: [
            { type: "text", text: prompt },
            ...references.map((image) => ({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } })),
          ] }],
          modalities: ["text", "image"],
          generationConfig: { imageConfig: {
            ...(isSurfaceOnly(context) && String(context.settings?.aspectRatio || "auto") === "auto" ? {} : { aspectRatio: aspectRatio(context) }),
            imageSize: requestedImageSize(context, model),
          } },
        }),
        signal: requestSignal(180_000, context.signal),
      }).catch((error) => {
        throw new ProviderError(`未能连接 AIHubMix 图片接口（${error instanceof Error ? error.message : "网络错误"}）。如果供应商没有生成日志，请检查网络或代理连接；请先核对账单，再决定是否重新生图。`, this.name, false);
      });
      if (!response.ok) throw new ProviderError(await parseError(response, "图片生成"), this.name, response.status === 429 || response.status >= 500, response.status);
      const payload = await parseJsonPayload<GeminiGenerateResponse>(response, this.name, "AIHubMix 图片模型");
      const { image, text } = imageFromResponse(payload);
      if (!image) throw emptyImageError(payload, this.name, "AIHubMix 图片模型");
      completed += 1;
      context.onProgress?.({ stage: "generating", label: `正在生成第 ${completed}/${count} 张方案`, completed, total: count });
      return { image, prompt, designRoute: imageDesignRoute(context, index, count), revisedPrompt: imageUrlFromText(text) ? undefined : text || undefined };
    }, context.signal);
    const results = batch.results;
    return {
      imageUrls: results.map((result) => result.image),
      provider: this.name,
      model,
      failureSummary: imageFailureSummary(batch.failures),
      revisedPrompt: results.find((result) => result.revisedPrompt)?.revisedPrompt,
      variants: results.map((result) => ({ prompt: result.prompt, designRoute: result.designRoute, seed: result.seed })),
    };
  }
}
