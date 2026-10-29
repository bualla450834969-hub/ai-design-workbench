import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const attempts = new Map<string, { count: number; until: number }>();
export function isWebMode() { return process.env.WEB_MODE === "true" && process.env.DESKTOP_MODE !== "true"; }
export function webError(message: string, status: number) { return Object.assign(new Error(message), { status }); }
export function requireWebMode() {
  if (!isWebMode()) throw webError("接口不存在", 404);
  if ((process.env.APP_SESSION_SECRET || "").length < 32) throw webError("管理员尚未配置安全的网页版会话密钥", 503);
}
export function webDataDirectory(segment: string) {
  const directory = process.env.IDAI_DATA_DIR?.trim();
  if (!directory) throw webError("网页版尚未配置独立数据目录", 503);
  return path.join(path.resolve(directory), segment);
}
export function assertSameOrigin(request: Request) {
  if (!isWebMode() || ["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  let expected: string;
  try { expected = new URL(process.env.WEB_ORIGIN || request.url).origin; } catch { throw webError("网页版访问地址尚未配置", 503); }
  if (request.headers.get("origin") !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw webError("请求来源无效，请从当前网页重新操作", 403);
}
export function rateLimit(key: string, limit: number, windowMs = 15 * 60_000) {
  const now = Date.now();
  for (const [entry, state] of attempts) if (state.until <= now) attempts.delete(entry);
  if (attempts.size >= 10_000 && !attempts.has(key)) throw webError("请求繁忙，请稍后再试", 429);
  const state = attempts.get(key) || { count: 0, until: now + windowMs };
  state.count += 1; attempts.set(key, state);
  if (state.count > limit) throw webError("操作过于频繁，请15分钟后再试", 429);
}
export function writePrivateJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + "." + crypto.randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temporary, JSON.stringify(data), { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}
