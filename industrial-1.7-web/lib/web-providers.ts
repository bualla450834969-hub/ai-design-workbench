import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { assertWebAccountActive, isWebMode, rateLimit, webDataDirectory, webError, writePrivateJson } from "@/lib/web-auth";
import { assertPublicHttpsUrl, webSafeFetch } from "@/lib/web-network";
import { withExplicitProviderSettings, withProviderSettingsSnapshot } from "@/lib/providers/geekai";
import type { UserSession } from "@/types/domain";
import { assertWebGenerationLicense, requireWebLicenseBinding } from "@/lib/web-generation-license";

const draftSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/), name: z.string().trim().min(1).max(60),
  type: z.enum(["geekai", "apiyi", "aihubmix", "openai-compatible"]), baseUrl: z.string().trim().min(1).max(500),
  textModel: z.string().trim().min(1).max(160), imageModel: z.string().trim().min(1).max(160),
  workspaceId: z.string().trim().max(160).default(""), modelCatalog: z.array(z.string().trim().max(180)).max(1000).default([]),
  enabled: z.boolean().default(true), apiKey: z.string().trim().max(800).optional(),
});
type ProviderRecord = Omit<DesktopProviderDraft, "apiKey" | "modelVerifications"> & { encryptedApiKey: string; updatedAt: string };
export type WebProviderSnapshot = { providerId: string; type: DesktopProviderType; name: string; baseUrl: string; textModel: string; imageModel: string };

function encryptionKey() {
  const value = process.env.WEB_PROVIDER_ENCRYPTION_KEY || "";
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (key.length !== 32) throw webError("管理员尚未配置网页版密钥加密凭据", 503);
  return key;
}
function recordsFile(userId: string) {
  if (!/^[a-z0-9-]{1,80}$/i.test(userId)) throw webError("账号编号无效", 403);
  return path.join(webDataDirectory("web-providers"), `${userId}.json`);
}
function readRecords(userId: string): ProviderRecord[] {
  const file = recordsFile(userId);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as { version: number; providers: ProviderRecord[] };
    if (data.version !== 1 || !Array.isArray(data.providers)) throw new Error("Invalid provider file");
    return data.providers;
  } catch { throw webError("模型设置无法读取，请联系管理员", 503); }
}
function saveRecords(userId: string, providers: ProviderRecord[]) { writePrivateJson(recordsFile(userId), { version: 1, providers }); }
function aad(userId: string, record: Pick<ProviderRecord, "id" | "type" | "baseUrl">) { return Buffer.from(`idai-web-provider-v1:${userId}:${record.id}:${record.type}:${record.baseUrl}`); }
function encrypt(userId: string, record: Pick<ProviderRecord, "id" | "type" | "baseUrl">, apiKey: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(aad(userId, record));
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((value) => value.toString("base64url")).join(".");
}
function decrypt(userId: string, record: ProviderRecord) {
  try {
    const [iv, tag, ciphertext] = record.encryptedApiKey.split(".").map((value) => Buffer.from(value, "base64url"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAAD(aad(userId, record));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch { throw webError("无法读取模型密钥，请重新填写API Key", 503); }
}
function publicRecord(record: ProviderRecord): DesktopProvider {
  const { encryptedApiKey, updatedAt: _updatedAt, ...provider } = record;
  const catalog = [...new Set([...provider.modelCatalog, provider.imageModel])];
  return { ...provider, hasApiKey: Boolean(encryptedApiKey), keyHint: "", modelVerifications: {}, imageModelStatuses: Object.fromEntries(catalog.map((model) => [model, { status: /(?:gpt[-_]?image|gemini[-_].*(?:image|imagen|nano[-_]?banana)|nano[-_]?banana|imagen[-_]?\d|seedream|flux[-_]|dall[-_]?e|grok[-_].*image)/i.test(model) ? "untested" : "incompatible", reason: "尚未在当前账号实测" }])) };
}
function accountId(user: UserSession | string) { return typeof user === "string" ? user : user.id; }
function providerBinding(user: UserSession | string) {
  return requireWebLicenseBinding(typeof user === "string" ? undefined : user.webLicenseBindingId);
}
export function listWebProviders(userId: string) { assertWebAccountActive(userId); encryptionKey(); return readRecords(userId).map(publicRecord); }

async function normalizedDraft(value: unknown) {
  const parsed = draftSchema.parse(value);
  const url = await assertPublicHttpsUrl(parsed.baseUrl);
  return { ...parsed, baseUrl: url.toString().replace(/\/+$/, ""), modelCatalog: [...new Set(parsed.modelCatalog.filter(Boolean))] };
}
export async function saveWebProvider(userId: string, value: unknown): Promise<DesktopProviderSaveResult> {
  assertWebAccountActive(userId);
  rateLimit(`provider-save:${userId}`, 60);
  const input = await normalizedDraft(value);
  assertWebAccountActive(userId);
  const current = readRecords(userId);
  const previous = current.find((item) => item.id === input.id);
  const sameTarget = previous?.type === input.type && previous.baseUrl === input.baseUrl;
  const { apiKey, ...draft } = input;
  const encryptedApiKey = apiKey ? encrypt(userId, draft, apiKey) : sameTarget ? previous!.encryptedApiKey : "";
  if (!encryptedApiKey) throw webError("请填写API Key；修改供应商地址后需要重新填写", 400);
  const record: ProviderRecord = { ...draft, encryptedApiKey, updatedAt: new Date().toISOString() };
  const others = current.filter((item) => item.id !== input.id).map((item) => input.enabled ? { ...item, enabled: false } : item);
  if (!previous && others.length >= 12) throw webError("每个账号最多保存12个模型连接", 400);
  saveRecords(userId, [record, ...others]);
  return { providers: listWebProviders(userId), restarting: false };
}
export function activateWebProvider(userId: string, id: string): DesktopProviderSaveResult {
  assertWebAccountActive(userId);
  const records = readRecords(userId);
  if (!records.some((record) => record.id === id)) throw webError("模型连接不存在", 404);
  saveRecords(userId, records.map((record) => ({ ...record, enabled: record.id === id })));
  return { providers: listWebProviders(userId), restarting: false };
}
export function deleteWebProvider(userId: string, id: string): DesktopProviderSaveResult {
  assertWebAccountActive(userId);
  const records = readRecords(userId);
  if (!records.some((record) => record.id === id)) throw webError("模型连接不存在", 404);
  saveRecords(userId, records.filter((record) => record.id !== id));
  return { providers: listWebProviders(userId), restarting: false };
}
async function resolveDraft(userId: string, value: unknown) {
  assertWebAccountActive(userId);
  const input = await normalizedDraft(value);
  assertWebAccountActive(userId);
  const existing = readRecords(userId).find((item) => item.id === input.id && item.type === input.type && item.baseUrl === input.baseUrl);
  const apiKey = input.apiKey || (existing ? decrypt(userId, existing) : "");
  if (!apiKey) throw webError("请先填写API Key", 400);
  return { ...input, apiKey };
}
function v1Url(base: string, endpoint: string) { return `${/\/v1$/i.test(new URL(base).pathname) ? base : `${base}/v1`}/${endpoint}`; }
async function jsonResponse(response: Response) {
  if (!response.ok) { await response.body?.cancel(); throw webError(`模型平台拒绝请求（HTTP ${response.status}），请核对密钥和模型`, 400); }
  const length = Number(response.headers.get("content-length") || 0);
  if (length > 2 * 1024 * 1024) { await response.body?.cancel(); throw webError("模型平台响应过大", 400); }
  if (!response.body) throw webError("模型平台没有返回内容", 400);
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 2 * 1024 * 1024) { await reader.cancel(); throw webError("模型平台响应过大", 400); } chunks.push(chunk.value); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as { data?: Array<{ id?: string }>; choices?: Array<{ message?: { content?: string } }> };
  } catch (error) { if (error instanceof Error && "status" in error) throw error; throw webError("模型平台返回格式无效", 400); }
  finally { reader.releaseLock(); }
}
export async function loadWebProviderModels(user: UserSession | string, value: unknown) {
  const userId = accountId(user), bindingId = providerBinding(user);
  rateLimit(`provider-models:${userId}`, 30);
  const provider = await resolveDraft(userId, value);
  await assertWebGenerationLicense(userId, bindingId);
  const response = await webSafeFetch(v1Url(provider.baseUrl, "models"), { headers: { Authorization: `Bearer ${provider.apiKey}` }, signal: AbortSignal.timeout(25_000) });
  const payload = await jsonResponse(response);
  const models = [...new Set((Array.isArray(payload.data) ? payload.data : []).map((item) => typeof item.id === "string" ? item.id.trim().slice(0, 180) : "").filter(Boolean))].sort().slice(0, 1000);
  const current = readRecords(userId);
  const record = current.find((item) => item.id === provider.id && item.baseUrl === provider.baseUrl && item.type === provider.type);
  if (record && models.length) { record.modelCatalog = models; saveRecords(userId, current); }
  return models;
}
export async function testWebTextProvider(user: UserSession | string, value: unknown): Promise<DesktopProviderTestResult> {
  const userId = accountId(user), bindingId = providerBinding(user);
  rateLimit(`provider-test:${userId}`, 10);
  const provider = await resolveDraft(userId, value);
  const started = Date.now();
  await assertWebGenerationLicense(userId, bindingId);
  const response = await webSafeFetch(v1Url(provider.baseUrl, "chat/completions"), { method: "POST", headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: provider.textModel, messages: [{ role: "user", content: "只回复：连接成功" }], temperature: 0, max_tokens: 40 }), signal: AbortSignal.timeout(60_000) });
  const payload = await jsonResponse(response);
  if (!payload.choices?.[0]?.message?.content) throw webError("模型平台没有返回文字内容", 400);
  return { ok: true, latencyMs: Date.now() - started, message: "连接成功", model: provider.textModel };
}
export async function getUserProviderSnapshot(userId: string, providerId?: string): Promise<WebProviderSnapshot> {
  assertWebAccountActive(userId);
  const provider = readRecords(userId).find((item) => providerId ? item.id === providerId : item.enabled);
  if (!provider) throw webError("请先连接模型并填写API Key", 400);
  await assertPublicHttpsUrl(provider.baseUrl);
  return { providerId: provider.id, type: provider.type, name: provider.name, baseUrl: provider.baseUrl, textModel: provider.textModel, imageModel: provider.imageModel };
}
export async function withUserProviderSnapshot<T>(user: UserSession | string, snapshot: WebProviderSnapshot, run: () => T): Promise<Awaited<T>> {
  const userId = accountId(user);
  const bindingId = providerBinding(user);
  assertWebAccountActive(userId);
  const record = readRecords(userId).find((item) => item.id === snapshot.providerId);
  if (!record || record.type !== snapshot.type || record.baseUrl !== snapshot.baseUrl) throw webError("任务的模型连接已删除或地址已改变，请核对后重新提交", 409);
  await assertPublicHttpsUrl(snapshot.baseUrl);
  // DNS may await the network. Recheck revocation and credential changes before
  // starting work; no async boundary remains before entering the task scope.
  assertWebAccountActive(userId);
  const current = readRecords(userId).find((item) => item.id === snapshot.providerId);
  if (!current || current.type !== snapshot.type || current.baseUrl !== snapshot.baseUrl) throw webError("任务的模型连接已删除或地址已改变，请核对后重新提交", 409);
  return await withExplicitProviderSettings({ WEB_USER_ID: userId, WEB_LICENSE_BINDING_ID: bindingId, GEEKAI_API_KEY: decrypt(userId, current), GEEKAI_BASE_URL: snapshot.baseUrl, GEEKAI_PROVIDER_TYPE: snapshot.type, GEEKAI_TEXT_MODEL: snapshot.textModel, GEEKAI_IMAGE_MODEL: snapshot.imageModel, ACTIVE_PROVIDER_NAME: snapshot.name }, run);
}
export async function withUserProviderSettings<T>(user: UserSession | string, run: () => T, providerId?: string): Promise<Awaited<T>> {
  if (!isWebMode()) return await withProviderSettingsSnapshot(run);
  return await withUserProviderSnapshot(user, await getUserProviderSnapshot(accountId(user), providerId), run);
}
