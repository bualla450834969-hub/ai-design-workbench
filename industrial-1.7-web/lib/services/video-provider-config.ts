import crypto from "node:crypto";
import { readFileSync, statSync } from "node:fs";

/** Server-only credentials. Never include this object in an API response. */
export type VideoConnection = {
  providerId: string;
  providerType: string;
  providerName: string;
  key: string;
  baseUrl: string;
};

export type VideoConnectionResult = ({ available: true } & VideoConnection) | { available: false; reason: string };

const PROVIDER_TYPES = new Set(["geekai", "apiyi", "aihubmix", "relayrouter", "openai-compatible"]);
const PROVIDER_NAMES: Record<string, string> = { geekai: "GeekAI", apiyi: "API易", aihubmix: "AIHubMix", relayrouter: "RelayRouter", "openai-compatible": "自定义供应商" };
const MISSING_CONNECTION = "当前没有可用的已启用供应商连接，请先在模型服务中保存并启用连接。";
const SWITCHING_CONNECTION = "供应商设置正在切换，请稍后刷新视频设置，再选择模型并确认费用。";
const ORIGINAL_CONNECTION_MISSING = "该视频任务的原供应商连接已删除或变更。请恢复提交时的连接和密钥后刷新；不要重新提交，以免重复扣费。";
const CONTROL = /[\u0000-\u001f\u007f]/;

function text(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string" || CONTROL.test(value) || value.length > limit) return undefined;
  return value.trim() || undefined;
}

function baseUrl(value: unknown): string | undefined {
  const raw = text(value, 600);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return undefined;
    return url.toString().replace(/\/+$/, "");
  } catch { return undefined; }
}

function connection(value: unknown): VideoConnection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  const providerId = text(item.providerId, 80);
  const providerType = text(item.providerType, 40);
  const providerName = text(item.providerName, 100);
  const key = text(item.apiKey, 800);
  const url = baseUrl(item.baseUrl);
  if (!providerId || !providerType || !PROVIDER_TYPES.has(providerType) || !providerName || !key || !url) return undefined;
  return { providerId, providerType, providerName, key, baseUrl: url };
}

function environmentConnection(): VideoConnection | undefined {
  const rawId = process.env.IDAI_VIDEO_PROVIDER_ID;
  // Old desktop builds passed just GeekAI KEY/BASE. An explicitly empty new ID
  // means there is no active connection and must never select an inactive key.
  const legacy = rawId === undefined;
  if (!legacy && !rawId) return undefined;
  const providerType = process.env.IDAI_VIDEO_PROVIDER_TYPE || (legacy ? "geekai" : "");
  if (legacy && providerType !== "geekai") return undefined;
  return connection({
    providerId: legacy ? "legacy-geekai" : rawId,
    providerType,
    providerName: process.env.IDAI_VIDEO_PROVIDER_NAME || PROVIDER_NAMES[providerType],
    apiKey: process.env.IDAI_VIDEO_API_KEY,
    baseUrl: process.env.IDAI_VIDEO_BASE_URL,
  });
}

/** All saved readable connections, not just the currently enabled supplier. */
export function savedVideoConnections(): VideoConnection[] {
  if (process.env.DESKTOP_MODE !== "true") return [];
  const raw = process.env.IDAI_VIDEO_PROVIDER_CONNECTIONS;
  if (raw === undefined) {
    const current = environmentConnection();
    return current ? [current] : [];
  }
  if (!raw || raw.length > 32_768) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length > 12) return [];
    const items = parsed.flatMap((item) => { const valid = connection(item); return valid ? [valid] : []; });
    const ids = new Map<string, number>();
    for (const item of items) ids.set(item.providerId, (ids.get(item.providerId) || 0) + 1);
    return items.filter((item) => ids.get(item.providerId) === 1);
  } catch { return []; }
}

function runtimeActiveBinding(): { valid: boolean; id?: string; type?: string; baseUrl?: string; fingerprint?: string } {
  const runtimeFile = process.env.DESKTOP_PROVIDER_RUNTIME_FILE;
  if (!runtimeFile) return { valid: true };
  try {
    if (statSync(runtimeFile).size > 512 * 1024) return { valid: false };
    const parsed = JSON.parse(readFileSync(/* turbopackIgnore: true */ runtimeFile, "utf8")) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { valid: false };
    const binding: { valid: boolean; id?: string; type?: string; baseUrl?: string; fingerprint?: string } = { valid: true };
    if (Object.hasOwn(parsed, "ACTIVE_PROVIDER_ID")) {
      binding.id = text(parsed.ACTIVE_PROVIDER_ID, 80);
      if (!binding.id) return { valid: false };
    }
    if (Object.hasOwn(parsed, "ACTIVE_PROVIDER_TYPE")) {
      binding.type = text(parsed.ACTIVE_PROVIDER_TYPE, 40);
      if (!binding.type || !PROVIDER_TYPES.has(binding.type)) return { valid: false };
    }
    if (Object.hasOwn(parsed, "ACTIVE_PROVIDER_BASE_URL")) {
      binding.baseUrl = baseUrl(parsed.ACTIVE_PROVIDER_BASE_URL);
      if (!binding.baseUrl) return { valid: false };
    }
    if (Object.hasOwn(parsed, "ACTIVE_PROVIDER_KEY_FINGERPRINT")) {
      const fingerprint = parsed.ACTIVE_PROVIDER_KEY_FINGERPRINT;
      if (typeof fingerprint !== "string" || !/^[a-f0-9]{16}$/i.test(fingerprint)) return { valid: false };
      binding.fingerprint = fingerprint.toLowerCase();
    }
    return binding;
  } catch { return { valid: false }; }
}

export function activeVideoConnection(): VideoConnectionResult {
  if (process.env.DESKTOP_MODE !== "true") return { available: false, reason: "视频生成目前仅在 Windows 和 Mac 桌面版开放，请在桌面软件中使用。" };
  const current = environmentConnection();
  if (!current) return { available: false, reason: MISSING_CONNECTION };
  const runtime = runtimeActiveBinding();
  if (!runtime.valid
    || runtime.id !== undefined && runtime.id !== current.providerId
    || runtime.type !== undefined && runtime.type !== current.providerType
    || runtime.baseUrl !== undefined && runtime.baseUrl !== current.baseUrl
    || runtime.fingerprint !== undefined && runtime.fingerprint !== crypto.createHash("sha256").update(current.key).digest("hex").slice(0, 16)) {
    return { available: false, reason: SWITCHING_CONNECTION };
  }
  return { available: true, ...current };
}

/** Poll/download a job through its original credential, independent of active settings. */
export function videoConnectionForJob(binding: {
  providerId?: string;
  providerType?: string;
  providerBaseUrl?: string;
  providerKeyFingerprint: string;
}): VideoConnectionResult {
  const originalBase = baseUrl(binding.providerBaseUrl);
  const fingerprint = typeof binding.providerKeyFingerprint === "string" && /^[a-f0-9]{16}$/i.test(binding.providerKeyFingerprint)
    ? binding.providerKeyFingerprint.toLowerCase() : undefined;
  const id = binding.providerId === undefined ? undefined : text(binding.providerId, 80);
  const type = binding.providerType === undefined ? undefined : text(binding.providerType, 40);
  if (!originalBase || !fingerprint || binding.providerId !== undefined && !id || binding.providerType !== undefined && (!type || !PROVIDER_TYPES.has(type))) return { available: false, reason: ORIGINAL_CONNECTION_MISSING };
  const match = savedVideoConnections().find((item) => (!id || item.providerId === id) && (!type || item.providerType === type)
    && item.baseUrl === originalBase && crypto.createHash("sha256").update(item.key).digest("hex").slice(0, 16) === fingerprint);
  return match ? { available: true, ...match } : { available: false, reason: ORIGINAL_CONNECTION_MISSING };
}

export function assertActiveVideoConnection(expectedProviderId?: string): VideoConnection {
  if (expectedProviderId !== undefined && !text(expectedProviderId, 80)) throw Object.assign(new Error("供应商连接编号无效，请刷新视频设置后重试。"), { status: 400 });
  const result = activeVideoConnection();
  if (!result.available) throw Object.assign(new Error(result.reason), { status: result.reason === SWITCHING_CONNECTION ? 409 : 400 });
  if (expectedProviderId !== undefined && expectedProviderId !== result.providerId) throw Object.assign(new Error("供应商已切换，请刷新视频设置后重新选择模型并确认费用。"), { status: 409 });
  const { available: _available, ...current } = result;
  return current;
}
