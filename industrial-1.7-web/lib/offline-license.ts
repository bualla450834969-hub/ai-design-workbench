import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { UserSession } from "@/types/domain";
import { LOCAL_OFFLINE_CODE } from "@/lib/local-code";

export { LOCAL_OFFLINE_CODE };

const COOKIE = "idai_local_session";
const MAX_AGE = 60 * 60 * 24 * 14;

export interface LocalLicenseRecord {
  userId: string;
  bindingId: string;
  licenseId: string;
  mode: "offline-local" | "offline-signed";
  userName: string;
  seatLimit: number;
  expiresAt: string;
  activatedAt: string;
  codeHash: string;
  deviceId: string;
}

function dataFile(name: string) {
  return path.join(process.cwd(), ".data", name);
}

function sessionSecret() {
  const file = dataFile("session-secret");
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const secret = crypto.randomBytes(32);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function sign(value: string) {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function readLicenseFile(): LocalLicenseRecord | null {
  const file = dataFile("local-license.json");
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, "utf8")) as LocalLicenseRecord;
  if (!value?.userId || !value.bindingId || !value.licenseId) return null;
  return value;
}

function writeLicenseFile(record: LocalLicenseRecord) {
  const file = dataFile("local-license.json");
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(record, null, 2), { mode: 0o600 });
}

function hashCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function publicKey() {
  return crypto.createPublicKey(fs.readFileSync(path.join(process.cwd(), "license-ref", "license-public.pem")));
}

function verifyOfficialSignature(code: string) {
  const parts = code.split(".");
  if (parts.length !== 3 || parts[0] !== "IDAI1") throw new Error("授权码格式不正确");
  if (!/^[A-Za-z0-9_-]+$/.test(parts[1]) || !/^[A-Za-z0-9_-]+$/.test(parts[2])) throw new Error("授权码格式不正确");
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new Error("授权码内容无法读取");
  }
  const signature = Buffer.from(parts[2], "base64url");
  const key = publicKey();
  const messages = [Buffer.from(`${parts[0]}.${parts[1]}`), Buffer.from(parts[1]), Buffer.from(JSON.stringify(payload))];
  const valid = messages.some((message) => {
    try { return crypto.verify(null, message, key, signature); }
    catch { return false; }
  });
  if (!valid) {
    throw new Error("授权码签名与随包公钥不符。本程序不会伪造官方签名，也不会连接授权服务器。");
  }
  const expiresAt = typeof payload.expiresAt === "string" ? payload.expiresAt : "";
  if (expiresAt && Date.parse(expiresAt) <= Date.now()) throw new Error("授权码已过期");
  const seatLimit = Number(payload.seatLimit);
  return {
    licenseId: typeof payload.licenseId === "string" && payload.licenseId.trim() ? payload.licenseId.trim().slice(0, 120) : "signed-license",
    userName: typeof payload.userName === "string" && payload.userName.trim() ? payload.userName.trim().slice(0, 24) : "授权用户",
    seatLimit: Number.isInteger(seatLimit) && seatLimit > 0 ? seatLimit : 1,
    expiresAt,
    mode: "offline-signed" as const,
  };
}

function parseLocalPayload(code: string) {
  if (code === LOCAL_OFFLINE_CODE) {
    return { licenseId: "local-offline-1.7", userName: "本机用户", seatLimit: 1, expiresAt: "", mode: "offline-local" as const };
  }
  if (!code.startsWith("LOCAL1.")) throw new Error("授权码格式不正确");
  const body = code.slice("LOCAL1.".length);
  if (!/^[A-Za-z0-9_-]+$/.test(body)) throw new Error("授权码格式不正确");
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>; }
  catch { throw new Error("本机离线授权码无法读取"); }
  const seatLimit = Number(payload.seatLimit);
  return {
    licenseId: typeof payload.licenseId === "string" && payload.licenseId.trim() ? payload.licenseId.trim().slice(0, 120) : "local-offline",
    userName: typeof payload.userName === "string" && payload.userName.trim() ? payload.userName.trim().slice(0, 24) : "本机用户",
    seatLimit: Number.isInteger(seatLimit) && seatLimit > 0 ? seatLimit : 1,
    expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : "",
    mode: "offline-local" as const,
  };
}

export function activateOfflineLicense(code: string, deviceId?: string) {
  const trimmed = code.trim();
  if (!trimmed) throw new Error("请粘贴授权码");
  if (trimmed.length > 4096) throw new Error("授权码过长");
  if (/^ID2(?:-[A-F0-9]{4}){6}$/.test(trimmed)) {
    throw new Error("短授权码需要云端授权服务器。当前版本只做本机离线授权，不会连接 app.zhengshixiong.cn。");
  }
  const parsed = trimmed.startsWith("IDAI1.") ? verifyOfficialSignature(trimmed) : parseLocalPayload(trimmed);
  if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) throw new Error("授权码已过期");
  const previous = readLicenseFile();
  const device = deviceId && /^[a-f0-9-]{36}$/i.test(deviceId) ? deviceId : previous?.deviceId || crypto.randomUUID();
  const record: LocalLicenseRecord = {
    userId: previous?.userId || crypto.randomUUID(),
    bindingId: previous?.bindingId || crypto.randomUUID(),
    licenseId: parsed.licenseId,
    mode: parsed.mode,
    userName: parsed.userName,
    seatLimit: parsed.seatLimit,
    expiresAt: parsed.expiresAt,
    activatedAt: new Date().toISOString(),
    codeHash: hashCode(trimmed),
    deviceId: device,
  };
  writeLicenseFile(record);
  return record;
}

export function readLocalLicense(): LocalLicenseRecord | null {
  const record = readLicenseFile();
  if (!record) return null;
  if (record.expiresAt && Date.parse(record.expiresAt) <= Date.now()) return null;
  return record;
}

export function userFromLicense(record: LocalLicenseRecord): UserSession {
  return {
    id: record.userId,
    phone: `local:license:${record.userId}`,
    name: record.userName || "本机用户",
    role: "student",
    webLicenseBindingId: record.bindingId,
  };
}

export function publicLicense(record: LocalLicenseRecord) {
  return {
    licenseId: record.licenseId,
    mode: record.mode,
    userName: record.userName,
    seatLimit: record.seatLimit,
    expiresAt: record.expiresAt,
    activatedAt: record.activatedAt,
  };
}

export function makeSessionToken(record: LocalLicenseRecord) {
  const payload = Buffer.from(JSON.stringify({
    userId: record.userId,
    bindingId: record.bindingId,
    exp: Date.now() + MAX_AGE * 1000,
  })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token?: string) {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (extra || !payload || !signature) return null;
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId?: string; bindingId?: string; exp?: number };
    if (!data.userId || !data.bindingId || !data.exp || data.exp <= Date.now()) return null;
    const record = readLocalLicense();
    if (!record || record.userId !== data.userId || record.bindingId !== data.bindingId) return null;
    return record;
  } catch {
    return null;
  }
}

export const localSessionCookie = COOKIE;
export const localSessionMaxAge = MAX_AGE;
