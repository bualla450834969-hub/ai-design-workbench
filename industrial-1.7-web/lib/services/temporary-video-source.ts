import crypto from "node:crypto";
import type { Agent } from "undici";
import { pinnedImageDispatcher, resolvePublicImageUrl } from "@/lib/services/safe-image-download";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_JSON_BYTES = 16 * 1024;
const CACHE_MS = 60_000;
const CONTROL = /[\u0000-\u001f\u007f]/;
const SOURCE_PATH = /^\/v1\/video-sources\/[a-f0-9]{64}\.jpg$/;
type Capabilities = { available: boolean; reason?: string; maxBytes?: number };
type SourceFailure = Error & { status: number; temporarySourceFailure: true };
const cache = new Map<string, { expires: number; value: Capabilities }>();
const inFlight = new Map<string, Promise<Capabilities>>();

function failed(message: string, status = 502): SourceFailure {
  return Object.assign(new Error(`${message}。本次尚未提交付费视频任务。`), { status, temporarySourceFailure: true as const });
}
function isFailure(reason: unknown): reason is SourceFailure {
  return reason instanceof Error && "temporarySourceFailure" in reason && reason.temporarySourceFailure === true;
}
function serverBase(): string | undefined {
  const raw = process.env.LICENSE_SERVER_URL?.trim();
  if (!raw || raw.length > 800 || CONTROL.test(raw)) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      ? url.toString().replace(/\/+$/, "") : undefined;
  } catch { return undefined; }
}
function credential(value: string | undefined): string | undefined {
  return value && value.length <= 800 && !CONTROL.test(value) ? value.trim() || undefined : undefined;
}
async function limitedBytes(response: Response, limit: number) {
  if (!response.body) throw failed("临时原图服务没有返回校验内容");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) { await response.body.cancel(); throw failed("临时原图服务返回内容过大"); }
  const reader = response.body.getReader();
  const chunks: Buffer[] = []; let bytes = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw failed("临时原图服务返回内容过大"); }
      chunks.push(Buffer.from(next.value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, bytes);
}
async function limitedJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const result: unknown = JSON.parse((await limitedBytes(response, MAX_JSON_BYTES)).toString("utf8"));
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
    return result as Record<string, unknown>;
  } catch (reason) {
    if (isFailure(reason)) throw reason;
    throw failed("临时原图服务返回格式不正确");
  }
}
async function pinnedRequest<T>(url: string, input: RequestInit, read: (response: Response) => Promise<T>, timeout: number): Promise<T> {
  let target;
  try { target = await resolvePublicImageUrl(url); }
  catch { throw failed("无法校验临时原图服务的公网地址，请检查网络后重试", 503); }
  const dispatcher = pinnedImageDispatcher(target.hostname, target.addresses);
  try {
    const response = await fetch(target.url, { ...input, credentials: "omit", redirect: "error", signal: AbortSignal.timeout(timeout), dispatcher } as RequestInit & { dispatcher: Agent });
    return await read(response);
  } catch (reason) {
    if (isFailure(reason)) throw reason;
    throw failed("无法连接临时原图服务，请检查网络后重试", 503);
  } finally { await dispatcher.destroy(); }
}
function unavailable(reason = "此测试功能需要开通临时原图服务，请联系软件支持更新服务后再试"): Capabilities {
  return { available: false, reason };
}
async function capabilitiesFor(base: string): Promise<Capabilities> {
  const saved = cache.get(base); if (saved && saved.expires > Date.now()) return saved.value;
  const current = inFlight.get(base); if (current) return current;
  const pending = (async () => {
    let value: Capabilities;
    try {
      value = await pinnedRequest(`${base}/v1/meta`, {}, async (response) => {
        if (!response.ok) { await response.body?.cancel(); return unavailable(); }
        const data = await limitedJson(response);
        const features = data.features && typeof data.features === "object" ? data.features as Record<string, unknown> : undefined;
        const source = features?.videoSources && typeof features.videoSources === "object" ? features.videoSources as Record<string, unknown> : undefined;
        return source?.enabled === true && Number.isInteger(source.maxBytes) && Number(source.maxBytes) > 0 && Number(source.maxBytes) <= MAX_IMAGE_BYTES
          ? { available: true, maxBytes: Number(source.maxBytes) } : unavailable();
      }, 8_000);
    } catch { value = unavailable("临时原图服务暂时无法连接，请检查网络或联系软件支持后再试"); }
    if (cache.size >= 4 && !cache.has(base)) cache.delete(cache.keys().next().value!);
    cache.set(base, { expires: Date.now() + CACHE_MS, value });
    return value;
  })();
  inFlight.set(base, pending);
  try { return await pending; } finally { inFlight.delete(base); }
}

/** Public service availability only. Never reads or returns supplier credentials. */
export async function temporaryVideoSourceCapabilities(): Promise<Capabilities> {
  if (process.env.DESKTOP_MODE !== "true") return unavailable("临时原图服务目前仅供桌面版使用");
  const base = serverBase();
  return base ? capabilitiesFor(base) : unavailable("临时原图服务需要有效的 HTTPS 授权服务地址，请联系软件支持");
}

/** Upload the prepared JPEG once, then independently verify its unauthenticated
 * public read-back before the caller is allowed to submit any paid video task.
 */
export async function uploadTemporaryVideoSource(image: Buffer): Promise<{ publicUrl: string; sha256: string; expiresAt: string }> {
  if (process.env.DESKTOP_MODE !== "true") throw failed("临时原图服务目前仅供桌面版使用", 400);
  const base = serverBase(); if (!base) throw failed("临时原图服务需要有效的 HTTPS 授权服务地址，请联系软件支持", 400);
  if (!Buffer.isBuffer(image) || image.length < 4 || image.length > MAX_IMAGE_BYTES) throw failed("产品首图需为不超过2 MB的 JPEG 图片，请重新选择或压缩图片", 413);
  if (image[0] !== 0xff || image[1] !== 0xd8 || image[2] !== 0xff || image[image.length - 2] !== 0xff || image[image.length - 1] !== 0xd9) throw failed("产品首图不是有效的 JPEG 图片，请重新选择图片", 400);
  const licenseId = credential(process.env.LICENSE_ID), deviceId = credential(process.env.LICENSE_DEVICE_ID), licenseToken = credential(process.env.LICENSE_TOKEN);
  if (!licenseId || !deviceId || !licenseToken) throw failed("当前设备缺少有效授权信息，请联网校验授权后重试", 403);
  const capabilities = await capabilitiesFor(base);
  if (!capabilities.available) throw failed(capabilities.reason || "此测试功能需要开通临时原图服务，请联系软件支持", 503);
  if (image.length > capabilities.maxBytes!) throw failed("产品首图超过临时原图服务限制，请压缩图片后重试", 413);
  const sha256 = crypto.createHash("sha256").update(image).digest("hex");
  const uploaded = await pinnedRequest(`${base}/v1/video-sources`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ licenseId, deviceId, licenseToken, imageBase64: image.toString("base64"), sha256 }),
  }, async (response) => {
    if (!response.ok) {
      await response.body?.cancel();
      const reason = response.status === 401 || response.status === 403 ? "当前设备无法上传临时首图，请联网核对授权状态"
        : response.status === 413 ? "产品首图超过上传限制，请压缩图片"
          : response.status === 429 ? "临时首图上传较频繁或已达额度，请稍后重试"
            : response.status === 404 ? "此测试功能需要开通临时原图服务，请联系软件支持更新服务"
              : "临时原图服务暂时无法保存产品首图，请稍后重试";
      throw failed(reason, response.status);
    }
    return limitedJson(response);
  }, 30_000);
  const expires = typeof uploaded.expiresAt === "string" ? Date.parse(uploaded.expiresAt) : NaN;
  if (typeof uploaded.path !== "string" || !SOURCE_PATH.test(uploaded.path) || uploaded.sha256 !== sha256
    || !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 25 * 60 * 60 * 1000) {
    throw failed("临时首图地址或校验信息不完整，已停止视频提交");
  }
  const publicUrl = `${base}${uploaded.path}`;
  await pinnedRequest(publicUrl, { method: "GET" }, async (response) => {
    if (!response.ok) { await response.body?.cancel(); throw failed("上传后的临时首图无法公开读取，请稍后重试"); }
    if (!/^image\/jpeg(?:\s*;|$)/i.test(response.headers.get("content-type") || "")) { await response.body?.cancel(); throw failed("临时首图下载格式不正确，已停止视频提交"); }
    const returned = await limitedBytes(response, MAX_IMAGE_BYTES);
    if (returned.length !== image.length || crypto.createHash("sha256").update(returned).digest("hex") !== sha256) throw failed("上传后的临时首图与原产品图片不一致，请重新选择图片");
  }, 30_000);
  return { publicUrl, sha256, expiresAt: new Date(expires).toISOString() };
}
