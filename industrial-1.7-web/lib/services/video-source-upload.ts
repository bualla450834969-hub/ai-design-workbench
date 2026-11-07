import crypto from "node:crypto";
import { Agent } from "undici";
import { pinnedImageDispatcher, resolvePublicImageUrl } from "@/lib/services/safe-image-download";

const MAX_PRESIGN_BYTES = 16 * 1024;

function failed(message: string, status = 502) {
  return Object.assign(new Error(`${message}，本次尚未提交付费视频任务。`), { status });
}

async function readLimited(response: Response, limit: number) {
  if (!response.body) throw failed("图片上传服务没有返回内容");
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) { await response.body.cancel(); throw failed("图片上传服务返回内容过大"); }
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) { await reader.cancel(); throw failed("图片上传校验内容过大"); }
      chunks.push(Buffer.from(next.value));
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}

async function publicTarget(value: unknown) {
  if (typeof value !== "string") throw failed("GeekAI 未返回有效的图片上传地址");
  let url: URL;
  try { url = new URL(value); } catch { throw failed("GeekAI 返回的图片上传地址无效"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) throw failed("图片上传地址未通过安全校验");
  try { return await resolvePublicImageUrl(url.toString()); }
  catch { throw failed("图片上传地址无法验证为公网 HTTPS 地址，请检查网络后重试"); }
}

/** GeekAI AIGC accepts public image URLs/file IDs, not multipart media.
 * https://docs.geeknow.ai/api-reference/uploads/image-upload
 * No provider credential is ever sent to the signed object-storage URL. */
export async function uploadVerifiedVideoSource(config: { key: string; baseUrl: string }, image: Buffer) {
  let response: Response;
  try {
    response = await fetch(new URL("/api/upload/presign", config.baseUrl), {
      method: "POST", redirect: "error",
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: "product.jpg", content_type: "image/jpeg", expires_in: 900 }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch { throw failed("无法连接 GeekAI 图片上传服务，请检查网络后重试", 503); }
  if (!response.ok) { await response.body?.cancel(); throw failed("GeekAI 无法准备图片上传，请检查连接密钥和上传权限", response.status); }
  let payload: { success?: boolean; data?: { method?: string; upload_url?: string; public_url?: string; content_type?: string } };
  try { payload = JSON.parse((await readLimited(response, MAX_PRESIGN_BYTES)).toString("utf8")); }
  catch { throw failed("GeekAI 图片上传服务返回格式不正确"); }
  if (payload?.success !== true || payload.data?.method !== "PUT" || (payload.data.content_type && payload.data.content_type !== "image/jpeg")) {
    throw failed("GeekAI 图片上传服务未就绪，请联系平台检查图片存储配置");
  }
  const upload = await publicTarget(payload.data.upload_url);
  const published = await publicTarget(payload.data.public_url);
  const dispatcher = pinnedImageDispatcher(upload.hostname, upload.addresses);
  try {
    const uploaded = await fetch(upload.url, {
      method: "PUT", redirect: "error", headers: { "Content-Type": "image/jpeg" },
      body: new Uint8Array(image), signal: AbortSignal.timeout(60_000), dispatcher,
    } as RequestInit & { dispatcher: Agent });
    await uploaded.body?.cancel();
    if (!uploaded.ok) throw failed("原产品图片上传失败，请检查网络后重试");
  } catch (error) {
    if (error instanceof Error && error.message.includes("尚未提交付费视频任务")) throw error;
    throw failed("原产品图片上传中断，请检查网络后重试", 503);
  } finally { await dispatcher.destroy(); }

  const verifier = pinnedImageDispatcher(published.hostname, published.addresses);
  const sha256 = crypto.createHash("sha256").update(image).digest("hex");
  try {
    const downloaded = await fetch(published.url, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(30_000), dispatcher: verifier,
    } as RequestInit & { dispatcher: Agent });
    if (!downloaded.ok) { await downloaded.body?.cancel(); throw failed("上传后的原产品图片无法访问，请稍后重试"); }
    const bytes = await readLimited(downloaded, image.length);
    if (bytes.length !== image.length || crypto.createHash("sha256").update(bytes).digest("hex") !== sha256) {
      throw failed("上传后的图片与原产品图片不一致，已停止视频提交，请重新选择图片后重试");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("尚未提交付费视频任务")) throw error;
    throw failed("无法校验上传后的原产品图片，请检查网络后重试", 503);
  } finally { await verifier.destroy(); }
  return { publicUrl: published.url.toString(), sha256 };
}
