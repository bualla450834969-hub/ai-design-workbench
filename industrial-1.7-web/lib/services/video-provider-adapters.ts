import { prepareAihubmixVideo, aihubmixVideoQueryUrl, aihubmixVideoContentUrl, normalizeAihubmixVideo, AIHUBMIX_NATIVE_VIDEO_MODELS } from "@/lib/services/video-aihubmix";
import { prepareRelayrouterVideo, relayrouterVideoQueryUrl, relayrouterVideoContentUrl, normalizeRelayrouterVideo, RELAYROUTER_VIDEO_MODELS } from "@/lib/services/video-relayrouter";
import { prepareApiyiVideo, apiyiVideoQueryUrl, apiyiVideoContentUrl, normalizeApiyiVideo, APIYI_PUBLIC_VIDEO_PRICES } from "@/lib/services/video-apiyi";

/**
 * Server-side request adapters. Creating a request never sends it or retries a paid task.
 *
 * Verified 2026-11-04 against these provider-owned contracts:
 * https://docs.apiyi.com/api-capabilities/veo-3-1-official/image-to-video
 * https://docs.aihubmix.com/cn/api/aihubmix-video-generation
 * https://docs.apiyi.com/api-capabilities/oxygen/video-generation
 * https://doc.relayrouter.ai/en/reference/kling
 *
 * API易's Wan endpoint requires a public image URL, so it is deliberately not
 * exposed here. Sending that model to /v1/videos can silently discard its image.
 */

export type VideoAdapterConfig = { providerType: string; baseUrl: string; key: string };
export type VideoSubmissionInput = {
  model: string;
  prompt: string;
  duration: number;
  aspectRatio: string;
  resolution: string;
  image: Buffer;
  imageUrl?: string;
};
export type NormalizedVideoPayload = {
  id?: string;
  status?: "queued" | "in_progress" | "completed" | "failed" | "cancelled";
  url?: string;
  error?: { code?: string; message?: string };
};

export const VERIFIED_VIDEO_ADAPTER_MODELS = {
  apiyi: {
    models: Object.keys(APIYI_PUBLIC_VIDEO_PRICES),
    durations: [5, 8, 10],
    resolutions: ["480P", "768P", "720P", "1080P"],
    aspectRatios: ["16:9", "9:16"],
    description: "Veo 3.1 图生视频，直接上传原图，按次计费。",
    contentResponse: "binary",
  },
  aihubmix: {
    models: AIHUBMIX_NATIVE_VIDEO_MODELS,
    durations: [5, 10],
    resolutions: ["720P", "1080P"],
    aspectRatios: ["16:9", "9:16"],
    description: "通义万相 2.6 图生视频，通过内联原图生成。",
    contentResponse: "binary",
  },
  relayrouter: {
    models: RELAYROUTER_VIDEO_MODELS,
    durations: [5, 10], resolutions: ["STD", "PRO"], aspectRatios: ["16:9", "9:16"],
    description: "Kling 原生图生视频，首帧直接上传。", contentResponse: "url",
  },
} as const;

function invalid(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 400 });
}

function assertProvider(providerType: string): asserts providerType is keyof typeof VERIFIED_VIDEO_ADAPTER_MODELS {
  if (providerType !== "apiyi" && providerType !== "aihubmix" && providerType !== "relayrouter") {
    throw invalid("当前供应商的视频协议尚未接入，请在当前供应商中使用其他功能。");
  }
}

/** Accept a saved OpenAI-style base URL without losing a custom deployment prefix. */
function videosUrl(config: VideoAdapterConfig) {
  assertProvider(config.providerType);
  let base: URL;
  try { base = new URL(config.baseUrl); }
  catch { throw invalid("视频接口地址无效，请检查当前供应商的连接地址。"); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
    throw invalid("视频接口地址无效，请检查当前供应商的连接地址。");
  }
  const prefix = base.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "");
  return `${base.origin}${prefix}/v1/videos`;
}

/** Constructs exactly one request using the selected supplier's native contract. */
export function prepareVideoSubmission(config: VideoAdapterConfig, input: VideoSubmissionInput): { url: string; init: RequestInit } {
  if (config.providerType === "aihubmix") return prepareAihubmixVideo(config, input);
  if (config.providerType === "apiyi") return prepareApiyiVideo(config, input);
  if (config.providerType === "relayrouter") return prepareRelayrouterVideo(config, {
    ...input, resolution: input.model.startsWith("kling-") ? input.resolution.toUpperCase() === "720P" ? "STD" : input.resolution.toUpperCase() === "1080P" ? "PRO" : input.resolution : input.resolution,
  });
  throw invalid("当前供应商的视频协议尚未接入，请在当前供应商中使用其他功能。");
}

export function validProviderVideoTaskId(taskId: unknown): taskId is string {
  return typeof taskId === "string" && taskId.length > 0 && taskId.length <= 4096
    && taskId === taskId.trim() && taskId !== "." && taskId !== ".." && !/[\u0000-\u001f\u007f]/.test(taskId);
}

function taskIdComponent(taskId: string) {
  if (!validProviderVideoTaskId(taskId)) {
    throw invalid("视频任务编号无效，请刷新任务状态后重试。");
  }
  return encodeURIComponent(taskId);
}

export function videoQueryUrl(config: VideoAdapterConfig, taskId: string, legacy = false, model?: string): string {
  taskIdComponent(taskId);
  if (config.providerType === "apiyi" && !legacy) return apiyiVideoQueryUrl(config, taskId, model);
  if (config.providerType === "aihubmix" && !legacy) return aihubmixVideoQueryUrl(config, taskId);
  if (config.providerType === "relayrouter" && !legacy) return relayrouterVideoQueryUrl(config, taskId, model);
  return `${videosUrl(config)}/${taskIdComponent(taskId)}`;
}

/** Native result URLs take priority; this endpoint is a supplier-specific fallback. */
export function videoContentUrl(config: VideoAdapterConfig, taskId: string, legacy = false, model?: string): string | undefined {
  taskIdComponent(taskId);
  if (config.providerType === "apiyi" && !legacy) return apiyiVideoContentUrl(config, taskId, model);
  if (config.providerType === "aihubmix" && !legacy) return aihubmixVideoContentUrl(config, taskId);
  if (config.providerType === "relayrouter" && !legacy) return relayrouterVideoContentUrl(config, taskId);
  return `${videoQueryUrl(config, taskId, legacy)}/content`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function string(value: unknown) { return typeof value === "string" && value.trim() ? value : undefined; }

export function normalizeVideoPayload(providerType: string, payload: unknown, legacy = false): NormalizedVideoPayload {
  if (providerType === "apiyi" && !legacy) return normalizeApiyiVideo(payload);
  if (providerType === "aihubmix" && !legacy) return normalizeAihubmixVideo(payload);
  if (providerType === "relayrouter" && !legacy) return normalizeRelayrouterVideo(payload);
  assertProvider(providerType);
  const envelope = record(payload) || {};
  const data = record(envelope.data);
  const body = data && (data.id || data.task_id || data.status) ? data : envelope;
  const state = string(body.status)?.toLowerCase();
  const status: NormalizedVideoPayload["status"] = state && ["queued", "pending", "submitted"].includes(state) ? "queued"
    : state && ["in_progress", "processing", "running"].includes(state) ? "in_progress"
    : state && ["completed", "succeeded", "succeed", "success"].includes(state) ? "completed"
    : state && ["failed", "error"].includes(state) ? "failed"
    : state && ["cancelled", "canceled"].includes(state) ? "cancelled" : undefined;
  const providerError = record(body.error) || record(envelope.error);
  const errorMessage = string(providerError?.message) || string(body.error) || string(envelope.error)
    || (status === "failed" ? string(body.message) : undefined);
  const errorCode = string(providerError?.code);
  return {
    id: string(body.id) || string(body.task_id),
    status,
    url: string(body.url) || string(body.video_url) || string(body.result_url),
    error: errorCode || errorMessage ? { code: errorCode, message: errorMessage } : undefined,
  };
}
