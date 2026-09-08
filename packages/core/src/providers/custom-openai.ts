import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: unknown;
};

type CustomProviderOptions = {
  apiKey: string;
  model: string;
  baseUrl: string;
  providerName?: string;
  signal?: AbortSignal;
};

type ChatCompletionResponse = {
  choices?: Array<{
    text?: unknown;
    message?: {
      content?: unknown;
      reasoning_content?: unknown;
    };
  }>;
  output_text?: unknown;
  output?: unknown;
};

type ImageResponse = {
  data?: unknown;
  output?: unknown;
  images?: unknown;
  url?: string;
  b64_json?: string;
};

const MAX_IMAGE_REFERENCES_PER_CALL = 10;

function safeProviderName(value?: string) {
  const normalized = value?.replace(/[\r\n\t]+/g, " ").trim().slice(0, 40);
  return normalized || "自定义第三方平台";
}

function maskSecrets(message: string) {
  return message
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, "sk-***")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1***")
    .replace(/(key[:=]\s*)[A-Za-z0-9._-]{8,}/gi, "$1***");
}

function sanitizeProviderError(message: string, providerName?: string) {
  const label = safeProviderName(providerName);
  const trimmed = maskSecrets(message.trim());
  const lower = trimmed.toLowerCase();

  if (/invalid key|incorrect api key|unauthorized|authentication|permission denied|access denied|\b401\b/.test(lower)) {
    return `${label} 的 API Key 无效或无权调用当前模型。请到该平台后台重新复制 Key 并确认模型权限。`;
  }
  if (/insufficient[_\s-]?quota|quota exceeded|billing|payment required|balance|credit|insufficient funds|\b402\b/.test(lower)) {
    return `${label} 账户余额不足或额度已用完。请到该平台后台检查余额。`;
  }
  if (/rate limit|too many requests|request limit|rpm|tpm|\b429\b/.test(lower)) {
    return `${label} 当前请求过多，已触发限流。请稍后重试或先减少生成数量。`;
  }
  if (/model.*(not found|not exist|unavailable|unsupported)|invalid model|unsupported model|model_not_found/.test(lower)) {
    return `${label} 不支持当前模型 ID，请对照该平台文档检查模型名称。`;
  }
  if (/timeout|timed out|gateway|bad gateway|service unavailable|overloaded|\b503\b|\b504\b/.test(lower)) {
    return `${label} 响应超时或服务繁忙。请先到该平台的任务或调用日志确认是否已扣费，再决定是否重试。`;
  }
  if (/content policy|safety|moderation|blocked|violate|sensitive|forbidden|\b403\b/.test(lower)) {
    return `${label} 拒绝了当前请求。请检查模型权限、内容安全规则和平台分组设置。`;
  }
  if (/payload too large|request entity too large|too large|\b413\b/.test(lower)) {
    return `${label} 认为上传图片或请求内容过大。请减少参考图数量或压缩图片。`;
  }
  if (/[\u4e00-\u9fa5]/.test(trimmed) && trimmed.length <= 240) return trimmed;
  return `${label} 没有正常返回结果。请检查 API Base URL、API Key、模型 ID，并确认该平台支持 OpenAI 兼容接口。`;
}

function getErrorMessage(data: unknown, fallback: string, providerName?: string) {
  if (typeof data === "object" && data !== null) {
    const error = data as { error?: unknown; message?: unknown; code?: unknown };
    if (typeof error.message === "string") return sanitizeProviderError(error.message, providerName);
    if (typeof error.code === "string") return sanitizeProviderError(error.code, providerName);
    if (typeof error.error === "string") return sanitizeProviderError(error.error, providerName);
    if (typeof error.error === "object" && error.error !== null) {
      const nested = error.error as { message?: unknown; code?: unknown; type?: unknown };
      if (typeof nested.message === "string") return sanitizeProviderError(nested.message, providerName);
      if (typeof nested.code === "string") return sanitizeProviderError(nested.code, providerName);
      if (typeof nested.type === "string") return sanitizeProviderError(nested.type, providerName);
    }
  }
  return sanitizeProviderError(fallback, providerName);
}

async function readProviderJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text || "Provider returned a non-JSON response." };
  }
}

function isUnsafeIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isUnsafeIp(address: string) {
  const version = isIP(address);
  if (version === 4) return isUnsafeIpv4(address);
  if (version !== 6) return true;
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  return mappedIpv4 ? isUnsafeIpv4(mappedIpv4) : false;
}

async function validatedBaseUrl(rawBaseUrl: string) {
  const value = rawBaseUrl.trim();
  if (!value) throw new Error("请填写自定义平台的 API Base URL。");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("API Base URL 格式不正确，请填写完整的 https:// 地址。");
  }

  if (url.protocol !== "https:") throw new Error("自定义平台仅允许使用 HTTPS API 地址。");
  if (url.username || url.password) throw new Error("API Base URL 不能包含用户名或密码。");
  if (url.search || url.hash) throw new Error("API Base URL 不能包含查询参数或锚点。");

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan") ||
    hostname === "metadata.google.internal" ||
    isIP(hostname)
  ) {
    throw new Error("API Base URL 必须使用公网 HTTPS 域名，不能使用本机、内网或 IP 地址。");
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("API Base URL 的域名无法解析，请检查地址是否正确。");
  }
  if (!addresses.length || addresses.some(({ address }) => isUnsafeIp(address))) {
    throw new Error("API Base URL 必须解析到公网地址。");
  }

  const pathname = url.pathname
    .replace(/\/(?:chat\/completions|images\/(?:edits|generations))\/?$/i, "")
    .replace(/\/+$/, "");
  url.pathname = pathname;
  return url;
}

async function endpointFor(baseUrl: string, path: string) {
  const url = await validatedBaseUrl(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  return url.toString();
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (typeof part !== "object" || part === null) return "";
      const record = part as Record<string, unknown>;
      return typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractStructuredOutputText(output: unknown) {
  if (!Array.isArray(output)) return "";
  return output
    .flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const record = item as Record<string, unknown>;
      return [extractText(record.text), extractText(record.content)].filter(Boolean);
    })
    .join("\n")
    .trim();
}

function extractChatCompletionText(data: ChatCompletionResponse) {
  const choice = data.choices?.[0];
  const content = [
    extractText(choice?.message?.content),
    extractText(choice?.text),
    extractText(data.output_text),
    extractStructuredOutputText(data.output)
  ].find(Boolean);
  if (content) return content;
  const reasoning = extractText(choice?.message?.reasoning_content);
  return /\{[\s\S]*\}/.test(reasoning) ? reasoning : "";
}

function normalizeImageBase64(value: string) {
  const stripped = value.includes(",") ? value.split(",").pop() || "" : value;
  const normalized = stripped.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const bytes = Buffer.from(padded, "base64");
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  const gif = bytes.subarray(0, 3).toString("ascii") === "GIF";
  if (!png && !jpeg && !webp && !gif) return null;
  return { base64: padded, mimeType: png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : "image/gif" };
}

function pickImageFromResponse(data: unknown): { url?: string; base64?: string; mimeType: string } | null {
  const queue: unknown[] = [data];
  const visited = new Set<unknown>();
  while (queue.length) {
    const node = queue.shift();
    if (!node || visited.has(node)) continue;
    visited.add(node);
    if (typeof node === "string") {
      if (/^https:\/\//.test(node)) return { url: node, mimeType: "image/png" };
      if (/^data:image\/[a-zA-Z0-9+.-]+;base64,/.test(node)) {
        const [prefix, base64] = node.split(",");
        const image = normalizeImageBase64(base64);
        return image ? { ...image, mimeType: prefix.replace("data:", "").replace(";base64", "") || image.mimeType } : null;
      }
      if (node.length > 200 && /^[A-Za-z0-9+/_=-]+$/.test(node)) {
        const image = normalizeImageBase64(node);
        if (image) return image;
      }
      continue;
    }
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (typeof node !== "object") continue;
    const record = node as Record<string, unknown>;
    const url = record.url || record.image_url || record.output_image_url;
    if (typeof url === "string" && /^https:\/\//.test(url)) return { url, mimeType: "image/png" };
    const inline = record.inlineData || record.inline_data;
    if (typeof inline === "object" && inline !== null) {
      const inlineRecord = inline as Record<string, unknown>;
      const value = inlineRecord.data || inlineRecord.bytesBase64Encoded;
      if (typeof value === "string") {
        const image = normalizeImageBase64(value);
        if (image) return { ...image, mimeType: String(inlineRecord.mimeType || inlineRecord.mime_type || image.mimeType) };
      }
    }
    const base64 = record.b64_json || record.base64 || record.image_base64;
    if (typeof base64 === "string") {
      const image = normalizeImageBase64(base64);
      if (image) return { ...image, mimeType: String(record.mimeType || record.mime_type || image.mimeType) };
    }
    queue.push(...Object.values(record));
  }
  return null;
}

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.trim().match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) throw new Error("参考图格式不正确。");
  const bytes = Buffer.from(match[2], "base64");
  return { blob: new Blob([new Uint8Array(bytes)], { type: match[1] }), mimeType: match[1] };
}

function calibratedImageTemperature(prompt: string) {
  const marker = prompt.match(/CONTINUOUS_IMAGE_VARIATION_TEMPERATURE:\s*(0(?:\.\d+)?|1(?:\.0+)?)/i);
  return marker ? Math.min(0.95, Math.max(0.35, Number(marker[1]))) : 0.8;
}

export async function callCustomOpenAIChatCompletion({
  apiKey,
  model,
  baseUrl,
  providerName,
  messages,
  signal
}: CustomProviderOptions & { messages: ChatMessage[] }) {
  const endpoint = await endpointFor(baseUrl, "chat/completions");
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    headers: { Authorization: `Bearer ${apiKey.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: model.trim(), messages, stream: false }),
    signal
  });
  const data = (await readProviderJson(response)) as ChatCompletionResponse;
  if (!response.ok) throw new Error(getErrorMessage(data, response.statusText, providerName));
  const content = extractChatCompletionText(data);
  if (!content) throw new Error(`${safeProviderName(providerName)} 的方案模型没有返回可读文本。`);
  return content;
}

async function generateViaChatCompletions({
  apiKey,
  model,
  baseUrl,
  providerName,
  prompt,
  referenceImages,
  imageSize,
  imageAspectRatio,
  preserveInputAspectRatio,
  signal
}: CustomProviderOptions & {
  prompt: string;
  referenceImages: string[];
  imageSize?: "2K" | "4K";
  imageAspectRatio?: "1:1" | "3:2";
  preserveInputAspectRatio?: boolean;
}) {
  const endpoint = await endpointFor(baseUrl, "chat/completions");
  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    headers: { Authorization: `Bearer ${apiKey.trim()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.trim(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${prompt}\n\nRequested native output resolution: ${imageSize || "provider standard"}.\n${imageAspectRatio ? `Requested output aspect ratio: ${imageAspectRatio}.` : ""}\n${preserveInputAspectRatio ? "Preserve the native aspect ratio and framing of input image 1." : ""}\nUse the reference product images as visual input and return image output.`
            },
            ...referenceImages.slice(0, MAX_IMAGE_REFERENCES_PER_CALL).map((url) => ({ type: "image_url", image_url: { url } }))
          ]
        }
      ],
      modalities: ["text", "image"],
      temperature: calibratedImageTemperature(prompt)
    }),
    signal
  });
  const data = (await readProviderJson(response)) as ImageResponse;
  if (!response.ok) throw new Error(getErrorMessage(data, response.statusText, providerName));
  const image = pickImageFromResponse(data);
  if (image) return image;
  throw new Error(`${safeProviderName(providerName)} 的多模态聊天接口没有返回可解析的图片。`);
}

export async function generateCustomOpenAIImageEdit({
  apiKey,
  model,
  baseUrl,
  providerName,
  prompt,
  referenceImages,
  imageSize,
  imageAspectRatio,
  preserveInputAspectRatio,
  signal
}: CustomProviderOptions & {
  prompt: string;
  referenceImages: string[];
  imageSize?: "2K" | "4K";
  imageAspectRatio?: "1:1" | "3:2";
  preserveInputAspectRatio?: boolean;
}) {
  const normalizedModel = model.trim();
  if (normalizedModel.toLowerCase().includes("gemini") && normalizedModel.toLowerCase().includes("image")) {
    return generateViaChatCompletions({
      apiKey,
      model: normalizedModel,
      baseUrl,
      providerName,
      prompt,
      referenceImages,
      imageSize,
      imageAspectRatio,
      preserveInputAspectRatio,
      signal
    });
  }

  const endpoint = await endpointFor(baseUrl, "images/edits");
  const formData = new FormData();
  const images = referenceImages.slice(0, MAX_IMAGE_REFERENCES_PER_CALL);
  for (const [index, imageDataUrl] of images.entries()) {
    const { blob, mimeType } = dataUrlToBlob(imageDataUrl);
    const extension = mimeType.includes("jpeg") ? "jpg" : mimeType.split("/")[1] || "png";
    formData.append(images.length > 1 ? "image[]" : "image", blob, `reference-${index + 1}.${extension}`);
  }
  formData.append("prompt", imageSize ? `${prompt}\n\nRequested output resolution: ${imageSize}.` : prompt);
  formData.append("model", normalizedModel);
  formData.append("n", "1");
  formData.append("size", preserveInputAspectRatio ? "auto" : "1024x1024");
  formData.append("quality", "high");
  formData.append("background", "auto");

  const response = await fetch(endpoint, {
    method: "POST",
    redirect: "error",
    headers: { Authorization: `Bearer ${apiKey.trim()}` },
    body: formData,
    signal
  });
  const data = (await readProviderJson(response)) as ImageResponse;
  if (!response.ok) throw new Error(getErrorMessage(data, response.statusText, providerName));
  const image = pickImageFromResponse(data);
  if (image) return image;
  throw new Error(`${safeProviderName(providerName)} 的图片编辑接口没有返回可解析的图片。`);
}
