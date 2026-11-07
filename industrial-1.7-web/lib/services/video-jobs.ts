import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { projectDirectory } from "@/lib/project-files";
import { assetFilePath, legacyAssetFilePath, legacyProjectAssetFilePath } from "@/lib/services/local-asset-files";
import { pinnedImageDispatcher, resolvePublicImageUrl } from "@/lib/services/safe-image-download";
import { assertLicenseActive } from "@/lib/services/license-guard";
import { store } from "@/lib/store";
import type { VideoIntroductionOptions, VideoJob, VideoMotion, VideoPurpose, VideoSceneOptions } from "@/lib/video-types";
import { sceneVideoPrompt, videoSceneOptions } from "@/lib/video-scene-prompt";
import { isImageToVideoModel, supportsVideoAudio, videoModelDurations, videoModelResolutions, videoProviderModelIds, recommendedVideoModelIds, videoTemporarySourceModels } from "@/lib/video-models";
import { activeVideoConnection, assertActiveVideoConnection, videoConnectionForJob, type VideoConnection } from "@/lib/services/video-provider-config";
import { prepareVideoSubmission, normalizeVideoPayload, videoQueryUrl, videoContentUrl, validProviderVideoTaskId } from "@/lib/services/video-provider-adapters";
import { VIDEO_SCENE_LIMITS } from "@/lib/video-types";
import { mp4HasAudioTrack } from "@/lib/video-mp4";
import { uploadVerifiedVideoSource } from "@/lib/services/video-source-upload";
import { temporaryVideoSourceCapabilities, uploadTemporaryVideoSource } from "@/lib/services/temporary-video-source";
import type { Asset, Project } from "@/types/domain";
import type { Dispatcher } from "undici";
import { videoDownloadProxy, videoFailureDetails, videoFailureMessage, type VideoFailureStage } from "@/lib/services/video-network";

const LEGACY_VIDEO_BASE_URL = "https://geekai.co/api/v1";
const VIDEO_DIRECTORY = "成果视频";
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_SUPPLIER_ERROR_BYTES = 16 * 1024;
const pendingPolls = new Map<string, Promise<void>>();
const pollTimers = new Map<string, ReturnType<typeof setTimeout>>();

type VideoProtocol = "newapi" | "openai-video" | "legacy" | "provider-video" | "provider-native";
type SavedVideoJob = VideoJob & { idempotencyKey: string; sourceImageSha256?: string; supplierVideoUrl?: string; providerKeyFingerprint: string; providerProtocol?: "newapi" | "openai-video" | "provider-video" | "provider-native"; providerBaseUrl?: string; downloadFailures?: number; queryFailures?: number };
type SupplierPayload = {
  id?: string;
  task_id?: string;
  task_status?: "pending" | "running" | "succeed" | "failed";
  status?: "queued" | "pending" | "processing" | "in_progress" | "running" | "completed" | "succeeded" | "succeed" | "failed" | "cancelled";
  video_result?: { url?: string } | Array<{ url?: string }>;
  error?: { code?: string; message?: string };
  url?: string;
};

function unavailable(message: string, status = 400): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function chineseError(error: unknown, fallback: string) {
  return error instanceof Error && /[\u3400-\u9fff]/.test(error.message) ? error.message : fallback;
}

export function videoProviderConfig(protocol: VideoProtocol = "newapi") {
  if (protocol !== "legacy") return activeVideoConnection();
  const key = process.env.IDAI_LEGACY_VIDEO_API_KEY?.trim();
  return process.env.DESKTOP_MODE === "true" && key
    ? { available: true, key, baseUrl: LEGACY_VIDEO_BASE_URL, providerId: "legacy-video", providerType: "geekai", providerName: "GeekAI" } as const
    : { available: false, reason: "原视频任务使用的旧密钥无法读取，请保留任务编号并联系技术支持。" } as const;
}

export function videoCapabilities(expectedProviderId?: string) {
  const config = videoProviderConfig();
  const provider = config.available ? { id: config.providerId, type: config.providerType, name: config.providerName } : undefined;
  const models = config.available ? videoProviderModelIds(config.providerType) : [];
  const matches = !expectedProviderId || provider?.id === expectedProviderId;
  return {
    available: config.available && matches && models.length > 0,
    provider,
    models: matches ? models : [],
    recommendedModels: matches && config.available ? recommendedVideoModelIds(config.providerType) : [],
    temporarySourceModels: config.available ? videoTemporarySourceModels(config.providerType) : [],
    asyncSetupUrl: config.available && config.providerType === "aihubmix" ? "https://docs.aihubmix.com/cn/api/aihubmix-video-generation" : undefined,
    reason: !config.available ? config.reason : !matches ? "供应商已切换，请刷新视频设置后重新选择模型。" : !models.length ? `当前 ${config.providerName} 暂无已适配的图生视频接口，请使用该供应商的其他功能。` : undefined,
    durations: [...new Set(models.flatMap((model) => [...videoModelDurations(model)]))],
    estimateNote: `视频费用以 ${provider?.name || "当前供应商"} 当前模型页面和实际账单为准。`,
  };
}

export async function videoCapabilitiesWithSource(expectedProviderId?: string) {
  const caps = videoCapabilities(expectedProviderId);
  if (!caps.available || !caps.temporarySourceModels.length) return { ...caps, temporarySourceAvailable: true };
  const source = await temporaryVideoSourceCapabilities();
  return { ...caps, temporarySourceAvailable: source.available, temporarySourceReason: source.reason };
}

function videoFolder(project: Project) {
  const root = projectDirectory(project.folderName || project.id);
  const folder = path.join(root, VIDEO_DIRECTORY);
  if (fs.existsSync(folder) && fs.lstatSync(folder).isSymbolicLink()) throw unavailable("视频文件夹指向其他位置，请检查项目文件夹后重试。", 409);
  return folder;
}

function recordsPath(project: Project) { return path.join(videoFolder(project), "任务记录.json"); }

function loadJobs(project: Project): SavedVideoJob[] {
  const target = recordsPath(project);
  if (!fs.existsSync(target)) return [];
  try {
    if (!fs.lstatSync(target).isFile()) throw new Error();
    const payload = JSON.parse(fs.readFileSync(target, "utf8")) as { version?: number; jobs?: SavedVideoJob[] };
    if (payload.version !== 1 || !Array.isArray(payload.jobs)) throw new Error();
    return payload.jobs.filter((job) => /^[a-f0-9-]{36}$/i.test(job?.id || "") && job.projectId === project.id).map((job) =>
      job.supplierVideoUrl && ["saving", "needs-review"].includes(job.status) && (job.downloadFailures || 0) >= 3
        ? { ...job, status: "needs-review" as const, failureStage: job.failureStage === "save" ? "save" as const : "download" as const,
          error: job.error || "视频已生成，但下载保存尚未完成；可点击重新保存获取已有结果。" }
        : job);
  } catch { throw unavailable("视频任务记录无法读取，请保留项目文件夹并联系技术支持。", 503); }
}

function saveJobs(project: Project, jobs: SavedVideoJob[]) {
  const target = recordsPath(project);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, jobs }), { mode: 0o600 });
    fs.renameSync(temporary, target);
  } finally { fs.rmSync(temporary, { force: true }); }
}

function recoverInterruptedSubmissions(project: Project) {
  const jobs = loadJobs(project);
  let changed = false;
  for (const job of jobs) {
    if (job.status !== "submitting" || Date.now() - Date.parse(job.updatedAt) < 2 * 60_000) continue;
    job.status = "needs-review";
    job.error = "软件在提交视频任务时中断。请先到原供应商后台核对任务和账单，不要直接重复提交。";
    job.updatedAt = new Date().toISOString();
    changed = true;
  }
  if (changed) saveJobs(project, jobs);
  return jobs;
}

function updateJob(project: Project, id: string, patch: Partial<SavedVideoJob>) {
  const jobs = loadJobs(project);
  const index = jobs.findIndex((job) => job.id === id);
  if (index < 0) throw unavailable("视频任务不存在，请刷新项目后重试。", 404);
  jobs[index] = { ...jobs[index], ...patch, updatedAt: new Date().toISOString() };
  saveJobs(project, jobs);
  return jobs[index];
}

function publicJob(job: SavedVideoJob): VideoJob {
  const { idempotencyKey: _key, sourceImageSha256: _sourceHash, supplierVideoUrl: _supplierUrl, providerKeyFingerprint: _fingerprint, providerProtocol: _protocol, providerBaseUrl: _baseUrl, downloadFailures: _downloadFailures, queryFailures: _queryFailures, ...result } = job;
  return { ...result, canRetrySave: job.status === "needs-review" && Boolean(job.supplierVideoUrl), retryCount: job.failureStage === "query" ? job.queryFailures : job.downloadFailures };
}

function currentFingerprint(key: string) { return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16); }

function projectFor(userId: string, projectId: string) { return store.assertProject(userId, projectId); }

export function listVideoJobs(userId: string, projectId: string) {
  return recoverInterruptedSubmissions(projectFor(userId, projectId)).map(publicJob).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getVideoJob(userId: string, jobId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(jobId)) throw unavailable("视频任务编号无效。", 400);
  for (const project of store.listProjects(userId)) {
    const job = recoverInterruptedSubmissions(project).find((item) => item.id === jobId);
    if (job) return { project, job };
  }
  throw unavailable("视频任务不存在，请刷新项目后重试。", 404);
}

function providerFailure(status: number, action: string, requestId?: string) {
  const reason = status === 401 ? "供应商连接密钥无效" : status === 402 ? "供应商账户余额不足" : status === 403 ? "当前连接没有视频模型权限" : status === 404 ? "视频模型或接口不存在" : status === 400 || status === 422 ? "当前模型不接受这张图片或视频参数" : status === 413 ? "上传图片过大" : status === 429 ? "视频服务调用过于频繁" : status >= 500 ? "供应商视频接口返回错误" : "视频服务拒绝请求";
  const advice = status === 401 || status === 403 ? "请到模型服务检查该连接的密钥和视频模型权限。" : status === 402 ? "请到原供应商检查余额后重试。" : status === 404 ? "请刷新视频模型列表并重新选择。" : status === 400 || status === 422 ? "请核对所选模型支持的时长、画幅和原图格式，再调整参数重试。" : status === 429 ? "请稍后再试；若任务已提交，请先核对原供应商任务和账单。" : status >= 500 ? requestId ? "请先核对原供应商任务和账单；若没有任务记录，请将请求编号提供给该供应商支持排查，不要直接重复提交。" : "请先核对原供应商任务和账单；若没有任务记录，请联系该供应商支持并说明状态码，不要直接重复提交。" : "请检查图片和视频设置后重试。";
  return `${action}失败：${reason}（状态码 ${status}${requestId ? `；供应商请求编号 ${requestId}` : ""}）。${advice}`;
}

function safeSupplierToken(value: unknown, min: number, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.trim();
  return token.length >= min && token.length <= max && !/sk[-_][A-Za-z0-9]/i.test(token) && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(token)
    ? token : undefined;
}

async function supplierFailureDetails(response: Response) {
  let requestId = safeSupplierToken(
    response.headers.get("x-request-id") || response.headers.get("x-one-api-request-id") || response.headers.get("x-new-api-request-id"), 8, 80,
  );
  let code: string | undefined;
  let parameter: string | undefined;
  const publicFields: Readonly<Record<string, string>> = {
    generate_audio: "视频音轨", frame_images: "产品首帧图片", input_reference: "产品首帧图片",
    resolution: "清晰度", size: "清晰度", duration: "时长", seconds: "时长", aspect_ratio: "画幅",
  };
  const inspect = (input: unknown, depth = 0) => {
    if (depth > 3) return;
    if (typeof input === "string") {
      if (input.length <= MAX_SUPPLIER_ERROR_BYTES && input.trim().startsWith("{")) {
        try { inspect(JSON.parse(input), depth + 1); } catch { /* Never expose raw supplier strings. */ }
      }
      return;
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) return;
    const item = input as Record<string, unknown>;
    code ||= safeSupplierToken(item.code, 2, 64);
    requestId ||= safeSupplierToken(item.tid || item.request_id || item.requestId, 8, 80);
    for (const value of [item.param, item.parameter, item.field, ...(Array.isArray(item.unsupported_parameters) ? item.unsupported_parameters : [])]) {
      if (typeof value !== "string") continue;
      const field = value.split(/[.\[]/)[0];
      if (Object.hasOwn(publicFields, field)) parameter ||= field;
    }
    for (const value of [item.error, item.message, item.details, item.data]) inspect(value, depth + 1);
  };
  try {
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_SUPPLIER_ERROR_BYTES) await response.body?.cancel();
    else {
      const bytes = await boundedBytes(response, MAX_SUPPLIER_ERROR_BYTES, "");
      inspect(JSON.parse(bytes.toString("utf8")));
    }
  } catch { await response.body?.cancel().catch(() => {}); }
  return { requestId, code, ...(parameter ? { parameter, parameterLabel: publicFields[parameter] } : {}) };
}

async function boundedJson(response: Response, action: string, providerType?: string): Promise<SupplierPayload> {
  if (!response.ok) {
    const details = await supplierFailureDetails(response);
    console.warn("video-supplier-request-rejected", { action, status: response.status, ...details });
    if ((providerType === "aihubmix" || providerType === "apiyi") && details.code) {
      const reason = normalizeVideoPayload(providerType, { error: { code: details.code } }).error?.message;
      if (reason) throw unavailable(`${action}失败：${reason}${details.parameterLabel ? ` 涉及参数：${details.parameterLabel}。` : ""}（状态码 ${response.status}${details.requestId ? `；供应商请求编号 ${details.requestId}` : ""}）`, response.status);
    }
    throw unavailable(providerFailure(response.status, action, details.requestId), response.status);
  }
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_JSON_BYTES) { await response.body?.cancel(); throw unavailable(`${action}失败：供应商返回数据过大，请稍后重试。`, 502); }
  const bytes = await boundedBytes(response, MAX_JSON_BYTES, `${action}失败：供应商返回数据过大。`);
  try { return JSON.parse(bytes.toString("utf8")) as SupplierPayload; }
  catch { throw unavailable(`${action}失败：供应商返回内容格式不正确，请稍后重试。`, 502); }
}

async function boundedBytes(response: Response, max: number, message: string) {
  if (!response.body) throw unavailable("供应商没有返回文件内容，请稍后重试。", 502);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > max) { await reader.cancel(); throw unavailable(message, 413); }
      chunks.push(Buffer.from(next.value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

async function sourceBytes(asset: Asset) {
  const bytes = await readFile(assetFilePath(asset)).catch(() => readFile(legacyProjectAssetFilePath(asset))).catch(() => readFile(legacyAssetFilePath(asset))).catch(() => null);
  if (!bytes) throw unavailable("原图尚未保存在本机，请先重新保存图片后再生成视频。", 409);
  if (bytes.length > MAX_SOURCE_BYTES) throw unavailable("图片超过 20 MB，请先压缩后再生成视频。", 413);
  return bytes;
}

export function videoPrompt(_motion: VideoMotion = "orbit-360") {
  const movement = "镜头以固定高度和距离围绕静止产品平稳环绕一整圈360度，连续展示前侧、侧面、背面、另一侧，最后回到起始角度，全程单一连续镜头；必须产生真实的机位、透视与遮挡变化，不能只缩放或平移原图";
  return `只展示上传参考图片中的同一件产品，以参考图片的构图和产品外观开始视频。${movement}。产品完整居中，比例和尺寸稳定，轮子及其他部件保持静止，不行驶、不拆解、不变形、不切换成其他产品。严格保持参考图可见的轮廓、零件数量、材质、颜色、文字和标志；背面与参考产品的结构保持连贯，不凭空增加功能部件。背景与灯光延续参考图，画面清晰，运动平滑，无切镜，无字幕，无人物。`;
}

function supplierVideoUrl(payload: SupplierPayload) {
  return payload.url || (Array.isArray(payload.video_result) ? payload.video_result[0]?.url : payload.video_result?.url);
}

function supplierStatus(payload: SupplierPayload): VideoJob["status"] {
  if (payload.status === "completed" || payload.status === "succeeded" || payload.status === "succeed" || payload.task_status === "succeed") return "saving";
  if (payload.status === "failed" || payload.status === "cancelled" || payload.task_status === "failed") return "failed";
  if (["in_progress", "processing", "running"].includes(payload.status || "") || payload.task_status === "running") return "running";
  return "queued";
}

function supplierHttpsUrl(value: string, kind: "图片" | "视频") {
  let url: URL;
  try { url = new URL(value); }
  catch { throw unavailable(`供应商返回的${kind}地址格式不正确，请稍后重试。`, 502); }
  if (url.protocol !== "https:" || url.username || url.password) throw unavailable(`供应商返回的${kind}地址未通过安全校验，请稍后重试。`, 502);
  return url;
}

function aigcVideoOptions(model: string) {
  const match = /^vidu-q2-(?:pro-)?reference-(540p|720p|1080p)(?:-offpeak)?$/i.exec(model);
  if (match) return { resolution: match[1].toUpperCase(), audio: false, offpeak: /-offpeak$/i.test(model) };
  const kling = /^kling-3\.0-omni-(720p|1080p)-ref-(audio|mute)$/i.exec(model);
  return kling ? { resolution: kling[1].toUpperCase(), audio: kling[2].toLowerCase() === "audio", offpeak: false } : null;
}

async function submitSupplierJob(config: { key: string; baseUrl: string }, input: { imageUrl: string; model: string; duration: number; motion: VideoMotion; purpose: VideoPurpose; scene?: VideoSceneOptions; aspectRatio: string }, options: NonNullable<ReturnType<typeof aigcVideoOptions>>) {
  let response: Response;
  try {
    // GeekAI's Tencent VOD AIGC contract is JSON with a public image URL.
    // https://docs.geeknow.ai/api-reference/videos/aigc/generation
    response = await fetch(`${config.baseUrl}/videos`, {
      method: "POST", headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        prompt: input.purpose === "scene" ? sceneVideoPrompt(input.duration, input.scene) : videoPrompt(input.motion),
        seconds: String(input.duration),
        size: options.resolution, image: input.imageUrl,
        metadata: { offpeak: options.offpeak, output_config: {
          resolution: options.resolution, aspect_ratio: input.aspectRatio, duration: input.duration,
          audio_generation: options.audio ? "Enabled" : "Disabled",
        } },
      }), signal: AbortSignal.timeout(60_000),
    });
  } catch { throw unavailable("视频任务提交状态不明。请先在 GeekAI 后台核对任务和账单，不要立即重复提交。", 503); }
  return boundedJson(response, "提交视频任务");
}

async function submitAdaptedJob(config: VideoConnection, prepared: { url: string; init: RequestInit }): Promise<SupplierPayload> {
  let response: Response;
  try { response = await fetch(prepared.url, { ...prepared.init, redirect: "error", signal: AbortSignal.timeout(60_000) }); }
  catch { throw unavailable("视频任务提交状态不明。请先在原供应商后台核对任务和账单，不要立即重复提交。", 503); }
  return normalizeVideoPayload(config.providerType, await boundedJson(response, "提交视频任务", config.providerType));
}

function outputSize(width: number, height: number, aspectRatio?: "16:9" | "9:16"): { width: number; height: number; aspectRatio: "16:9" | "9:16" | "1:1" } {
  if (aspectRatio === "16:9") return { width: 1280, height: 720, aspectRatio };
  if (aspectRatio === "9:16") return { width: 720, height: 1280, aspectRatio };
  if (width / height > 1.2) return { width: 1280, height: 720, aspectRatio: "16:9" };
  if (height / width > 1.2) return { width: 720, height: 1280, aspectRatio: "9:16" };
  return { width: 960, height: 960, aspectRatio: "1:1" };
}

export async function createVideoJob(userId: string, input: { projectId: string; assetId: string; model: string; providerId?: string; duration: number; resolution?: number; allowTemporarySourceUpload?: boolean; aspectRatio?: "16:9" | "9:16"; motion: VideoMotion; purpose?: VideoPurpose; introduction?: VideoIntroductionOptions; scene?: VideoSceneOptions; idempotencyKey: string }) {
  const project = projectFor(userId, input.projectId);
  const existing = recoverInterruptedSubmissions(project).find((job) => job.idempotencyKey === input.idempotencyKey);
  if (existing) return publicJob(existing);
  const config = assertActiveVideoConnection(input.providerId);
  if (!isImageToVideoModel(input.model, config.providerType)) throw unavailable(`请选择当前 ${config.providerName} 目录中已适配的图生视频模型，再提交任务。`, 400);
  if (!videoModelDurations(input.model, config.providerType).includes(input.duration)) throw unavailable("所选模型不支持当前视频时长，请重新选择时长。", 400);
  const resolution = input.resolution ?? videoModelResolutions(input.model, config.providerType)[0];
  if (!videoModelResolutions(input.model, config.providerType).includes(resolution)) throw unavailable("所选模型不支持当前清晰度，请重新选择清晰度。", 400);
  const needsTemporarySource = videoTemporarySourceModels(config.providerType).includes(input.model);
  if (needsTemporarySource && input.allowTemporarySourceUpload !== true) throw unavailable("该视频型号需要临时上传原图，请在视频窗口核对原图上传说明后重新确认。", 400);
  const purpose = input.purpose || "showcase";
  if (!["showcase", "scene"].includes(purpose) || input.introduction) throw unavailable("产品介绍视频已暂停，请使用360°产品展示或使用场景展示。", 400);
  if (input.motion !== "orbit-360") throw unavailable("目前仅提供360°产品展示或使用场景展示，请刷新视频设置后重试。", 400);
  if (input.aspectRatio !== undefined && !["16:9", "9:16"].includes(input.aspectRatio)) throw unavailable("请选择横屏16:9或竖屏9:16画幅。", 400);
  if (purpose === "scene" && supportsVideoAudio(input.model)) throw unavailable("使用场景展示使用静音型号，请重新选择清晰度和版本。", 400);
  const scene = purpose === "scene" ? videoSceneOptions(input.scene) : undefined;
  if ((scene?.usageScene?.length || 0) > VIDEO_SCENE_LIMITS.usageScene || (scene?.functionDescription?.length || 0) > VIDEO_SCENE_LIMITS.functionDescription) throw unavailable("场景说明过长，请缩短使用场景或真实功能描述后重试。", 400);
  const options = config.providerType === "geekai" ? aigcVideoOptions(input.model) : undefined;
  if (config.providerType === "geekai" && !options) throw unavailable("该模型尚未核实原产品图输入方式，请选择其他视频模型。", 400);
  const duplicates = (job: SavedVideoJob) => ["submitting", "queued", "running"].includes(job.status)
    && job.providerId === config.providerId && job.providerKeyFingerprint === currentFingerprint(config.key)
    && job.sourceAssetId === input.assetId && job.model === input.model && (job.purpose || "showcase") === purpose
    && job.duration === input.duration && job.resolution === resolution
    && (!input.aspectRatio || job.aspectRatio === input.aspectRatio)
    && JSON.stringify(job.scene || {}) === JSON.stringify(scene || {});
  if (loadJobs(project).some(duplicates)) throw unavailable("当前供应商已有相同图片和参数的视频任务正在生成，请查看该任务进度；其他供应商或不同参数可新建任务。", 409);
  const asset = store.listAssets(userId, project.id).find((item) => item.id === input.assetId);
  if (!asset || !["image/png", "image/jpeg", "image/webp"].includes(asset.type)) throw unavailable("请选择本项目中已保存的产品图片。", 400);
  await assertLicenseActive(userId);
  const source = await sourceBytes(asset);
  let meta: { width?: number; height?: number };
  try { meta = await sharp(source, { failOn: "error", limitInputPixels: 80_000_000 }).metadata(); }
  catch { throw unavailable("图片文件无法读取，请换一张产品图片。", 400); }
  if (!meta.width || !meta.height) throw unavailable("无法识别图片尺寸，请换一张产品图片。", 400);
  const size = outputSize(meta.width, meta.height, input.aspectRatio || (config.providerType === "geekai" ? undefined : "16:9"));
  let image: Buffer;
  try { image = await sharp(source, { failOn: "error", limitInputPixels: 80_000_000 }).rotate().flatten({ background: "#ffffff" }).resize(size.width, size.height, { fit: "contain", background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer(); }
  catch { throw unavailable("无法处理这张图片，请换一张产品图片后重试。", 400); }
  // Complete media upload and read-back verification before creating any paid task.
  const uploaded = config.providerType === "geekai" ? await uploadVerifiedVideoSource(config, image)
    : needsTemporarySource ? await uploadTemporaryVideoSource(image)
      : { sha256: crypto.createHash("sha256").update(image).digest("hex"), publicUrl: "" };
  // Confirm the selected connection again after upload/preparation, before any paid POST.
  const latest = assertActiveVideoConnection(config.providerId);
  if (latest.key !== config.key || latest.baseUrl !== config.baseUrl || latest.providerType !== config.providerType) throw unavailable("供应商设置已变化，本次尚未提交视频任务。请刷新视频设置并重新确认费用。", 409);
  const prepared = config.providerType !== "geekai" ? prepareVideoSubmission(config, {
    model: input.model, prompt: purpose === "scene" ? sceneVideoPrompt(input.duration, scene) : videoPrompt(input.motion),
    duration: input.duration, aspectRatio: size.aspectRatio, resolution: `${resolution}P`, image, imageUrl: uploaded.publicUrl || undefined,
  }) : undefined;
  const newest = loadJobs(project);
  const duplicate = newest.find((job) => job.idempotencyKey === input.idempotencyKey);
  if (duplicate) return publicJob(duplicate);
  if (newest.some(duplicates)) throw unavailable("当前供应商已有相同图片和参数的视频任务正在生成，请查看该任务进度；其他供应商或不同参数可新建任务。", 409);
  const now = new Date().toISOString();
  const protocol = config.providerType === "geekai" ? "openai-video" : "provider-native";
  const job: SavedVideoJob = { id: crypto.randomUUID(), projectId: project.id, sourceAssetId: asset.id, sourceName: asset.name, sourceImageVerified: true, sourceImageSha256: uploaded.sha256, duration: input.duration, resolution, aspectRatio: size.aspectRatio, motion: "orbit-360", purpose, scene, model: input.model, providerId: config.providerId, providerType: config.providerType, providerName: config.providerName, status: "submitting", createdAt: now, updatedAt: now, idempotencyKey: input.idempotencyKey, providerKeyFingerprint: currentFingerprint(config.key), providerProtocol: protocol, providerBaseUrl: config.baseUrl };
  saveJobs(project, [...newest, job]);
  try {
    const payload = prepared ? await submitAdaptedJob(config, prepared)
      : await submitSupplierJob(config, { imageUrl: uploaded.publicUrl, model: input.model, duration: input.duration, motion: "orbit-360", purpose, scene, aspectRatio: size.aspectRatio }, options!);
    const supplierTaskId = payload.id || payload.task_id;
    if (!supplierTaskId || (protocol === "provider-native" ? !validProviderVideoTaskId(supplierTaskId) : !/^[a-z0-9._:-]{1,200}$/i.test(supplierTaskId))) {
      updateJob(project, job.id, { status: "needs-review", error: "供应商未返回有效的视频任务编号。请先在原供应商后台核对任务和账单，不要直接重复提交。" });
      return publicJob(loadJobs(project).find((item) => item.id === job.id)!);
    }
    const status = supplierStatus(payload);
    const supplierUrl = status === "saving"
      ? protocol === "provider-native" ? supplierVideoUrl(payload) || videoContentUrl(config, supplierTaskId, false, input.model) : `${config.baseUrl}/videos/${encodeURIComponent(supplierTaskId)}/content` : supplierVideoUrl(payload);
    const updated = updateJob(project, job.id, { supplierTaskId, status, supplierVideoUrl: supplierUrl, error: status === "failed" ? chineseError(protocol === "provider-native" && payload.error ? new Error(payload.error.message) : undefined, "供应商未能生成视频，请核对任务记录和账单后再尝试。") : undefined });
    if (status !== "failed") schedulePoll(project, updated.id, 1000);
    return publicJob(updated);
  } catch (error) {
    const message = chineseError(error, "视频任务提交失败，请检查网络后重试。");
    const failureStatus = error && typeof error === "object" && "status" in error ? Number(error.status) : 0;
    updateJob(project, job.id, { status: failureStatus >= 500 || /状态不明|核对任务和账单/.test(message) ? "needs-review" : "failed", error: message });
    return publicJob(loadJobs(project).find((item) => item.id === job.id)!);
  }
}

async function downloadSupplierVideo(urlString: string, config: { key: string; baseUrl: string; providerType?: string }, taskId: string, contentEndpoint?: string) {
  const relativeContent = /^\/v1\/videos\/[a-z0-9._:-]+\/content(?:\?.*)?$/i.test(urlString);
  let url = supplierHttpsUrl(relativeContent ? new URL(urlString, config.baseUrl).toString() : urlString, "视频");
  const base = new URL(config.baseUrl);
  const canonicalContent = contentEndpoint ? new URL(contentEndpoint).href : validProviderVideoTaskId(taskId)
    ? new URL(`${base.toString().replace(/\/+$/, "")}/videos/${encodeURIComponent(taskId)}/content`).href : undefined;
  // Opaque provider IDs can contain base64 punctuation. Only the exact canonical
  // content endpoint for this task receives credentials, never a returned URL.
  const taskContent = config.providerType === "aihubmix" ? canonicalContent?.replace("/ai/v1/videos/", "/ai/v1/tasks/") : undefined;
  const signal = AbortSignal.timeout(120_000);
  for (let hop = 0; hop <= 4; hop += 1) {
    const proxy = videoDownloadProxy(url);
    const target = await resolvePublicImageUrl(url.toString(), proxy);
    const dispatcher = pinnedImageDispatcher(target.hostname, target.addresses, proxy);
    try {
    const authenticatedContent = url.href === canonicalContent || url.href === taskContent;
    const response = await fetch(target.url, { redirect: "manual", headers: authenticatedContent ? { Authorization: `Bearer ${config.key}` } : undefined, signal, dispatcher } as RequestInit & { dispatcher: Dispatcher });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location || hop === 4) throw unavailable("视频下载跳转过多或缺少目标地址，请重新保存已有结果。", 502);
      url = supplierHttpsUrl(new URL(location, url).toString(), "视频");
      continue;
    }
    if (!response.ok) {
      const details = await supplierFailureDetails(response);
      if (response.status === 410 || details.code === "artifact_expired") throw unavailable("供应商的视频结果已过期，无法下载；请保留任务编号并核对供应商记录。", 410);
      if (details.code === "too_many_downloads") throw unavailable("供应商已限制该视频的下载次数，请稍后恢复保存或联系供应商。", 429);
      throw unavailable(providerFailure(response.status, "保存视频", details.requestId), response.status);
    }
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_VIDEO_BYTES) { await response.body?.cancel(); throw unavailable("视频文件超过 100 MB，无法保存。", 413); }
    const bytes = await boundedBytes(response, MAX_VIDEO_BYTES, "视频文件超过 100 MB，无法保存。");
    if (bytes.length < 12 || bytes.toString("ascii", 4, 8) !== "ftyp") throw unavailable("供应商返回的不是有效 MP4 文件，请稍后重试保存。", 502);
    return bytes;
    } finally { await dispatcher.destroy(); }
  }
  throw unavailable("视频下载未完成，请重新保存已有结果。", 502);
}

function schedulePoll(project: Project, jobId: string, delay: number) {
  if (pollTimers.has(jobId)) return;
  const timer = setTimeout(() => {
    pollTimers.delete(jobId);
    void refreshVideoJob(project, jobId).catch(() => {});
  }, delay);
  timer.unref?.();
  pollTimers.set(jobId, timer);
}

async function refreshVideoJob(project: Project, id: string, manual = false) {
  const current = pendingPolls.get(id);
  if (current) return current;
  const run = (async () => {
    let job = loadJobs(project).find((item) => item.id === id);
    if (!job || !["queued", "running", "saving", "needs-review"].includes(job.status) || !job.supplierTaskId) return;
    if (job.status === "needs-review" && !manual) return;
    const supplierTaskId = job.supplierTaskId;
    const protocol: VideoProtocol = job.providerProtocol === "provider-native" ? "provider-native" : job.providerProtocol === "provider-video" ? "provider-video" : job.providerProtocol === "openai-video" ? "openai-video" : job.providerProtocol === "newapi" ? "newapi" : "legacy";
    const adapted = protocol === "provider-native" || protocol === "provider-video";
    const legacyAdapter = protocol === "provider-video";
    const config = protocol === "legacy" ? videoProviderConfig("legacy") : videoConnectionForJob({ ...job, providerBaseUrl: job.providerBaseUrl || "https://geeknow.ai/v1" });
    if (!config.available || currentFingerprint(config.key) !== job.providerKeyFingerprint || (job.providerBaseUrl && config.baseUrl !== job.providerBaseUrl)) {
      if (job.status !== "needs-review") updateJob(project, id, { status: "needs-review", error: config.available ? "原供应商连接已变更，请恢复提交时的连接后刷新，不要重复提交。" : config.reason });
      return;
    }
    let stage: VideoFailureStage = job.supplierVideoUrl ? "download" : "query";
    try {
      if (job.status !== "saving" && !(job.status === "needs-review" && job.supplierVideoUrl)) {
        const endpoint = protocol === "newapi" ? `video/generations/${encodeURIComponent(job.supplierTaskId)}` : `videos/${encodeURIComponent(job.supplierTaskId)}`;
        const response = await fetch(adapted ? videoQueryUrl(config, job.supplierTaskId, legacyAdapter, job.model) : `${config.baseUrl}/${endpoint}`, { headers: { Authorization: `Bearer ${config.key}` }, redirect: "error", signal: AbortSignal.timeout(30_000) });
        const rawPayload = await boundedJson(response, "查询视频进度", config.providerType);
        const payload = adapted ? normalizeVideoPayload(config.providerType, rawPayload, legacyAdapter) : rawPayload;
        const nextStatus = supplierStatus(payload);
        if (nextStatus === "failed") { updateJob(project, id, { status: "failed", error: chineseError(protocol === "provider-native" && payload.error ? new Error(payload.error.message) : undefined, "供应商未能生成视频，请核对任务记录和账单后重试。") }); return; }
        if (nextStatus !== "saving") { updateJob(project, id, { status: nextStatus, error: undefined }); schedulePoll(project, id, 10_000); return; }
        const supplierUrl = adapted ? supplierVideoUrl(payload) || videoContentUrl(config, job.supplierTaskId, legacyAdapter, job.model) : protocol === "openai-video"
          ? `${config.baseUrl}/videos/${encodeURIComponent(job.supplierTaskId)}/content` : supplierVideoUrl(payload);
        if (!supplierUrl) { updateJob(project, id, { status: "needs-review", error: "供应商显示任务成功，但未提供视频链接。请使用任务编号联系供应商。" }); return; }
        job = updateJob(project, id, { status: "saving", supplierVideoUrl: supplierUrl, error: undefined, failureStage: undefined, queryFailures: 0 });
      }
      if (job.status === "needs-review" && job.supplierVideoUrl) job = updateJob(project, id, { status: "saving", error: undefined });
      stage = "download";
      const contentEndpoint = adapted ? videoContentUrl(config, supplierTaskId, legacyAdapter, job.model) : undefined;
      const bytes = await downloadSupplierVideo(job.supplierVideoUrl || "", config, supplierTaskId, contentEndpoint);
      stage = "save";
      const target = videoFilePath(project, id);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const temporary = `${target}.${crypto.randomUUID()}.tmp`;
      try { fs.writeFileSync(temporary, bytes, { mode: 0o600 }); fs.renameSync(temporary, target); }
      finally { fs.rmSync(temporary, { force: true }); }
      const audioTrackDetected = job.purpose === "introduction" && supportsVideoAudio(job.model) ? mp4HasAudioTrack(bytes) : undefined;
      const warning = audioTrackDetected === false
        ? "供应商返回的视频没有音轨；文件已保存，请核对视频与账单后联系供应商，避免重复扣费。" : undefined;
      updateJob(project, id, { status: "succeeded", url: `/api/video-jobs/${id}/file`, error: undefined, failureStage: undefined, downloadFailures: 0, queryFailures: 0, supplierVideoUrl: undefined, audioTrackDetected, warning });
    } catch (error) {
      const message = videoFailureMessage(error, stage);
      const failures = (stage === "query" ? job.queryFailures || 0 : job.downloadFailures || 0) + 1;
      const details = videoFailureDetails(error);
      const paused = manual || failures >= 3 || Boolean(details.status && details.status >= 400 && details.status < 500);
      console.warn("video-operation-failed", { jobId: id, provider: job.providerType, stage, attempt: failures, ...details });
      updateJob(project, id, { status: paused ? "needs-review" : job.status, failureStage: stage,
        ...(stage === "query" ? { queryFailures: failures } : { downloadFailures: failures }),
        error: `${message}${paused ? stage === "query" ? " 已暂停自动查询，可手动刷新原任务；不要重复提交。" : " 已暂停自动保存；点击重新保存获取已有结果，不会重新生成视频。" : " 稍后自动重试已有任务，不重新生成视频。"}` });
      if (paused) { const timer = pollTimers.get(id); if (timer) clearTimeout(timer); pollTimers.delete(id); }
      else schedulePoll(project, id, 15_000);
    }
  })();
  pendingPolls.set(id, run);
  try { await run; } finally { pendingPolls.delete(id); }
}

export async function readVideoJob(userId: string, id: string, manual = false) {
  const { project, job } = getVideoJob(userId, id);
  if (["queued", "running", "saving"].includes(job.status) || manual && job.status === "needs-review") {
    if (job.supplierTaskId) await refreshVideoJob(project, id, manual);
  }
  return publicJob(loadJobs(project).find((item) => item.id === id)!);
}

export function videoFilePath(project: Project, id: string) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw unavailable("视频任务编号无效。", 400);
  return path.join(videoFolder(project), `${id}.mp4`);
}

export function ownedVideoFile(userId: string, id: string) {
  const { project, job } = getVideoJob(userId, id);
  if (job.status !== "succeeded") throw unavailable("视频尚未保存完成，请稍后刷新任务进度。", 409);
  const file = videoFilePath(project, id);
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile()) throw unavailable("视频文件暂时无法读取，请保留任务编号并联系技术支持。", 404);
  return { file, name: `产品展示视频-${id.slice(0, 8)}.mp4` };
}
