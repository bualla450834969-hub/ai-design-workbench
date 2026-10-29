import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { UserSession } from "@/types/domain";
import { rateLimit, requireWebMode, webDataDirectory, webError, writePrivateJson } from "@/lib/web-auth-common";

export const webActivationSchema = z.object({ code: z.string().trim().min(6, "请粘贴授权码").max(4096, "授权码过长")
  .refine((code) => /^ID2(?:-[A-F0-9]{4}){6}$/.test(code) || /^IDAI1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(code), "授权码格式不正确") }).strict();
type Binding = {
  id: string; userId: string; deviceId: string; licenseId: string; name: string;
  encryptedToken: string; enabled: boolean; seatCount: number; seatLimit: number;
  issuedAt: string; expiresAt: string; activatedAt: string;
};
type Bindings = { version: 1; bindings: Binding[]; migratedUserIds: string[] };
const inFlight = new Map<string, Promise<void>>();
function file() { return path.join(webDataDirectory("web-auth"), "licenses.json"); }
function readBindings(): Bindings {
  if (!fs.existsSync(file())) return { version: 1, bindings: [], migratedUserIds: [] };
  try {
    const value = JSON.parse(fs.readFileSync(file(), "utf8")) as Bindings;
    if (value.version !== 1 || !Array.isArray(value.bindings) || !Array.isArray(value.migratedUserIds)) throw new Error();
    return value;
  } catch { throw webError("授权资料无法读取，请联系管理员", 503); }
}
function key() {
  const value = process.env.WEB_PROVIDER_ENCRYPTION_KEY || "";
  const base = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (base.length !== 32) throw webError("管理员尚未配置网页版授权加密凭据", 503);
  return Buffer.from(crypto.hkdfSync("sha256", base, Buffer.alloc(0), "idai-web-license-token-v1", 32));
}
function aad(binding: Pick<Binding, "id" | "userId" | "deviceId" | "licenseId">) {
  return Buffer.from(JSON.stringify(["idai-web-license-v1", binding.id, binding.userId, binding.deviceId, binding.licenseId]));
}
function encrypt(binding: Pick<Binding, "id" | "userId" | "deviceId" | "licenseId">, token: string) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(binding));
  const content = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), content].map((part) => part.toString("base64url")).join(".");
}
function decrypt(binding: Binding) {
  try {
    const [iv, tag, content] = binding.encryptedToken.split(".").map((part) => Buffer.from(part, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAAD(aad(binding)); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(content), decipher.final()]).toString("utf8");
  } catch { throw webError("授权资料无法解密，请重新激活", 503); }
}
function serverUrl() {
  try {
    const url = new URL(process.env.LICENSE_SERVER_URL || "");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error();
    return url.href.replace(/\/+$/, "");
  } catch { throw webError("管理员尚未配置授权服务器", 503); }
}
async function remote(endpoint: "activate" | "verify", payload: object, fetchImpl: typeof fetch = fetch) {
  const target = serverUrl() + "/v1/licenses/" + endpoint;
  let response: Response;
  try {
    response = await fetchImpl(target, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12_000) });
  } catch { throw webError("暂时无法连接授权服务器，请稍后重试", 503); }
  const text = await response.text().catch(() => "");
  let data: Record<string, unknown>;
  try {
    if (text.length > 16_384) throw new Error();
    data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
  } catch { throw webError("授权服务器返回异常，请稍后重试", 503); }
  if (!response.ok) throw webError(typeof data.error === "string" ? data.error.slice(0, 200) : "授权校验失败，请重新激活", [400, 401, 403, 429].includes(response.status) ? response.status : 503);
  return data;
}
function validExpiry(value: unknown): value is string { return typeof value === "string" && (value === "" || Number.isFinite(Date.parse(value))); }
function localActive(binding: Binding) {
  return binding.enabled === true && validExpiry(binding.expiresAt) && (!binding.expiresAt || Date.parse(binding.expiresAt) > Date.now());
}
function userOf(binding: Binding): UserSession {
  return { id: binding.userId, phone: "web:license:" + binding.userId, name: binding.name, role: "student", webLicenseBindingId: binding.id };
}
export function publicWebLicense(binding: Pick<Binding, "licenseId" | "seatCount" | "seatLimit" | "issuedAt" | "expiresAt">) {
  return { licenseId: binding.licenseId, seatCount: binding.seatCount, seatLimit: binding.seatLimit, issuedAt: binding.issuedAt, expiresAt: binding.expiresAt };
}
/** Call only after checking the current signed session and its remote license. */
export function getPublicWebLicenseForUser(userId: string, bindingId?: string) {
  if (!bindingId) throw webError("请使用授权码重新激活", 401);
  const binding = readBindings().bindings.find((item) => item.id === bindingId && item.userId === userId && localActive(item));
  if (!binding) throw webError("授权已失效，请重新激活", 403);
  return publicWebLicense(binding);
}
export function getWebLicensedUser(userId: string, bindingId?: string, deviceId?: string) {
  const binding = readBindings().bindings.find((item) => item.userId === userId && (!bindingId || item.id === bindingId) && (!deviceId || item.deviceId === deviceId) && localActive(item));
  return binding ? userOf(binding) : null;
}
export function updateWebLicensedName(userId: string, name: string) {
  const data = readBindings(), binding = data.bindings.find((item) => item.userId === userId && localActive(item));
  if (!binding) throw webError("授权已失效，请重新激活", 403);
  binding.name = name.trim().replace(/\s+/g, " ").slice(0, 24);
  if (!binding.name) throw webError("名称不能为空", 400);
  writePrivateJson(file(), data); return userOf(binding);
}
/** The configured, still-signed preview session alone can retain its own data once. */
function migrationUser(data: Bindings, candidate?: string) {
  if (!candidate || candidate !== process.env.WEB_LICENSE_MIGRATION_USER_ID) return undefined;
  const until = Date.parse(process.env.WEB_LICENSE_MIGRATION_UNTIL || "");
  if (!Number.isFinite(until) || until <= Date.now() || data.migratedUserIds.includes(candidate) || data.bindings.some((item) => item.userId === candidate)) return undefined;
  try {
    const legacy = JSON.parse(fs.readFileSync(path.join(webDataDirectory("web-auth"), "accounts.json"), "utf8"));
    if (!legacy.accounts?.some((item: { userId: string; enabled: boolean }) => item.userId === candidate && item.enabled === true)) return undefined;
    return candidate;
  } catch { return undefined; }
}
const activations = new Map<string, Promise<{ user: UserSession; license: ReturnType<typeof publicWebLicense>; bindingId: string }>>();
export async function activateWebLicense(code: string, deviceId: string, legacyUserId?: string, fetchImpl: typeof fetch = fetch) {
  requireWebMode(); key(); code = webActivationSchema.parse({ code }).code;
  if (!/^[a-f0-9-]{36}$/i.test(deviceId)) throw webError("浏览器设备标识无效", 400);
  rateLimit("activate:all", 200); rateLimit("activate:" + deviceId, 15);
  const scope = file() + ":" + deviceId;
  if (activations.has(scope)) throw webError("当前浏览器正在激活，请稍候", 409);
  const operation = (async () => {
    const result = await remote("activate", { code, deviceId, platform: "web", arch: "browser", appVersion: process.env.APP_VERSION || "1.6.6-tablet-preview" }, fetchImpl);
    if (typeof result.licenseId !== "string" || !result.licenseId || result.licenseId.length > 200 || typeof result.licenseToken !== "string" || !result.licenseToken || !validExpiry(result.expiresAt)
      || (result.expiresAt && Date.parse(result.expiresAt) <= Date.now()) || !Number.isInteger(result.seatLimit) || Number(result.seatLimit) < 1 || !Number.isInteger(result.seatCount)) throw webError("授权服务器返回不完整，请重试", 503);
    const data = readBindings();
    const existing = data.bindings.find((item) => item.deviceId === deviceId && item.licenseId === result.licenseId);
    const migrated = !existing ? migrationUser(data, legacyUserId) : undefined;
    const binding: Binding = {
      id: existing?.id || crypto.randomUUID(), userId: existing?.userId || migrated || crypto.randomUUID(), deviceId, licenseId: result.licenseId,
      name: existing?.name || (typeof result.userName === "string" && result.userName.trim() ? result.userName.trim().slice(0, 24) : "授权用户"),
      encryptedToken: "", enabled: true, seatCount: Number(result.seatCount), seatLimit: Number(result.seatLimit),
      issuedAt: typeof result.issuedAt === "string" ? result.issuedAt : new Date().toISOString(), expiresAt: result.expiresAt, activatedAt: new Date().toISOString(),
    };
    binding.encryptedToken = encrypt(binding, result.licenseToken);
    data.bindings = data.bindings.filter((item) => item.id !== binding.id).concat(binding);
    if (migrated) data.migratedUserIds.push(migrated);
    writePrivateJson(file(), data);
    return { user: userOf(binding), license: publicWebLicense(binding), bindingId: binding.id };
  })();
  activations.set(scope, operation);
  try { return await operation; } finally { activations.delete(scope); }
}
/** Fail closed on network errors: the server-hosted app has no offline grace. */
export async function assertWebLicenseActive(userId: string, bindingId?: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  requireWebMode();
  if (!bindingId) throw webError("请使用授权码重新激活", 401);
  const binding = readBindings().bindings.find((item) => item.id === bindingId && item.userId === userId && localActive(item));
  if (!binding) throw webError("授权已失效，请重新激活", 403);
  const scope = file() + ":" + binding.id + ":" + binding.encryptedToken;
  let operation = inFlight.get(scope);
  if (!operation) {
    operation = (async () => {
      try {
        const result = await remote("verify", { licenseId: binding.licenseId, deviceId: binding.deviceId, licenseToken: decrypt(binding) }, fetchImpl);
        // Deployed desktop license servers may return only {ok, licenseId}.
        // Keep the activation expiry unless a newer server explicitly renews it.
        const expiresAt = result.expiresAt === undefined ? binding.expiresAt : result.expiresAt;
        if (result.ok !== true || !validExpiry(expiresAt) || (result.licenseId !== undefined && result.licenseId !== binding.licenseId)) throw webError("授权服务器返回异常，请稍后重试", 503);
        const data = readBindings(), current = data.bindings.find((item) => item.id === binding.id);
        if (!current || current.encryptedToken !== binding.encryptedToken || !current.enabled) throw webError("授权信息已变更，请重新进入", 401);
        if (expiresAt && Date.parse(expiresAt) <= Date.now()) throw webError("授权已过期，请重新激活", 403);
        if (current.expiresAt !== expiresAt) { current.expiresAt = expiresAt; writePrivateJson(file(), data); }
      } catch (error) {
        if (error && typeof error === "object" && "status" in error && error.status === 403) {
          const data = readBindings(), current = data.bindings.find((item) => item.id === binding.id && item.encryptedToken === binding.encryptedToken);
          if (current) { current.enabled = false; writePrivateJson(file(), data); }
        }
        throw error;
      }
    })(); inFlight.set(scope, operation);
  }
  try { await operation; } finally { if (inFlight.get(scope) === operation) inFlight.delete(scope); }
}
