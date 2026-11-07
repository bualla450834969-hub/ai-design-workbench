import type { NormalizedVideoPayload, VideoAdapterConfig, VideoSubmissionInput } from "@/lib/services/video-provider-adapters";

/**
 * RelayRouter's native video contracts, checked 2026-11-05:
 * https://doc.relayrouter.ai/api/docs/public/specs/platform/kling?locale=en
 * https://doc.relayrouter.ai/api/docs/public/specs/platform/vidu?locale=en
 * https://api.relayrouter.ai/api/pricing_new
 * Vidu Q3: POST /ent/v2/img2video. Vidu Q2: /ent/v2/reference2video.
 * Vidu polling: GET /ent/v2/tasks/{id}/creations; result creations[].url.
 * https://platform.vidu.com/docs/api-reference/video-models/vidu-q3/image-to-video
 * https://platform.vidu.cn/docs/api-reference/video-models/vidu-q2/reference-to-video
 * Vidu requires an image data URL including its content type. Do not share
 * Kling's bare-Base64 encoding or its task route with Vidu tasks.
 *
 * Historical/manual Kling support:
 * POST /kling/v1/videos/image2video; GET the same path/{id}.
 * The model plaza groups these model_name versions under "kling-video".
 *
 * The upstream contract requires bare Base64, without a data: URL prefix:
 * https://kling.ai/document-api/api/video/2-5-turbo/image-to-video/legacy
 * std/pro mean 720P/1080P respectively. The gateway's model_price is a billing
 * base, not a video-second price: never display it as a per-second quote.
 * This module only prepares requests; it never sends or retries a paid POST.
 */
export const RELAYROUTER_VIDEO_MODELS = ["viduq3-turbo", "viduq2", "viduq3-pro"] as const;
const KLING_MODELS = ["kling-v2-6", "kling-v2-5-turbo"] as const;

/** Public plaza detail-table credits; these are not dollar prices.
 * The official plaza JS prices one credit as model_price * group_ratio * 3.125.
 * Q2 reference-video billing has a distinct first second, not a flat rate.
 * https://www.relayrouter.ai/pricing
 * https://assets3.wlai.vip/releases/_next/static/chunks/0~aj9v09.j2_i.js
 */
export function relayrouterVideoCreditCost(model: string, resolution: number, duration: number): {
  credits: number; perSecondCredits?: number; firstSecondCredits?: number; followingSecondCredits?: number;
} | undefined {
  if (!Number.isInteger(duration) || duration < 1 || duration > (model === "viduq2" ? 10 : 16)) return undefined;
  const index = [540, 720, 1080].indexOf(resolution);
  if (index < 0) return undefined;
  if (model === "viduq2") {
    const firstSecondCredits = [15, 25, 75][index];
    const followingSecondCredits = [5, 5, 10][index];
    return { credits: firstSecondCredits + (duration - 1) * followingSecondCredits, firstSecondCredits, followingSecondCredits };
  }
  const perSecondCredits = model === "viduq3-turbo" ? [8, 12, 16][index] : model === "viduq3-pro" ? [14, 30, 32][index] : undefined;
  return perSecondCredits === undefined ? undefined : { credits: perSecondCredits * duration, perSecondCredits };
}

const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function invalid(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 400 });
}

function serviceRoot(config: VideoAdapterConfig): string {
  if (config.providerType !== "relayrouter") throw invalid("视频供应商与 RelayRouter 接口不匹配，请刷新视频设置。");
  let url: URL;
  try { url = new URL(config.baseUrl); }
  catch { throw invalid("RelayRouter 视频接口地址无效，请检查连接设置。"); }
  if (config.baseUrl.length > 600 || CONTROL.test(config.baseUrl) || url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw invalid("RelayRouter 视频接口地址无效，请检查连接设置。");
  }
  // Preserve an explicitly configured deployment prefix, removing only its
  // ordinary OpenAI /v1 suffix before selecting the native Kling task API.
  const prefix = url.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "");
  return `${url.origin}${prefix}`;
}

function validTaskId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4096
    && value === value.trim() && value !== "." && value !== ".." && !CONTROL.test(value);
}

function imageType(image: Buffer, vidu: boolean) {
  const jpeg = image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  const png = image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = vidu && image.length >= 12 && image.toString("ascii", 0, 4) === "RIFF" && image.toString("ascii", 8, 12) === "WEBP";
  if ((!jpeg && !png && !webp) || image.length >= MAX_IMAGE_BYTES) throw invalid("RelayRouter 视频首帧需为小于10 MB的有效 JPG、PNG 或已支持的 WebP 图片，请重新选择原图。");
  return jpeg ? "image/jpeg" : png ? "image/png" : "image/webp";
}

export function prepareRelayrouterVideo(config: VideoAdapterConfig, input: VideoSubmissionInput): { url: string; init: RequestInit } {
  const root = serviceRoot(config);
  const vidu = (RELAYROUTER_VIDEO_MODELS as readonly string[]).includes(input.model);
  if (!vidu && !(KLING_MODELS as readonly string[]).includes(input.model)) throw invalid("当前 RelayRouter 视频型号尚未适配，请重新选择已支持的视频模型。");
  if (input.duration !== 5 && input.duration !== 10) throw invalid("当前 RelayRouter 视频型号仅支持5秒或10秒，请重新选择时长。");
  const mode = input.resolution.toUpperCase();
  if (vidu ? !["540P", "720P", "1080P"].includes(mode) : mode !== "STD" && mode !== "PRO") throw invalid(vidu ? "请选择540p、720p或1080p视频清晰度。" : "请选择 RelayRouter 的标准品质或高品质，再生成视频。");
  if (input.aspectRatio !== "16:9" && input.aspectRatio !== "9:16") throw invalid("请选择横屏16:9或竖屏9:16视频画幅。");
  const promptLimit = vidu ? 5000 : 2500;
  if (!input.prompt.trim() || input.prompt.length > promptLimit) throw invalid(`RelayRouter 视频描述需为1至${promptLimit}个字符，请调整后重试。`);
  if (!config.key.trim() || config.key.length > 800 || CONTROL.test(config.key)) throw invalid("RelayRouter 连接密钥无效，请在模型服务中检查连接。");
  const mime = imageType(input.image, vidu);
  if (vidu) {
    return {
      url: `${root}/ent/v2/${input.model === "viduq2" ? "reference2video" : "img2video"}`,
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${config.key.trim()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: input.model,
          images: [`data:${mime};base64,${input.image.toString("base64")}`],
          prompt: input.prompt,
          duration: input.duration,
          resolution: mode.toLowerCase(),
          aspect_ratio: input.aspectRatio,
          // Explicitly disable optional charges and automatic prompt replacement.
          audio: false, is_rec: false, off_peak: false,
        }),
      },
    };
  }
  return {
    url: `${root}/kling/v1/videos/image2video`,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model_name: input.model,
        image: input.image.toString("base64"),
        prompt: input.prompt,
        mode: mode.toLowerCase(),
        duration: String(input.duration),
        aspect_ratio: input.aspectRatio,
        sound: "off",
      }),
    },
  };
}

export function relayrouterVideoQueryUrl(config: VideoAdapterConfig, taskId: string, model?: string): string {
  const root = serviceRoot(config);
  if (!validTaskId(taskId)) throw invalid("RelayRouter 视频任务编号无效，请刷新任务状态。");
  // Model binding is part of the persisted job. A task ID is opaque and cannot
  // safely select its protocol, even when it happens to contain a model prefix.
  if (model && (RELAYROUTER_VIDEO_MODELS as readonly string[]).includes(model)) return `${root}/ent/v2/tasks/${encodeURIComponent(taskId)}/creations`;
  if (model && !(KLING_MODELS as readonly string[]).includes(model)) throw invalid("无法确认该 RelayRouter 视频任务的原接口，请保留任务编号并联系支持。");
  return `${root}/kling/v1/videos/image2video/${encodeURIComponent(taskId)}`;
}

/** Native tasks return a public/signed result URL, not an OpenAI /content route. */
export function relayrouterVideoContentUrl(_config: VideoAdapterConfig, _taskId: string): undefined {
  return undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function resultUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 8192 || CONTROL.test(value)) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash ? url.href : undefined;
  } catch { return undefined; }
}

export function normalizeRelayrouterVideo(payload: unknown): NormalizedVideoPayload {
  const envelope = record(payload);
  if (!envelope) return {};
  // Native Kling can reject a task in an HTTP 200 response. The business code
  // wins over any nested status; upstream error text may contain private data.
  if (envelope.success === false || envelope.code !== undefined && envelope.code !== 0 && envelope.code !== "0") {
    return { status: "failed", error: { code: "relayrouter_video_rejected", message: "RelayRouter 未接受视频请求，请核对原图、视频参数和模型权限后刷新。" } };
  }
  const data = record(envelope.data) || record(envelope.task) || envelope;
  const rawState = typeof data.task_status === "string" ? data.task_status.toLowerCase()
    : typeof data.state === "string" ? data.state.toLowerCase()
    : typeof data.status === "string" ? data.status.toLowerCase() : undefined;
  const states: Record<string, NonNullable<NormalizedVideoPayload["status"]>> = {
    submitted: "queued", queued: "queued", pending: "queued", created: "queued", queueing: "queued",
    processing: "in_progress", running: "in_progress", in_progress: "in_progress",
    succeed: "completed", succeeded: "completed", success: "completed", completed: "completed",
    failed: "failed", cancelled: "cancelled", canceled: "cancelled",
  };
  const status = rawState ? states[rawState] : undefined;
  const result = record(data.task_result);
  const firstVideo = Array.isArray(result?.videos) ? record(result.videos[0]) : undefined;
  const firstCreation = Array.isArray(data.creations) ? record(data.creations[0]) : undefined;
  const unifiedVideo = Array.isArray(data.videos) ? record(data.videos[0]) : undefined;
  const id = data.task_id ?? data.id;
  return {
    id: validTaskId(id) ? id : undefined,
    status,
    url: status === "completed" ? resultUrl(firstCreation?.url) || resultUrl(firstVideo?.url) || resultUrl(unifiedVideo?.url) || resultUrl(data.video_url) || resultUrl(data.url) : undefined,
    ...(status === "failed" ? { error: { code: "relayrouter_video_failed", message: "RelayRouter 视频生成失败，请先核对供应商任务和账单，再调整原图或视频参数。" } } : {}),
  };
}
