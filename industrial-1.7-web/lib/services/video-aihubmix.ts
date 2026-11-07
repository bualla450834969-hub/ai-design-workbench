import { AIHUBMIX_VIDEO_ERROR_MESSAGES as ERROR_MESSAGES } from "@/lib/video-failure-messages";
import type { NormalizedVideoPayload, VideoAdapterConfig, VideoSubmissionInput } from "@/lib/services/video-provider-adapters";

/**
 * Verified 2026-11-04 against AIHubMix's public model catalog and each model's
 * /call/schema/models/{model}/endpoints response, selecting /ai/v1/videos by path.
 * https://docs.aihubmix.com/cn/api/aihubmix-video-generation
 * https://aihubmix.com/model/wan2.6-i2v/llms.txt
 *
 * The legacy /v1/videos schema does not expose a first-frame image for these
 * models. Never submit an image-to-video job there or retry a paid submission.
 */
export const AIHUBMIX_NATIVE_VIDEO_MODELS = [
  "wan2.5-i2v-preview", "wan2.6-i2v", "wan3.0-video", "wan3.0-video-prime",
] as const;

/** Public USD/second reference prices, not an account-specific final quote.
 * https://aihubmix.com/api/v1/models (pricing_lines, generate, standard)
 * https://aihubmix.com/model/wan2.6-i2v
 * https://aihubmix.com/model/wan3.0-video
 * https://aihubmix.com/model/wan3.0-video-prime
 * Both landscape/portrait sizes in a given tier have the same published rate.
 */
export const AIHUBMIX_PUBLIC_VIDEO_RATES: Readonly<Record<string, Readonly<Record<number, number>>>> = {
  "wan2.5-i2v-preview": { 480: 0.0411, 720: 0.0822, 1080: 0.137 },
  "wan2.6-i2v": { 720: 0.0904, 1080: 0.151 },
  "wan3.0-video": { 480: 0.04225, 720: 0.0845, 1080: 0.169 },
  "wan3.0-video-prime": { 480: 0.06338, 720: 0.1268, 1080: 0.2535 },
};

const DURATIONS = [5, 10] as const;
const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
const ASPECT_RATIOS = ["16:9", "9:16"] as const;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function invalid(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 400 });
}

function videosUrl(config: VideoAdapterConfig): string {
  if (config.providerType !== "aihubmix") throw invalid("当前连接不是 AIHubMix，请刷新视频设置后重试。");
  let base: URL;
  try { base = new URL(config.baseUrl); }
  catch { throw invalid("AIHubMix 视频接口地址无效，请检查当前供应商的连接地址。"); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw invalid("AIHubMix 视频接口地址无效，请检查当前供应商的连接地址。");
  }
  const prefix = base.pathname.replace(/\/+$/, "").replace(/\/(?:ai\/)?v1$/i, "");
  return `${base.origin}${prefix}/ai/v1/videos`;
}

function sourceMime(image: Buffer): string {
  if (!Buffer.isBuffer(image) || !image.length) throw invalid("产品原图不能为空，请重新上传图片。");
  if (image.length > MAX_IMAGE_BYTES) throw invalid("产品原图过大，请压缩到 20 MB 以内后重试。");
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) return "image/jpeg";
  if (image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (image.length >= 12 && image.toString("ascii", 0, 4) === "RIFF" && image.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  throw invalid("产品原图格式无法识别，请重新上传有效的 JPG、PNG 或 WebP 图片。");
}

/** Constructs one native request only. The caller remains responsible for
 * supplier binding, fee confirmation and preparing the source image's ratio.
 */
export function prepareAihubmixVideo(config: VideoAdapterConfig, input: VideoSubmissionInput): { url: string; init: RequestInit } {
  const url = videosUrl(config);
  if (!(AIHUBMIX_NATIVE_VIDEO_MODELS as readonly string[]).includes(input.model)) {
    throw invalid("AIHubMix 暂未接入所选图生视频模型，请重新选择视频模型。");
  }
  if (!(DURATIONS as readonly number[]).includes(input.duration)) throw invalid("所选模型当前开放 5 秒或 10 秒，请重新选择时长。");
  const resolution = input.resolution.toLowerCase();
  if (!(RESOLUTIONS as readonly string[]).includes(resolution) || input.model === "wan2.6-i2v" && resolution === "480p") throw invalid("所选模型不支持此清晰度，请重新选择清晰度。");
  if (!(ASPECT_RATIOS as readonly string[]).includes(input.aspectRatio)) throw invalid("视频画幅不支持，请选择横屏 16:9 或竖屏 9:16。");
  if (!config.key.trim()) throw invalid("AIHubMix 尚未保存密钥，请先在模型服务中保存当前连接。");
  if (!input.prompt.trim()) throw invalid("视频描述不能为空，请填写镜头要求后重试。");
  if (input.prompt.length > 30_000) throw invalid("视频描述过长，请精简镜头要求后重试。");
  const mime = sourceMime(input.image);
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    duration: input.duration,
    resolution,
    frame_images: [{ frame_type: "first_frame", image_url: { url: `data:${mime};base64,${input.image.toString("base64")}` } }],
  };
  if (input.model.startsWith("wan3.0-")) {
    body.aspect_ratio = input.aspectRatio;
    body.generate_audio = false;
  }
  // Wan 2.x's prepared first frame sets the output ratio. Keep their native
  // contract minimal: generate_audio is optional and capability-gated, even
  // when the generic schema lists it. Do not request an unused audio capability.
  return {
    url,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key.trim()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  };
}

function taskComponent(taskId: string): string {
  if (typeof taskId !== "string" || !taskId || taskId.length > 4096 || taskId !== taskId.trim()
    || taskId === "." || taskId === ".." || /[\u0000-\u001f\u007f]/.test(taskId)) {
    throw invalid("视频任务编号无效，请刷新任务状态后重试。");
  }
  return encodeURIComponent(taskId);
}

export function aihubmixVideoQueryUrl(config: VideoAdapterConfig, taskId: string): string {
  return `${videosUrl(config)}/${taskComponent(taskId)}`;
}

export function aihubmixVideoContentUrl(config: VideoAdapterConfig, taskId: string): string | undefined {
  return `${aihubmixVideoQueryUrl(config, taskId)}/content`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value : undefined; }
function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : undefined;
  } catch { return undefined; }
}



/** Uses the native media result array, never a preview/thumbnail URL. */
export function normalizeAihubmixVideo(payload: unknown): NormalizedVideoPayload {
  const outer = record(payload) || {};
  const data = record(outer.data);
  const body = data && (data.id || data.status) ? data : outer;
  const state = text(body.status)?.toLowerCase();
  const status: NormalizedVideoPayload["status"] = state === "pending" ? "queued"
    : state === "in_progress" ? "in_progress"
      : state === "completed" ? "completed"
        : state === "failed" ? "failed"
          : state === "cancelled" ? "cancelled" : undefined;
  const providerError = record(body.error) || record(outer.error);
  const code = text(providerError?.code);
  const hasError = Boolean(providerError || text(body.error) || status === "failed");
  const output = Array.isArray(body.output) ? body.output.map(record) : [];
  const main = output.find((item) => item?.type === "file" && item.index === 0)
    || output.find((item) => item?.type === "file");
  return {
    id: text(body.id),
    status,
    url: status === "completed" ? httpsUrl(main?.content_url) : undefined,
    error: hasError ? {
      code,
      message: code && ERROR_MESSAGES[code] || "AIHubMix 视频请求失败，请先核对当前任务和账单，再根据供应商日志检查图片、模型权限和参数。",
    } : undefined,
  };
}
