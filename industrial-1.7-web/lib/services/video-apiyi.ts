import { APIYI_VIDEO_ERROR_MESSAGES as PUBLIC_APIYI_ERRORS } from "@/lib/video-failure-messages";
import type { NormalizedVideoPayload, VideoAdapterConfig, VideoSubmissionInput } from "@/lib/services/video-provider-adapters";

/**
 * API易 has distinct protocols behind the same /v1/videos path.
 * Oxygen: JSON with an inline source data URI; 5/10 seconds, 480P/768P;
 * download the completed query's video_url without an Authorization header.
 * Flow -fl: 8 seconds, 720P, orientation encoded in the exact model ID,
 * multipart source file, and a JSON URL response from /content.
 * Official generate-preview: multipart with explicit size/resolution/aspectRatio,
 * and authenticated MP4 bytes from /content.
 *
 * Provider-owned references:
 * https://docs.apiyi.com/api-capabilities/oxygen/video-generation
 * https://docs.apiyi.com/api-capabilities/wan3/overview
 * https://docs.apiyi.com/api-capabilities/minimax-h3/video-generation
 * https://docs.apiyi.com/api-capabilities/veo/async-api
 * https://docs.apiyi.com/api-capabilities/veo/overview
 * https://docs.apiyi.com/api-capabilities/veo-3-1-official/image-to-video
 *
 * The first two are currently available in the search index but return 404 from
 * a direct fetch. Their documented IDs are compatibility options, not a claim
 * that they appear in the provider's current public or account-specific catalog.
 */
export const APIYI_VIDEO_MODELS = {
  "oxygen-1.0": { protocol: "oxygen", resolutions: [480, 768], durations: [5, 10], taskPriceUsd: undefined },
  "wan3.0-video": { protocol: "wan3", resolutions: [480, 720, 1080], durations: [5, 10], taskPriceUsd: undefined },
  "minimax-h3": { protocol: "hailuo", resolutions: [768], durations: [5, 10], taskPriceUsd: undefined },
  "veo-3.1-fast-fl": { protocol: "flow", resolutions: [720], durations: [8], taskPriceUsd: 0.15 },
  "veo-3.1-landscape-fast-fl": { protocol: "flow", resolutions: [720], durations: [8], taskPriceUsd: 0.15 },
  "veo-3.1-fl": { protocol: "flow", resolutions: [720], durations: [8], taskPriceUsd: 0.25 },
  "veo-3.1-landscape-fl": { protocol: "flow", resolutions: [720], durations: [8], taskPriceUsd: 0.25 },
  "veo-3.1-fast-generate-preview": { protocol: "official", resolutions: [720, 1080], durations: [8], taskPriceUsd: 0.3 },
  "veo-3.1-generate-preview": { protocol: "official", resolutions: [720, 1080], durations: [8], taskPriceUsd: 1.2 },
} as const;

/** Public references, never a claim about an individual account's final bill. */
export const APIYI_PUBLIC_VIDEO_PRICES: Readonly<Record<string, {
  billingUnit: "second" | "task";
  unitPrice: number;
  currencySymbol: "$";
  sourceUrl: string;
  perResolution?: Readonly<Record<number, number>>;
  requiresPublicSource?: boolean;
}>> = {
  "oxygen-1.0": { billingUnit: "second", unitPrice: 0.02, currencySymbol: "$", requiresPublicSource: true, sourceUrl: "https://docs.apiyi.com/api-capabilities/oxygen/overview" },
  "wan3.0-video": { billingUnit: "second", unitPrice: 0.0294, perResolution: { 480: 0.0294, 720: 0.0588, 1080: 0.1176 }, requiresPublicSource: true, currencySymbol: "$", sourceUrl: "https://docs.apiyi.com/api-capabilities/wan3/overview" },
  "minimax-h3": { billingUnit: "second", unitPrice: 0.03, perResolution: { 768: 0.03 }, requiresPublicSource: true, currencySymbol: "$", sourceUrl: "https://docs.apiyi.com/api-capabilities/minimax-h3/overview" },
  "veo-3.1-fast-generate-preview": { billingUnit: "task", unitPrice: 0.3, currencySymbol: "$", sourceUrl: "https://docs.apiyi.com/api-capabilities/veo-3-1-official/image-to-video" },
  "veo-3.1-generate-preview": { billingUnit: "task", unitPrice: 1.2, currencySymbol: "$", sourceUrl: "https://docs.apiyi.com/api-capabilities/veo-3-1-official/image-to-video" },
};

function invalid(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 400 });
}

function modelDefinition(model: string) {
  return Object.hasOwn(APIYI_VIDEO_MODELS, model) ? APIYI_VIDEO_MODELS[model as keyof typeof APIYI_VIDEO_MODELS] : undefined;
}

/** -fl does not accept a separate orientation override: select its matching ID. */
export function apiyiVideoModelForAspectRatio(model: string, aspectRatio: string): string {
  if (aspectRatio !== "16:9" && aspectRatio !== "9:16") throw invalid("视频画幅不支持，请选择横屏 16:9 或竖屏 9:16。");
  const definition = modelDefinition(model);
  if (!definition) throw invalid("API易所选型号尚未适配原图生成视频，请重新选择视频模型。");
  if (definition.protocol !== "flow") return model;
  const fast = model.includes("-fast-");
  return `veo-3.1${aspectRatio === "16:9" ? "-landscape" : ""}${fast ? "-fast" : ""}-fl`;
}

function providerRoot(config: VideoAdapterConfig): string {
  if (config.providerType !== "apiyi") throw invalid("此视频接口仅适用于 API易，请刷新当前供应商后重试。");
  let base: URL;
  try { base = new URL(config.baseUrl); }
  catch { throw invalid("API易视频接口地址无效，请检查模型服务中的连接地址。"); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw invalid("API易视频接口地址无效，请检查模型服务中的连接地址。");
  }
  const prefix = base.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "");
  return `${base.origin}${prefix}`;
}

function videosUrl(config: VideoAdapterConfig) { return `${providerRoot(config)}/v1/videos`; }

function publicSourceUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 8192 || /[\u0000-\u001f\u007f]/.test(value)) throw invalid("此型号需要先上传并核验产品原图的公网链接，当前尚未提交视频任务。");
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error();
    // Network reachability and exact-byte read-back must be verified by the
    // caller before this pure builder is called; do not substitute a data URI.
    return url.href;
  } catch { throw invalid("产品原图链接无效，此型号只支持可公开读取的 HTTPS 图片链接；当前尚未提交视频任务。"); }
}

function sourceType(image: Buffer) {
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) return { mime: "image/jpeg", extension: "jpg" };
  if (image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: "image/png", extension: "png" };
  if (image.length >= 12 && image.toString("ascii", 0, 4) === "RIFF" && image.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", extension: "webp" };
  throw invalid("产品原图格式无法识别，请重新上传有效的 JPG 或 PNG 图片。");
}

/** Pure request construction. No upload, generation, fallback or retry is sent here. */
export function prepareApiyiVideo(config: VideoAdapterConfig, input: VideoSubmissionInput & { imageUrl?: string }): { url: string; init: RequestInit } {
  const url = videosUrl(config);
  if (!config.key.trim()) throw invalid("API易尚未保存密钥，请先在模型服务中保存连接。");
  if (!input.prompt.trim()) throw invalid("视频描述不能为空，请填写镜头要求后重试。");
  const model = apiyiVideoModelForAspectRatio(input.model, input.aspectRatio);
  const definition = modelDefinition(model)!;
  const resolution = Number(input.resolution.toUpperCase().replace(/P$/, ""));
  if (!(definition.resolutions as readonly number[]).includes(resolution)) {
    throw invalid(definition.protocol === "flow" ? "所选 API易视频型号仅支持 720P，请选择 720P 后重试。" : "所选 API易视频型号不支持此清晰度，请重新选择。");
  }
  if (!(definition.durations as readonly number[]).includes(input.duration)) throw invalid(definition.protocol !== "flow" && definition.protocol !== "official"
    ? "所选 API易视频型号当前支持 5 秒或 10 秒，请重新选择视频时长。"
    : "所选 API易视频型号固定生成 8 秒视频，请选择 8 秒后重试。");
  const source = sourceType(input.image);
  if (definition.protocol === "flow" && source.mime === "image/webp") throw invalid("所选 API易视频型号需要 JPG 或 PNG 原图，请转换图片格式后重试。");
  if (definition.protocol === "wan3" || definition.protocol === "hailuo") {
    const imageUrl = publicSourceUrl(input.imageUrl);
    const root = providerRoot(config);
    const wan = definition.protocol === "wan3";
    return {
      url: wan ? `${root}/wan/api/v1/services/aigc/video-generation/video-synthesis` : `${root}/hailuo/v2/video_generation`,
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${config.key.trim()}`, "Content-Type": "application/json", ...(wan ? { "X-DashScope-Async": "enable" } : {}) },
        body: JSON.stringify(wan ? {
          model,
          input: { prompt: input.prompt, media: [{ type: "first_frame", url: imageUrl }] },
          parameters: { resolution: `${resolution}P`, duration: input.duration, ratio: input.aspectRatio, prompt_extend: true, audio: false },
        } : {
          model: "MiniMax-H3",
          content: [{ type: "text", text: input.prompt }, { type: "image_url", image_url: { url: imageUrl }, role: "first_frame" }],
          resolution: "768P", duration: input.duration, ratio: input.aspectRatio,
        }),
      },
    };
  }
  if (definition.protocol === "oxygen") {
    const horizontal = resolution === 768 ? "1792x1024" : "1280x720";
    const vertical = resolution === 768 ? "1024x1792" : "720x1280";
    return {
      url,
      init: {
        method: "POST",
        headers: { Authorization: `Bearer ${config.key.trim()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model, prompt: input.prompt, seconds: String(input.duration),
          size: input.aspectRatio === "9:16" ? vertical : horizontal,
          // Use the caller's verified first-frame URL on the first submission.
          // API易 documents both forms and recommends stable public storage.
          // The inline form remains for older pure-builder integrations only.
          input_reference: input.imageUrl ? publicSourceUrl(input.imageUrl) : `data:${source.mime};base64,${input.image.toString("base64")}`,
        }),
      },
    };
  }
  const body = new FormData();
  body.set("model", model);
  body.set("prompt", input.prompt);
  body.set("input_reference", new Blob([new Uint8Array(input.image)], { type: source.mime }), `product.${source.extension}`);
  if (definition.protocol === "official") {
    const width = resolution === 1080 ? 1920 : 1280;
    const height = resolution === 1080 ? 1080 : 720;
    body.set("seconds", String(input.duration));
    body.set("size", input.aspectRatio === "9:16" ? `${height}x${width}` : `${width}x${height}`);
    body.set("resolution", `${resolution}p`);
    body.set("aspectRatio", input.aspectRatio);
  }
  // API易's general API authentication accepts Bearer; let fetch generate the
  // multipart boundary. Flow's older examples also show the raw sk- key form.
  return { url, init: { method: "POST", headers: { Authorization: `Bearer ${config.key.trim()}` }, body } };
}

function taskComponent(taskId: string): string {
  if (!taskId || taskId.length > 4096 || /[\u0000-\u001f\u007f]/.test(taskId)) throw invalid("视频任务编号无效，请刷新任务状态后重试。");
  return encodeURIComponent(taskId);
}

export function apiyiVideoQueryUrl(config: VideoAdapterConfig, taskId: string, model?: string): string {
  if (model === "wan3.0-video") return `${providerRoot(config)}/v1/tasks/${taskComponent(taskId)}`;
  if (model === "minimax-h3" || model === "MiniMax-H3") return `${providerRoot(config)}/hailuo/v2/query/video_generation/${taskComponent(taskId)}`;
  return `${videosUrl(config)}/${taskComponent(taskId)}`;
}

/** The caller must inspect Content-Type: Flow returns JSON URL, Official MP4. */
export function apiyiVideoContentUrl(config: VideoAdapterConfig, taskId: string, model?: string): string | undefined {
  if (model === "wan3.0-video" || model === "minimax-h3" || model === "MiniMax-H3") return undefined;
  return `${apiyiVideoQueryUrl(config, taskId)}/content`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function string(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }



/** API易 can wrap the actual error as JSON text in message/error/fail_reason. */
function knownErrorCode(value: unknown, depth = 0): string | undefined {
  if (depth > 3) return undefined;
  if (typeof value === "string") {
    const text = value.trim();
    if (Object.hasOwn(PUBLIC_APIYI_ERRORS, text)) return text;
    const bracket = /^\[(InvalidImageUrl|InvalidParameter|ContentPolicyViolation)\]/.exec(text)?.[1];
    if (bracket) return bracket === "InvalidImageUrl" ? "input_download_failed" : bracket === "InvalidParameter" ? "invalid_parameter" : "content_policy_violation";
    if (!text.startsWith("{") || text.length > 16_384) return undefined;
    try { return knownErrorCode(JSON.parse(text), depth + 1); } catch { return undefined; }
  }
  const error = record(value);
  if (!error) return undefined;
  const rawCode = string(error.code);
  if (rawCode && Object.hasOwn(PUBLIC_APIYI_ERRORS, rawCode)) return rawCode;
  for (const candidate of [error.error, error.message, error.fail_reason]) {
    const code = knownErrorCode(candidate, depth + 1);
    if (code) return code;
  }
  return undefined;
}

function publicApiyiError(body: Record<string, unknown>, envelope: Record<string, unknown>, failed: boolean): NormalizedVideoPayload["error"] {
  const error = record(body.error) || record(envelope.error);
  const code = knownErrorCode(body) || knownErrorCode(envelope);
  const hasError = failed || Boolean(code) || Boolean(error) || body.error != null || envelope.error != null || envelope.success === false
    || body.type === "task_error" || body.type === "error";
  if (!hasError) return undefined;
  // Supplier strings may include credentials, prompts or English diagnostics.
  // Return only controlled copy and a known public code; never echo raw fields.
  return {
    code,
    message: code ? PUBLIC_APIYI_ERRORS[code] : "视频生成未能完成，请核对所选模型、原图和供应商任务记录；确认账单后再重试。",
  };
}

export function normalizeApiyiVideo(payload: unknown): NormalizedVideoPayload {
  const envelope = record(payload) || {};
  const data = record(envelope.data);
  const task = record(envelope.task);
  const output = record(envelope.output);
  const body = task || (data && (data.id || data.task_id || data.status || data.url || data.video_url) ? data : envelope);
  const state = (string(body.status) || string(output?.task_status))?.toLowerCase();
  const status: NormalizedVideoPayload["status"] = state && ["queued", "pending", "submitted"].includes(state) ? "queued"
    : state && ["processing", "in_progress", "running"].includes(state) ? "in_progress"
    : state && ["completed", "success", "succeeded", "succeed"].includes(state) ? "completed"
    : state && ["failed", "error"].includes(state) ? "failed"
    : state && ["cancelled", "canceled"].includes(state) ? "cancelled" : undefined;
  return {
    id: string(body.id) || string(body.task_id) || string(output?.task_id), status,
    url: string(body.video_url) || string(output?.video_url) || string(body.url) || string(body.result_url) || (status === "completed" ? string(record(body.content)?.url) : undefined),
    error: publicApiyiError(body, envelope, status === "failed"),
  };
}
