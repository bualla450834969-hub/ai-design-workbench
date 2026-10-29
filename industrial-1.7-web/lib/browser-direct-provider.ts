/** Stateless, browser-only model transport. No application API, cookies or proxy fallback. */
export type BrowserDirectProvider = Pick<DesktopProviderDraft, "type" | "baseUrl" | "textModel" | "imageModel"> & { apiKey: string; name?: string };
export type DirectImageInput = { mimeType: string; data: string };
export type DirectImage = { blob: Blob; prompt?: string };
export type DirectRequestOptions = { signal?: AbortSignal; timeoutMs?: number; beforeRequest?: () => Promise<void> };
export type DirectTextInput = DirectRequestOptions & { provider: BrowserDirectProvider; systemPrompt: string; userPrompt: string; images?: DirectImageInput[]; maxTokens?: number };
export type DirectImagesInput = DirectTextInput & { count: number; resolution?: string; aspectRatio?: string; concurrency?: number; promptForIndex?: (index: number) => string; onImage?: (image: DirectImage, index: number) => void | Promise<void> };
export type DirectImagesOutput = { images: DirectImage[]; model: string; provider: string; failureSummary?: string };

type JsonObject = Record<string, unknown>;
const MIB = 1024 * 1024;
const MAX_IMAGE_BYTES = 40 * MIB;
const MAX_JSON_BYTES = 60 * MIB;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export class BrowserDirectError extends Error {
  constructor(message: string, readonly code: "configuration" | "authorization" | "network" | "timeout" | "http" | "response" | "image", readonly status?: number) {
    super(message);
    this.name = "BrowserDirectError";
  }
}
function fail(message: string, code: BrowserDirectError["code"] = "response"): never { throw new BrowserDirectError(message, code); }
function abortError() { return new DOMException("操作已取消；已发送的生成请求可能仍由供应商执行，请先核对供应商任务记录与扣费情况。", "AbortError"); }
function throwIfAborted(signal?: AbortSignal) { if (signal?.aborted) throw abortError(); }
async function authorize(options: DirectRequestOptions, signal: AbortSignal) {
  throwIfAborted(signal);
  try { await options.beforeRequest?.(); }
  catch { throwIfAborted(signal); fail("授权校验未通过，已停止新的模型请求。请检查授权状态和网络连接。", "authorization"); }
  throwIfAborted(signal);
}
function object(value: unknown): JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function string(value: unknown) { return typeof value === "string" ? value : ""; }

function privateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || !host.includes(".") && !host.includes(":")) return true;
  if (/^(?:localhost|localhost\.|0\.0\.0\.0)$/.test(host) || /\.(?:localhost|localdomain|local|internal|lan|home|invalid)$/.test(host)) return true;
  if (host.includes(":")) {
    // Public IPv6 remains allowed; mapped IPv4 and transition addresses are
    // excluded rather than interpreting alternate encodings as public hosts.
    return /^(?:::|fc|fd|fe[89ab]|ff|2001:(?:0:|db8:)|64:ff9b:|2002:)/i.test(host);
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b] = host.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51) || a === 203 && b === 0 || a >= 224;
  }
  return false;
}
function publicUrl(value: string, base: boolean): URL {
  let url: URL;
  try { url = new URL(value); } catch { return fail("请填写模型供应商的完整 HTTPS 地址。", "configuration"); }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const appHost = typeof location === "undefined" ? "" : location.hostname.toLowerCase().replace(/\.$/, "");
  if (url.protocol !== "https:" || url.username || url.password || url.hash || base && url.search || privateHost(host)) fail("直连只支持公开 HTTPS 供应商地址；不能使用本机、内网、账号密码、查询参数或片段地址。", "configuration");
  if (host === "zhengshixiong.cn" || host.endsWith(".zhengshixiong.cn") || appHost && host === appHost) fail("不能将本网站或授权服务器用作模型供应商；项目、图片和密钥不会发送到本站。", "configuration");
  return url;
}
function validatedProvider(provider: BrowserDirectProvider) {
  const url = publicUrl(provider.baseUrl.trim(), true);
  const apiKey = provider.apiKey.trim();
  if (!apiKey || apiKey.length > 800 || /[\r\n]/.test(apiKey)) fail("请填写有效的模型 API Key。", "configuration");
  if (!["geekai", "apiyi", "aihubmix", "openai-compatible"].includes(provider.type)) fail("不支持此供应商接口类型。", "configuration");
  return { ...provider, apiKey, baseUrl: url.toString().replace(/\/+$/, "") };
}
/** Local settings can reuse transport validation before persisting or checking a license. */
export function validateDirectProviderConfig(provider: BrowserDirectProvider): BrowserDirectProvider { return validatedProvider(provider); }
function apiUrl(provider: BrowserDirectProvider, endpoint: string, native = false) {
  const base = provider.baseUrl.replace(/\/+$/, "");
  return native ? `${base.replace(/\/v1$/i, "")}/v1beta/${endpoint}` : `${/\/v1$/i.test(base) ? base : `${base}/v1`}/${endpoint}`;
}
function modelId(value: string) {
  if (!value.trim() || value.length > 180 || /[\r\n]/.test(value)) fail("请先选择有效的模型。", "configuration");
  return value.trim();
}
function name(provider: BrowserDirectProvider) { return provider.name || provider.type; }

async function request<T>(options: DirectRequestOptions, defaultTimeout: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  throwIfAborted(options.signal);
  const controller = new AbortController();
  const requested = options.timeoutMs ?? defaultTimeout;
  const timeout = Number.isFinite(requested) ? Math.max(1, Math.min(600_000, requested)) : defaultTimeout;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    abortListener = () => { controller.abort(); reject(abortError()); };
    options.signal?.addEventListener("abort", abortListener, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new BrowserDirectError("供应商直连超时；不会自动重试。生成请求可能已计费，请先核对供应商任务记录。", "timeout")); }, timeout);
  });
  try {
    return await Promise.race([run(controller.signal), interrupted]);
  } catch (error) {
    if (options.signal?.aborted) throw abortError();
    if (error instanceof BrowserDirectError || error instanceof DOMException && error.name === "AbortError") throw error;
    throw new BrowserDirectError("浏览器无法直连供应商：可能是供应商未开放跨域（CORS）、网络或地区限制。请核对供应商浏览器直连支持；本站不会中转，也不会自动重试付费请求。", "network");
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (abortListener) options.signal?.removeEventListener("abort", abortListener);
  }
}
function directFetch(url: string, signal: AbortSignal, init: RequestInit = {}) {
  throwIfAborted(signal);
  return fetch(url, { ...init, signal, mode: "cors", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store" });
}
async function bytes(response: Response, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > limit) { await response.body?.cancel(); return fail("供应商响应超过允许的大小，请降低图片分辨率。", "response"); }
  if (!response.body) return fail("供应商返回了空内容。", "response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > limit) { await reader.cancel(); return fail("供应商响应超过允许的大小，请降低图片分辨率。", "response"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}
async function requireOk(response: Response) {
  if (response.ok) return;
  await response.body?.cancel();
  // Never echo an upstream error body; it can contain a key or user content.
  throw new BrowserDirectError(`模型供应商拒绝请求（HTTP ${response.status}）。${response.status === 401 || response.status === 403 ? "请核对供应商账号、密钥、模型权限及来源限制。" : response.status === 429 ? "供应商正在限流，请稍后手动重试。" : "请核对供应商状态与任务记录。"}不会自动重试付费请求。`, "http", response.status);
}
async function json(response: Response, limit = MAX_JSON_BYTES): Promise<JsonObject> {
  await requireOk(response);
  const buffer = await bytes(response, limit);
  try { return object(JSON.parse(new TextDecoder().decode(buffer))); }
  catch { return fail("供应商返回的内容不是有效 JSON；请核对直连地址与接口协议。", "response"); }
}
function imageType(data: Uint8Array) {
  if (data.length >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71 && data[4] === 13 && data[5] === 10 && data[6] === 26 && data[7] === 10) return "image/png";
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  if (data.length >= 12 && String.fromCharCode(...data.slice(0, 4)) === "RIFF" && String.fromCharCode(...data.slice(8, 12)) === "WEBP") return "image/webp";
  if (data.length >= 6 && /^GIF8[79]a$/.test(String.fromCharCode(...data.slice(0, 6)))) return "image/gif";
  return "";
}
function base64Bytes(data: string, mimeType: string): Uint8Array<ArrayBuffer> {
  if (!IMAGE_TYPES.has(mimeType) || !data || data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 === 1) return fail("图片必须是有效的 PNG、JPEG、WebP 或 GIF，单张不超过 40 MB。", "image");
  let binary: string;
  try { binary = atob(data); } catch { return fail("供应商或附件图片的 Base64 格式无效。", "image"); }
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  if (!output.length || output.length > MAX_IMAGE_BYTES || imageType(output) !== mimeType) return fail("图片内容与格式不匹配，请使用有效的 PNG、JPEG、WebP 或 GIF。", "image");
  return output;
}
function references(images: DirectImageInput[] | undefined, maximum = 9) {
  const inputs = images || [];
  if (inputs.length > maximum) fail(`本次最多支持 ${maximum} 张图片，不会静默省略附件。`, "image");
  let total = 0;
  const normalized = inputs.map((image) => {
    const mimeType = image.mimeType.toLowerCase().split(";")[0].trim();
    total += base64Bytes(image.data, mimeType).length;
    return { mimeType, data: image.data };
  });
  if (total > MAX_IMAGE_BYTES) fail("本次附件合计不能超过 40 MB，请减少或压缩图片。", "image");
  return normalized;
}
function imageParts(images: DirectImageInput[]) { return images.map((image) => ({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } })); }
function textContent(payload: JsonObject) {
  const nativeText = array(payload.candidates).flatMap((candidate) => array(object(object(candidate).content).parts)).map((part) => string(object(part).text)).filter(Boolean).join("\n").trim();
  if (nativeText) return nativeText;
  return array(payload.choices).map((choice) => object(object(choice).message).content).map((content) => typeof content === "string" ? content : array(content).map((part) => string(object(part).text)).filter(Boolean).join("\n")).filter(Boolean).join("\n").trim();
}

export async function fetchDirectModels(providerInput: BrowserDirectProvider, options: DirectRequestOptions = {}): Promise<string[]> {
  const provider = validatedProvider(providerInput);
  return request(options, 25_000, async (signal) => {
    await authorize(options, signal);
    const native = provider.type === "apiyi" || provider.type === "geekai";
    const payload = await json(await directFetch(apiUrl(provider, "models", native), signal, { headers: native ? { "x-goog-api-key": provider.apiKey } : { Authorization: `Bearer ${provider.apiKey}` } }), 2 * MIB);
    const models = [...new Set([...array(payload.data), ...array(payload.models)].map((value) => (string(object(value).id) || string(object(value).name)).replace(/^models\//, "").trim()).filter((value) => value && value.length <= 180))].sort().slice(0, 1000);
    if (!models.length) fail("供应商未返回模型列表，请核对接口地址或手动填写模型 ID。");
    return models;
  });
}
export async function directText(input: DirectTextInput): Promise<{ text: string; model: string; provider: string }> {
  const provider = validatedProvider(input.provider);
  const model = modelId(provider.textModel);
  const images = references(input.images);
  if (input.maxTokens !== undefined && (!Number.isInteger(input.maxTokens) || input.maxTokens < 1 || input.maxTokens > 8192)) fail("文字输出长度设置无效。", "configuration");
  return request(input, 150_000, async (signal) => {
    const native = (provider.type === "apiyi" || provider.type === "geekai") && /^gemini-/i.test(model);
    await authorize(input, signal);
    const payload = await json(await directFetch(apiUrl(provider, native ? `models/${encodeURIComponent(model)}:generateContent` : "chat/completions", native), signal, {
      method: "POST", headers: { ...(native ? { "x-goog-api-key": provider.apiKey } : { Authorization: `Bearer ${provider.apiKey}` }), "Content-Type": "application/json" },
      body: JSON.stringify(native
        ? { ...(input.systemPrompt ? { system_instruction: { parts: [{ text: input.systemPrompt }] } } : {}), contents: [{ role: "user", parts: [{ text: input.userPrompt }, ...images.map((image) => ({ inlineData: image }))] }], generationConfig: { temperature: 0.2, ...(input.maxTokens ? { maxOutputTokens: input.maxTokens } : {}) } }
        : { model, messages: [{ role: "system", content: input.systemPrompt }, { role: "user", content: [{ type: "text", text: input.userPrompt }, ...imageParts(images)] }], temperature: 0.2, stream: false, ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}) }),
    }), 8 * MIB);
    const text = textContent(payload);
    if (!text) fail("供应商没有返回文字内容；请核对所选文字模型。");
    return { text, model, provider: name(provider) };
  });
}

type ImageReference = { value: string; mimeType?: string; base64?: boolean; prompt?: string };
function responseImage(payload: JsonObject): ImageReference | undefined {
  for (const item of array(payload.data)) {
    const data = object(item), prompt = string(data.revised_prompt) || undefined;
    if (string(data.b64_json)) return { value: string(data.b64_json), mimeType: "image/png", base64: true, prompt };
    if (string(data.url)) return { value: string(data.url), prompt };
  }
  const parts: unknown[] = [];
  for (const candidate of array(payload.candidates)) parts.push(...array(object(object(candidate).content).parts));
  const texts: string[] = [];
  for (const choice of array(payload.choices)) {
    const message = object(object(choice).message);
    parts.push(...array(message.content), ...array(message.multi_mod_content), ...array(message.images));
    if (typeof message.content === "string") texts.push(message.content);
  }
  for (const part of parts) {
    const value = object(part), inline = object(value.inlineData || value.inline_data);
    const data = string(inline.data);
    if (data) return { value: data, mimeType: string(inline.mimeType || inline.mime_type) || "image/png", base64: true };
    const imageUrl = typeof value.image_url === "string" ? value.image_url : string(object(value.image_url).url);
    if (imageUrl || string(value.url)) return { value: imageUrl || string(value.url) };
    if (string(value.text)) texts.push(string(value.text));
  }
  for (const text of texts) {
    const data = text.match(/data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+/i)?.[0];
    const markdown = text.match(/!\[[^\]]*\]\((https:\/\/[^\s)]+)\)/i)?.[1];
    const url = text.match(/https:\/\/[^\s<>"')\]]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s<>"')\]]*)?/i)?.[0];
    if (data || markdown || url) return { value: data || markdown || url! };
  }
}
async function downloadImage(reference: ImageReference, provider: BrowserDirectProvider, signal: AbortSignal): Promise<DirectImage> {
  if (reference.base64) return { blob: new Blob([base64Bytes(reference.value, reference.mimeType || "image/png")], { type: reference.mimeType || "image/png" }), prompt: reference.prompt };
  const inline = reference.value.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i);
  if (inline) return { blob: new Blob([base64Bytes(inline[2], inline[1].toLowerCase())], { type: inline[1].toLowerCase() }), prompt: reference.prompt };
  const url = publicUrl(reference.value, false);
  if (provider.apiKey.length >= 4 && (url.toString().includes(provider.apiKey) || url.toString().includes(encodeURIComponent(provider.apiKey)))) fail("供应商返回的图片地址包含模型密钥，已拒绝下载以保护密钥。", "image");
  // Image CDN requests are deliberately separate: no Authorization, cookies,
  // supplier workspace header or referrer is copied to a returned URL.
  const response = await directFetch(url.toString(), signal);
  await requireOk(response);
  const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES.has(mimeType)) { await response.body?.cancel(); return fail("供应商图片下载未返回可用图片类型，无法保存；请核对供应商的浏览器直连支持。", "image"); }
  const data = await bytes(response, MAX_IMAGE_BYTES);
  if (imageType(data) !== mimeType) fail("供应商下载内容与图片格式不匹配，已拒绝保存。", "image");
  return { blob: new Blob([data], { type: mimeType }), prompt: reference.prompt };
}
function nativeGemini(provider: BrowserDirectProvider, model: string) {
  return provider.type === "geekai" && /^gemini-.*(?:image|nano-banana)/i.test(model)
    || provider.type === "apiyi" && /^gemini-(?:3\.1-flash-image(?:-preview)?|3-pro-image(?:-preview)?|nano-banana-2\.1)$/i.test(model);
}
function imageSize(model: string, ratio: string, standard: boolean) {
  if (ratio === "1:1") return "1024x1024";
  const vertical = ratio === "3:4" || ratio === "9:16";
  if (!standard && /gpt-image-2-pro/i.test(model)) return vertical ? "1536x2048" : "2048x1536";
  if (!standard && /gpt-image-2|seedream|grok/i.test(model)) return vertical ? "1152x1536" : "1536x1152";
  return vertical ? "1024x1536" : "1536x1024";
}
async function generateOne(input: DirectImagesInput, provider: BrowserDirectProvider, images: DirectImageInput[], model: string, index: number, count: number) {
  const aiHubGemini = provider.type === "aihubmix" && /^gemini-.*(?:image|nano-banana)/i.test(model);
  const native = nativeGemini(provider, model);
  const standardImages = provider.type === "aihubmix" || provider.type === "openai-compatible";
  const edit = !native && !aiHubGemini && standardImages && images.length > 0;
  const ratio = ["1:1", "4:3", "3:4", "16:9", "9:16"].includes(input.aspectRatio || "") ? input.aspectRatio! : "4:3";
  const resolution = input.resolution === "2K" || input.resolution === "4K" ? input.resolution : "1K";
  // Resolve each route at dispatch time. Multi-view cameras and per-image
  // variants must never reuse the first image's prompt for the entire batch.
  const userPrompt = input.promptForIndex ? input.promptForIndex(index) : input.userPrompt;
  if (typeof userPrompt !== "string" || !userPrompt.trim()) fail("本张图片的设计要求无效，未发起该次生成。", "configuration");
  const prompt = [input.systemPrompt, userPrompt, count > 1 ? `本次输出批次第 ${index + 1}/${count} 张图片，只生成本次这一张。` : ""].filter(Boolean).join("\n\n");
  const headers: Record<string, string> = { Authorization: `Bearer ${provider.apiKey}` };
  let endpoint: string, body: BodyInit;
  if (native) {
    endpoint = apiUrl(provider, `models/${encodeURIComponent(model)}:generateContent`, true);
    // These relays document x-goog-api-key on their native Gemini endpoint. Do
    // not add Bearer there: Authorization needs an explicit CORS allow-list.
    delete headers.Authorization;
    headers["x-goog-api-key"] = provider.apiKey;
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, ...images.map((image) => ({ inlineData: image }))] }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], maxOutputTokens: 4096, imageConfig: { ...(input.aspectRatio === "auto" ? {} : { aspectRatio: ratio }), imageSize: resolution } } });
  } else if (aiHubGemini) {
    endpoint = apiUrl(provider, "chat/completions");
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ model, messages: [{ role: "user", content: [{ type: "text", text: prompt }, ...imageParts(images)] }], modalities: ["text", "image"], generationConfig: { imageConfig: { ...(input.aspectRatio === "auto" ? {} : { aspectRatio: ratio }), imageSize: resolution } }, stream: false });
  } else if (edit) {
    endpoint = apiUrl(provider, "images/edits");
    const form = new FormData();
    for (const [key, value] of Object.entries({ model, prompt, n: "1", size: imageSize(model, ratio, true) })) form.set(key, value);
    if (/^gpt-image-/i.test(model)) form.set("output_format", "png");
    images.forEach((image, imageIndex) => {
      const extension = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType.split("/")[1];
      form.append(images.length === 1 ? "image" : "image[]", new Blob([base64Bytes(image.data, image.mimeType)], { type: image.mimeType }), `reference-${imageIndex + 1}.${extension}`);
    });
    body = form;
  } else {
    endpoint = apiUrl(provider, "images/generations");
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ model, prompt, n: 1, size: imageSize(model, ratio, standardImages), ...(standardImages ? /^gpt-image-/i.test(model) ? { output_format: "png" } : {} : { async: false, ...(images.length ? { image: images.map((image) => image.data) } : {}) }) });
  }
  return request(input, provider.type === "aihubmix" && /^gpt-image-/i.test(model) ? 600_000 : 180_000, async (signal) => {
    await authorize(input, signal);
    const payload = await json(await directFetch(endpoint, signal, { method: "POST", headers, body }));
    const reference = responseImage(payload);
    if (!reference) fail("供应商未返回图片。请先核对供应商任务记录和扣费情况，不要直接重试付费请求。");
    return downloadImage(reference, provider, signal);
  });
}
export async function directImages(input: DirectImagesInput): Promise<DirectImagesOutput> {
  const provider = validatedProvider(input.provider);
  const model = modelId(provider.imageModel);
  const images = references(input.images, 9);
  throwIfAborted(input.signal);
  if (!Number.isFinite(input.count) || Math.trunc(input.count) !== input.count || input.count < 1 || input.count > 100) fail("生成数量必须是 1 到 100 的整数。", "configuration");
  const concurrency = Math.max(1, Math.min(2, Number.isFinite(input.concurrency) ? Math.trunc(input.concurrency!) : 2));
  const results: Array<DirectImage | undefined> = Array(input.count);
  const failures: Error[] = [];
  let next = 0;
  let callbackError: unknown;
  let authorizationError: unknown;
  let cancellationError: unknown;
  await Promise.all(Array.from({ length: Math.min(concurrency, input.count) }, async () => {
    while (next < input.count && !input.signal?.aborted && !callbackError && !authorizationError && !cancellationError) {
      const index = next++;
      let result: DirectImage;
      try { result = await generateOne(input, provider, images, model, index, input.count); }
      catch (error) {
        if (input.signal?.aborted || error instanceof DOMException && error.name === "AbortError") { cancellationError = abortError(); return; }
        if (error instanceof BrowserDirectError && error.code === "authorization") { authorizationError = error; return; }
        failures.push(error instanceof Error ? error : new BrowserDirectError("供应商图片请求失败。", "response"));
        continue;
      }
      if (input.signal?.aborted) return;
      results[index] = result;
      try { await input.onImage?.(result, index); }
      catch (error) { callbackError = error || new Error("图片本地保存失败，已停止后续生成请求。"); return; }
    }
  }));
  throwIfAborted(input.signal);
  if (cancellationError) throw cancellationError;
  if (authorizationError) throw authorizationError;
  if (callbackError) throw callbackError;
  const completed = results.filter((result): result is DirectImage => Boolean(result));
  if (!completed.length) throw failures[0] || new BrowserDirectError("供应商没有返回图片。", "response");
  return { images: completed, model, provider: name(provider), ...(failures.length ? { failureSummary: `${failures.length} 张未完成：${[...new Set(failures.map((error) => error.message))].join("；")} 已保留成功图片；未自动重试。` } : {}) };
}
