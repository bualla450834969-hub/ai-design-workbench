import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { store } from "@/lib/store";
import { assertSameOrigin, isWebMode, webError } from "@/lib/web-auth";
import { assertWebLicenseActive, getWebLicensedUser } from "@/lib/web-license";

const MAX_AGE = 60 * 60 * 24 * 14;

function cookieName() { return isWebMode() ? "idai_tablet_session" : "idai_session"; }
function cookiePath() {
  if (!isWebMode()) return "/";
  const configured = (process.env.APP_BASE_PATH || process.env.NEXT_PUBLIC_APP_BASE_PATH || "").replace(/\/+$/, "");
  if (configured && !/^\/[a-zA-Z0-9/_-]+$/.test(configured)) throw webError("网页版路径配置无效", 503);
  return configured || "/";
}

function secret() {
  if (isWebMode() && (process.env.APP_SESSION_SECRET || "").length < 32) throw webError("管理员尚未配置安全的网页版会话密钥", 503);
  return process.env.APP_SESSION_SECRET || "demo-only-session-secret-change-in-production";
}

function sign(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

export function makeSessionToken(userId: string, bindingId?: string) {
  const payload = Buffer.from(JSON.stringify({ userId, ...(bindingId ? { bindingId } : {}), exp: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token?: string) {
  return readSessionPayload(token)?.userId || null;
}

function readSessionPayload(token?: string) {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (extra) return null;
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const receivedBytes = Buffer.from(signature), expectedBytes = Buffer.from(expected);
  if (receivedBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(receivedBytes, expectedBytes)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId: string; exp: number; bindingId?: string };
    return typeof data.userId === "string" && Number.isFinite(data.exp) && data.exp > Date.now() ? data : null;
  } catch { return null; }
}

export function getSession(request: NextRequest) {
  const payload = readSessionPayload(request.cookies.get(cookieName())?.value);
  const userId = payload?.userId;
  if (isWebMode()) {
    const deviceId = getWebDeviceId(request);
    return userId && payload.bindingId && deviceId ? getWebLicensedUser(userId, payload.bindingId, deviceId) : null;
  }
  return userId ? store.users.get(userId) ?? null : null;
}

export async function requireSession(request: NextRequest) {
  assertSameOrigin(request);
  const user = getSession(request);
  if (!user) throw new Error("UNAUTHORIZED");
  if (isWebMode()) await assertWebLicenseActive(user.id, user.webLicenseBindingId);
  return user;
}

export function setSessionCookie(response: NextResponse, userId: string, bindingId?: string) {
  response.cookies.set(cookieName(), makeSessionToken(userId, bindingId), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.DESKTOP_MODE !== "true", path: cookiePath(), maxAge: MAX_AGE,
  });
}

function deviceSignature(deviceId: string) { return sign("web-device-v1:" + deviceId); }
export function makeWebDeviceCookie(deviceId: string) { return deviceId + "." + deviceSignature(deviceId); }
export function getWebDeviceId(request: NextRequest) {
  const value = request.cookies.get("idai_tablet_device")?.value || "";
  const [deviceId, signature, extra] = value.split(".");
  if (extra || !/^[a-f0-9-]{36}$/i.test(deviceId || "") || !signature) return null;
  const actual = Buffer.from(signature), expected = Buffer.from(deviceSignature(deviceId));
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected) ? deviceId : null;
}
export function setWebDeviceCookie(response: NextResponse, deviceId: string) {
  response.cookies.set("idai_tablet_device", makeWebDeviceCookie(deviceId), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: cookiePath(), maxAge: 365 * 24 * 60 * 60,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(cookieName(), "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" && process.env.DESKTOP_MODE !== "true", path: cookiePath(), maxAge: 0 });
}
