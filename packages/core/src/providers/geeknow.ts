import { createHash } from "node:crypto";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: unknown;
};

type ChatCompletionResponse = {
  choices?: Array<{
    text?: unknown;
    finish_reason?: unknown;
    message?: {
      content?: unknown;
      reasoning_content?: unknown;
      refusal?: unknown;
    };
  }>;
  output_text?: unknown;
  output?: unknown;
};

type ImageResponse = {
  id?: string;
  task_id?: string;
  taskId?: string;
  status?: string;
  progress?: number;
  error?: unknown;
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  candidates?: unknown;
  output?: unknown;
  images?: unknown;
  url?: string;
  b64_json?: string;
};

type GeekNowUploadPresignResponse = {
  success?: boolean;
  message?: string;
  data?: {
    method?: string;
    upload_url?: string;
    public_url?: string;
    content_type?: string;
  };
};

const MAX_IMAGE_REFERENCES_PER_CALL = 10;
const IMAGE_TASK_POLL_DELAY_MS = 2500;
const IMAGE_TASK_POLL_INTERVAL_MS = 4000;
const IMAGE_TASK_MAX_POLLS = envNumber("GEEKNOW_IMAGE_TASK_MAX_POLLS", 65);
const IMAGE_TASK_FINISHED_GRACE_POLLS = envNumber("GEEKNOW_IMAGE_TASK_FINISHED_GRACE_POLLS", 30);
const GEEKNOW_IMAGE_PROMPT_MAX_CHARS = 3500;
const GEEKNOW_PRIORITY_TASK_PREFIX = "TASK PRIORITY:";
const GEEKNOW_SUPPORTING_LOCKS_MARKER = "\nSUPPORTING PRODUCT LOCKS:";
const geekNowUploadCache = new Map<string, string>();

function envString(name: string, fallback = "") {
  return (process.env[name] || fallback).trim();
}

const GEEKNOW_CURRENT_ORIGIN = "https://www.geeknow.top";

export function normalizeGeekNowEndpoint(endpoint: string) {
  return endpoint.replace(
    /^https:\/\/api\.geeknow\.ai(?=\/|$)/i,
    GEEKNOW_CURRENT_ORIGIN
  );
}

function geekNowEndpoint(name: string, path: string) {
  return normalizeGeekNowEndpoint(
    envString(name, `${GEEKNOW_CURRENT_ORIGIN}${path}`)
  );
}

function envNumber(name: string, fallback: number) {
  const value = Number(envString(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function shouldReturnImageUrlDirectly() {
  return envString("IMAGE_RETURN_MODE", "url").toLowerCase() !== "base64";
}

const GEEKNOW_CHAT_TIMEOUT_MS = envNumber("GEEKNOW_CHAT_TIMEOUT_MS", 60_000);
const GEEKNOW_GEMINI_IMAGE_TIMEOUT_MS = envNumber("GEEKNOW_GEMINI_IMAGE_TIMEOUT_MS", 240_000);
const GEEKNOW_IMAGE_SUBMIT_TIMEOUT_MS = envNumber("GEEKNOW_IMAGE_SUBMIT_TIMEOUT_MS", 180_000);
const GEEKNOW_IMAGE_QUERY_TIMEOUT_MS = envNumber("GEEKNOW_IMAGE_QUERY_TIMEOUT_MS", 15_000);
const GEEKNOW_UPLOAD_TIMEOUT_MS = envNumber("GEEKNOW_UPLOAD_TIMEOUT_MS", 25_000);
const GEEKNOW_DOWNLOAD_TIMEOUT_MS = envNumber("GEEKNOW_DOWNLOAD_TIMEOUT_MS", 25_000);
const GEEKNOW_IMAGE_TASK_ID_PATTERN = /\b(?:gemini-img|image|img|task|job)[_-](?=[A-Za-z0-9_-]*\d)[A-Za-z0-9][A-Za-z0-9_-]{7,}\b/i;

async function fetchWithTimeout(
  input: Parameters<typeof fetch>[0],
  init: RequestInit = {},
  timeoutMs: number,
  label: string,
  externalSignal?: AbortSignal
) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (externalSignal?.aborted) abortFromCaller();
  else externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      if (externalSignal?.aborted) {
        const abortError = new Error("操作已取消");
        abortError.name = "AbortError";
        throw abortError;
      }
      if (label === "GeekAI 方案模型") {
        throw new Error(
          `${label}超过 ${Math.round(timeoutMs / 1000)} 秒没有返回可用方案。系统会在未提交画图任务的前提下安全补试一次；如果仍失败，请稍后重试。`
        );
      }
      throw new Error(
        `${label}超过 ${Math.round(timeoutMs / 1000)} 秒没有响应，页面已停止等待。供应商可能仍在后台生成；请到 GeekAI / Geeknow 后台的任务日志或绘图日志里查看并手动打开/下载图片，也可以稍后回到页面减少数量重试。`
      );
    }
    const cause =
      error instanceof Error && error.cause && typeof error.cause === "object"
        ? (error.cause as { code?: unknown })
        : null;
    const networkCode =
      cause && typeof cause.code === "string" && cause.code.trim()
        ? `（网络代码 ${cause.code.trim()}）`
        : "";
    if (
      error instanceof TypeError ||
      (error instanceof Error &&
        /fetch failed|network|socket|connect|econn|enotfound|und_err/i.test(
          `${error.message} ${networkCode}`
        ))
    ) {
      throw new Error(
        `${label}连接供应商接口失败${networkCode}，尚未收到供应商响应，本次没有确认提交画图任务，可以直接重试。`
      );
    }
    throw error;
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}

function limitGeekNowImagePrompt(prompt: string) {
  const normalized = prompt.replace(/\s+\n/g, "\n").trim();
  if (normalized.length <= GEEKNOW_IMAGE_PROMPT_MAX_CHARS) return normalized;

  const priorityEnd = normalized.indexOf(GEEKNOW_SUPPORTING_LOCKS_MARKER);
  if (normalized.startsWith(GEEKNOW_PRIORITY_TASK_PREFIX) && priorityEnd > 0) {
    const priorityTask = normalized.slice(0, priorityEnd).trim();
    const supportingLocks = normalized
      .slice(priorityEnd + GEEKNOW_SUPPORTING_LOCKS_MARKER.length)
      .trim();
    const truncationNotice =
      "\n\nContext compacted for provider limit. Execute TASK PRIORITY exactly; supporting locks must never replace or reinterpret the requested task.";
    const supportingBudget = Math.max(
      GEEKNOW_IMAGE_PROMPT_MAX_CHARS -
        priorityTask.length -
        GEEKNOW_SUPPORTING_LOCKS_MARKER.length -
        truncationNotice.length -
        1,
      0
    );
    if (supportingBudget > 0) {
      return `${priorityTask}${GEEKNOW_SUPPORTING_LOCKS_MARKER}\n${supportingLocks
        .slice(0, supportingBudget)
        .trim()}${truncationNotice}`;
    }
    return priorityTask.slice(0, GEEKNOW_IMAGE_PROMPT_MAX_CHARS).trim();
  }

  const truncationNotice =
    "\n\nImportant: keep product category, core function, countable parts, and selected design direction.";
  return `${normalized
    .slice(0, GEEKNOW_IMAGE_PROMPT_MAX_CHARS - truncationNotice.length)
    .trim()}${truncationNotice}`;
}

function calibratedImageTemperature(prompt: string, fallback: number) {
  const marker = prompt.match(/CONTINUOUS_IMAGE_VARIATION_TEMPERATURE:\s*(0(?:\.\d+)?|1(?:\.0+)?)/i);
  if (marker) return Math.min(0.95, Math.max(0.35, Number(marker[1])));
  if (/LOCALIZED PRODUCT INPAINTING/i.test(prompt)) return 0.55;
  if (/SHARED STRENGTH LOCK|ORDINARY MULTI-OUTPUT MAGNITUDE SIGNATURE|SAME-REQUEST SIBLING MAGNITUDE SIGNATURE/i.test(prompt)) {
    return 0.7;
  }
  return fallback;
}

function maskSecrets(message: string) {
  return message
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, "sk-***")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1***")
    .replace(/(key[:=]\s*)[A-Za-z0-9._-]{8,}/gi, "$1***");
}

function sanitizeProviderError(message: string) {
  const trimmed = maskSecrets(message.trim());
  const lower = trimmed.toLowerCase();

  if (/<\s*(?:!doctype|html|head|body)\b|internal server error|nginx|upstream|request failed|\b500\b|\b502\b/.test(lower)) {
    return "GeekAI 服务暂时异常，本次没有收到结果。请等 1-2 分钟后再次尝试；如果连续失败，请切换画图模型或备用供应商。";
  }

  if (/invalid key|incorrect api key|unauthorized|authentication|permission denied|access denied|\b401\b|invalid_api_key/.test(lower)) {
    return "GeekAI API Key 无效或已失效。请到 GeekAI / Geeknow 后台重新复制完整 Key，确认没有多复制空格，再回到页面重新填写。";
  }

  if (
    /insufficient[_\s-]?quota|quota exceeded|exceeded your current quota|billing|payment required|balance|credit|credits|recharge|top up|not enough|insufficient funds|insufficient_user_quota|\b402\b/.test(
      lower
    )
  ) {
    return "GeekAI 账户余额不足或套餐额度已用完。请先到 GeekAI / Geeknow 后台充值/续费，或换一个有余额的 API Key 后再生成。";
  }

  if (/rate limit|too many requests|request limit|rpm|tpm|too_many_requests|\b429\b/.test(lower)) {
    return "请求太频繁，已触发 GeekAI 限流。请等 1-2 分钟再试，或把生成数量先调成 1-2 张。";
  }

  if (/prompt.*too long|max\s*4000|maximum.*prompt|context.*length|too many characters/.test(lower)) {
    return "传给 GeekAI 画图模型的提示词太长。系统会自动压缩提示词，请重新点一次生成；如果仍失败，请减少补充要求或参考图数量。";
  }

  if (/model.*(not found|not exist|does not exist|unavailable|unsupported)|invalid model|unsupported model|model_not_found/.test(lower)) {
    return "所选 GeekAI 模型当前不可用或模型 ID 不正确。请换用页面推荐模型，或到 GeekAI 模型广场确认该模型是否支持你的 Key。";
  }

  if (/available channel|no available channel|failed to get available channel|auto groups|distributor/.test(lower)) {
    return "当前 GeekAI 返回该模型通道不可用。请换用页面里的默认方案模型，或到 GeekAI 后台确认这个模型 ID 是否在模型广场可用。";
  }

  if (/timeout|timed out|gateway|bad gateway|service unavailable|overloaded|\b503\b|\b504\b|bad_response_body/.test(lower)) {
    return "GeekAI 响应超时或服务繁忙。供应商后台可能仍有任务记录；请到 GeekAI / Geeknow 后台的任务日志或绘图日志里打开图片并手动下载，或稍后减少生成数量重试。";
  }

  if (/content policy|safety|moderation|blocked|violate|sensitive|forbidden|\b403\b/.test(lower)) {
    return "请求被 GeekAI 或上游模型安全策略拦截。请删掉品牌、人物隐私、夸张功效或敏感描述后再试。";
  }

  if (/payload too large|request entity too large|too large|\b413\b/.test(lower)) {
    return "上传图片或请求内容太大。请减少参考图数量，或重新上传更小、更清晰的图片。";
  }

  if (/image only supports.*https?|https?.*image urls?|async image tasks/.test(lower)) {
    return "GeekAI 当前异步画图入口只接受公网图片链接。系统会先把参考图转成临时公网素材再提交，请重新点一次生成。";
  }

  if (/[\u4e00-\u9fa5]/.test(trimmed)) return trimmed;

  return "GeekAI 本次没有正常返回结果。请检查 API Key、账户余额和所选模型；确认无误后再次尝试。";
}

function getErrorMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data !== null) {
    const maybeError = data as { error?: unknown; message?: unknown; code?: unknown };
    if (typeof maybeError.message === "string") return sanitizeProviderError(maybeError.message);
    if (typeof maybeError.code === "string") return sanitizeProviderError(maybeError.code);
    if (typeof maybeError.error === "string") return sanitizeProviderError(maybeError.error);
    if (typeof maybeError.error === "object" && maybeError.error !== null) {
      const nested = maybeError.error as { message?: unknown; code?: unknown; type?: unknown };
      if (typeof nested.message === "string") return sanitizeProviderError(nested.message);
      if (typeof nested.code === "string") return sanitizeProviderError(nested.code);
      if (typeof nested.type === "string") return sanitizeProviderError(nested.type);
    }
  }
  return sanitizeProviderError(fallback);
}

async function readProviderJson(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text || "Provider returned non-JSON response." };
  }
}

function extractChatTextContent(content: unknown) {
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
      const directText = extractChatTextContent(record.text);
      const contentText = extractChatTextContent(record.content);
      return [directText, contentText].filter(Boolean);
    })
    .join("\n")
    .trim();
}

function extractChatCompletionText(data: ChatCompletionResponse) {
  const choice = data.choices?.[0];
  const content = extractChatTextContent(choice?.message?.content);
  if (content) return content;

  const legacyText = extractChatTextContent(choice?.text);
  if (legacyText) return legacyText;

  const outputText = extractChatTextContent(data.output_text);
  if (outputText) return outputText;

  const structuredOutput = extractStructuredOutputText(data.output);
  if (structuredOutput) return structuredOutput;

  const reasoning = extractChatTextContent(choice?.message?.reasoning_content);
  if (/\"cards\"\s*:|\{\s*\"title\"\s*:/.test(reasoning)) return reasoning;

  return "";
}

function isOpenAIReasoningModel(model: string) {
  const normalized = model.trim().toLowerCase();
  return /^gpt-5(?:[.-]|$)/.test(normalized) || /^o\d(?:[.-]|$)/.test(normalized);
}

function dataUrlToInlinePart(dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) throw new Error("参考图格式不正确。");

  return {
    inlineData: {
      mimeType: match[1],
      data: match[2]
    }
  };
}

function dataUrlToBase64Input(dataUrl: string) {
  const match = dataUrl.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
  if (!match) throw new Error("参考图格式不正确。");
  return match[1];
}

async function imageInputToDataUrl(imageInput: string, signal?: AbortSignal) {
  const trimmed = imageInput.trim();
  if (/^data:image\/[a-zA-Z0-9+.-]+;base64,/.test(trimmed)) return trimmed;
  if (/^https?:\/\//.test(trimmed)) {
    const image = await imageUrlToBase64(trimmed, signal);
    return `data:${image.mimeType || "image/png"};base64,${image.base64}`;
  }
  throw new Error("参考图格式不正确。");
}

async function imageInputToInlinePart(imageInput: string, signal?: AbortSignal) {
  return dataUrlToInlinePart(await imageInputToDataUrl(imageInput, signal));
}

async function imageInputToBase64Input(imageInput: string, signal?: AbortSignal) {
  return dataUrlToBase64Input(await imageInputToDataUrl(imageInput, signal));
}

function dataUrlToUploadFile(dataUrl: string, index: number) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) throw new Error("参考图格式不正确。");

  const mimeType = match[1];
  const extension =
    mimeType.includes("jpeg") || mimeType.includes("jpg")
      ? "jpg"
      : mimeType.includes("webp")
        ? "webp"
        : mimeType.includes("gif")
          ? "gif"
          : "png";

  return {
    bytes: Buffer.from(match[2].replace(/\s/g, ""), "base64"),
    mimeType,
    fileName: `reference-${Date.now()}-${index + 1}.${extension}`
  };
}

function geekNowUploadCacheKey(apiKey: string, dataUrl: string) {
  return createHash("sha256")
    .update(apiKey.slice(-16))
    .update("\0")
    .update(dataUrl)
    .digest("hex");
}

async function uploadGeekNowImageUncached(apiKey: string, dataUrl: string, index: number, signal?: AbortSignal) {
  const file = dataUrlToUploadFile(dataUrl, index);
  const endpoint = geekNowEndpoint("GEEKNOW_UPLOAD_PRESIGN_URL", "/api/upload/presign");
  const prefix = envString("GEEKNOW_UPLOAD_PREFIX", "");
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        file_name: file.fileName,
        content_type: file.mimeType,
        expires_in: 3600,
        ...(prefix ? { prefix } : {})
      })
    },
    GEEKNOW_UPLOAD_TIMEOUT_MS,
    "GeekAI 参考图预上传",
    signal
  );
  const data = (await readProviderJson(response)) as GeekNowUploadPresignResponse;

  if (!response.ok || !data.success || !data.data?.upload_url || !data.data.public_url) {
    throw new Error(`GeekAI 参考图预上传失败：${getErrorMessage(data, response.statusText || data.message || "上传地址获取失败")}`);
  }

  const uploadResponse = await fetchWithTimeout(
    data.data.upload_url,
    {
      method: data.data.method || "PUT",
      headers: {
        "Content-Type": data.data.content_type || file.mimeType
      },
      body: new Uint8Array(file.bytes)
    },
    GEEKNOW_UPLOAD_TIMEOUT_MS,
    "GeekAI 参考图上传",
    signal
  );

  if (!uploadResponse.ok) {
    throw new Error(`GeekAI 参考图上传失败：${uploadResponse.status} ${uploadResponse.statusText || ""}`.trim());
  }

  return data.data.public_url;
}

async function uploadGeekNowImage(apiKey: string, dataUrl: string, index: number, signal?: AbortSignal) {
  if (/^https?:\/\//.test(dataUrl)) return dataUrl;

  const key = geekNowUploadCacheKey(apiKey, dataUrl);
  const cached = geekNowUploadCache.get(key);
  if (cached) return cached;

  if (geekNowUploadCache.size > 100) geekNowUploadCache.clear();
  const uploadedUrl = await uploadGeekNowImageUncached(apiKey, dataUrl, index, signal);
  geekNowUploadCache.set(key, uploadedUrl);
  return uploadedUrl;
}

async function prepareGeekNowAsyncImageInputs(apiKey: string, referenceImages: string[], signal?: AbortSignal) {
  return Promise.all(
    referenceImages.slice(0, MAX_IMAGE_REFERENCES_PER_CALL).map((image, index) => uploadGeekNowImage(apiKey, image, index, signal))
  );
}

function normalizeImageBase64(value: string, expectedMimeType = "") {
  const stripped = value.includes(",") ? value.split(",").pop() || "" : value;
  const normalized = stripped.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const bytes = Buffer.from(padded, "base64");

  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  const isGif = bytes.subarray(0, 3).toString("ascii") === "GIF";

  if (!isPng && !isJpeg && !isWebp && !isGif) {
    return expectedMimeType.startsWith("image/") && padded.length > 200
      ? {
          base64: padded,
          mimeType: expectedMimeType
        }
      : null;
  }

  return {
    base64: padded,
    mimeType: expectedMimeType || (isPng ? "image/png" : isJpeg ? "image/jpeg" : isWebp ? "image/webp" : "image/gif")
  };
}

function extractImageUrlFromText(value: string) {
  const urls = value.match(/https?:\/\/[^\s"'<>\\)]+/g) || [];
  const cleaned = urls.map((url) => url.replace(/[.,;，。；]+$/g, ""));
  return cleaned.find((url) => /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(url)) || cleaned[0] || "";
}

function extractImageTaskIdFromText(value: string) {
  return value.trim().match(GEEKNOW_IMAGE_TASK_ID_PATTERN)?.[0] || "";
}

function parseMaybeJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed || !/^[{[]/.test(trimmed)) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function pickImageFromResponse(data: unknown): { url?: string; base64?: string; mimeType: string } | null {
  const queue: unknown[] = [data];
  const visited = new Set<unknown>();

  while (queue.length) {
    const node = queue.shift();
    if (!node || visited.has(node)) continue;
    visited.add(node);

    if (typeof node === "string") {
      const trimmed = node.trim();
      const parsedJson = parseMaybeJson(trimmed);
      if (parsedJson) {
        queue.push(parsedJson);
        continue;
      }

      if (/^https?:\/\//.test(trimmed)) return { url: trimmed, mimeType: "image/png" };

      const embeddedDataUrl = trimmed.match(/data:(image\/[a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/_=-]+)/);
      if (embeddedDataUrl) {
        const image = normalizeImageBase64(embeddedDataUrl[2], embeddedDataUrl[1]);
        return image ? { ...image, mimeType: embeddedDataUrl[1] } : null;
      }

      if (/^data:image\/[a-zA-Z0-9+.-]+;base64,/.test(trimmed)) {
        const [prefix, base64] = trimmed.split(",");
        const mimeType = prefix.replace("data:", "").replace(";base64", "") || "image/png";
        const image = normalizeImageBase64(base64, mimeType);
        return image ? { ...image, mimeType } : null;
      }

      const embeddedUrl = extractImageUrlFromText(trimmed);
      if (embeddedUrl) return { url: embeddedUrl, mimeType: "image/png" };

      if (trimmed.length > 200 && /^[A-Za-z0-9+/_=-]+$/.test(trimmed)) {
        const image = normalizeImageBase64(trimmed);
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
    const url =
      record.url ||
      record.image_url ||
      record.output_image_url ||
      record.result_url ||
      record.public_url ||
      record.file_url ||
      record.download_url ||
      record.image;
    if (typeof url === "string" && /^https?:\/\//.test(url)) return { url, mimeType: "image/png" };

    const fileData = record.fileData || record.file_data;
    if (typeof fileData === "object" && fileData !== null) {
      const fileRecord = fileData as Record<string, unknown>;
      const fileUrl = fileRecord.fileUri || fileRecord.file_uri || fileRecord.uri || fileRecord.url;
      if (typeof fileUrl === "string" && /^https?:\/\//.test(fileUrl)) {
        return {
          url: fileUrl,
          mimeType:
            typeof fileRecord.mimeType === "string"
              ? fileRecord.mimeType
              : typeof fileRecord.mime_type === "string"
                ? fileRecord.mime_type
                : "image/png"
        };
      }
    }

    const inlineData = record.inlineData || record.inline_data;
    if (typeof inlineData === "object" && inlineData !== null) {
      const inlineRecord = inlineData as Record<string, unknown>;
      const value = inlineRecord.data || inlineRecord.bytesBase64Encoded;
      const mimeType =
        typeof inlineRecord.mimeType === "string"
          ? inlineRecord.mimeType
          : typeof inlineRecord.mime_type === "string"
            ? inlineRecord.mime_type
            : "";
      if (typeof value === "string") {
        if (/^https?:\/\//.test(value)) return { url: value, mimeType: "image/png" };
        if (value.length > 200) {
          const image = normalizeImageBase64(value, mimeType);
          if (image) {
            return {
              ...image,
              mimeType: mimeType || image.mimeType
            };
          }
        }
      }
    }

    const b64 = record.b64_json || record.base64 || record.image_base64 || record.bytesBase64Encoded;
    if (typeof b64 === "string" && b64.length > 200) {
      const mimeType =
        typeof record.mime_type === "string" ? record.mime_type : typeof record.mimeType === "string" ? record.mimeType : "";
      const image = normalizeImageBase64(b64, mimeType);
      if (image) {
        return {
          ...image,
          mimeType: mimeType || image.mimeType
        };
      }
    }

    queue.push(...Object.values(record));
  }

  return null;
}

async function resolvePickedImage(
  image: { url?: string; base64?: string; mimeType: string },
  signal?: AbortSignal,
  taskId = ""
) {
  let resolvedImage = image;
  if (image.url && !shouldReturnImageUrlDirectly()) {
    try {
      resolvedImage = await imageUrlToBase64(image.url, signal);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
    }
  }

  return taskId
    ? {
        ...resolvedImage,
        providerTaskId: taskId,
        providerTaskUrl: envString("GEEKNOW_TASK_LOG_URL", "https://www.geeknow.top/console/task")
      }
    : resolvedImage;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      const error = new Error("操作已取消");
      error.name = "AbortError";
      reject(error);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      const error = new Error("操作已取消");
      error.name = "AbortError";
      reject(error);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function buildGeekNowImageTaskQueryUrl(taskId: string) {
  const configured = geekNowEndpoint(
    "GEEKNOW_IMAGE_ASYNC_QUERY_URL",
    "/v1/images/generations/async/{taskId}"
  );
  const encodedTaskId = encodeURIComponent(taskId);
  if (configured.includes("{taskId}")) return configured.replace("{taskId}", encodedTaskId);
  return `${configured.replace(/\/$/, "")}/${encodedTaskId}`;
}

function extractImageTaskId(data: unknown) {
  const queue: unknown[] = [data];
  const visited = new Set<unknown>();

  while (queue.length) {
    const node = queue.shift();
    if (!node || visited.has(node)) continue;
    visited.add(node);

    if (typeof node === "string") {
      const parsedJson = parseMaybeJson(node);
      if (parsedJson) {
        queue.push(parsedJson);
        continue;
      }
      const taskId = extractImageTaskIdFromText(node);
      if (taskId) return taskId;
      continue;
    }

    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }

    if (typeof node !== "object") continue;
    const record = node as Record<string, unknown>;
    const directTaskId = record.task_id || record.taskId || record.taskID || record.job_id || record.jobId || record.jobID;
    if (typeof directTaskId === "string" && directTaskId.trim()) return directTaskId.trim();

    const id = record.id;
    const objectType = typeof record.object === "string" ? record.object.toLowerCase() : "";
    const hasTaskShape = "status" in record || "progress" in record || objectType.includes("task");
    if (
      typeof id === "string" &&
      id.trim() &&
      (hasTaskShape || Boolean(extractImageTaskIdFromText(id)))
    ) {
      return id.trim();
    }

    queue.push(...Object.values(record));
  }

  return "";
}

function extractImageTaskStatus(data: unknown) {
  const queue: unknown[] = [data];
  const visited = new Set<unknown>();

  while (queue.length) {
    const node = queue.shift();
    if (!node || visited.has(node)) continue;
    visited.add(node);

    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }

    if (typeof node !== "object") continue;
    const record = node as Record<string, unknown>;
    if (typeof record.status === "string" && record.status.trim()) return record.status.trim().toLowerCase();
    if (typeof record.state === "string" && record.state.trim()) return record.state.trim().toLowerCase();
    if (typeof record.progress === "number" && record.progress >= 100) return "success";
    if (typeof record.progress === "string" && /^100%?$/.test(record.progress.trim())) return "success";
    queue.push(...Object.values(record));
  }

  return "";
}

function extractImageTaskError(data: unknown) {
  const queue: unknown[] = [data];
  const visited = new Set<unknown>();

  while (queue.length) {
    const node = queue.shift();
    if (!node || visited.has(node)) continue;
    visited.add(node);

    if (typeof node === "string" && node.trim()) return sanitizeProviderError(node);

    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }

    if (typeof node !== "object") continue;
    const record = node as Record<string, unknown>;
    const maybeError = record.error || record.errors;
    if (typeof maybeError === "string" && maybeError.trim()) return sanitizeProviderError(maybeError);
    if (typeof maybeError === "object" && maybeError !== null) {
      const errorRecord = maybeError as Record<string, unknown>;
      if (typeof errorRecord.message === "string" && errorRecord.message.trim()) return sanitizeProviderError(errorRecord.message);
      if (typeof errorRecord.code === "string" && errorRecord.code.trim()) return sanitizeProviderError(errorRecord.code);
    }
    if (typeof record.message === "string" && record.message.trim()) return sanitizeProviderError(record.message);
    if (typeof record.reason === "string" && record.reason.trim()) return sanitizeProviderError(record.reason);

    queue.push(...Object.values(record));
  }

  return "";
}

function isFinishedImageTask(status: string) {
  return ["completed", "complete", "succeeded", "succeed", "successful", "success", "done", "finished", "ok", "成功"].includes(status);
}

function isFailedImageTask(status: string) {
  return ["failed", "error", "cancelled", "canceled", "expired"].includes(status);
}

function isTransientImageTaskQueryError(error: unknown) {
  if (!(error instanceof Error) || error.name === "AbortError") return false;
  return /超时|timeout|timed out|网络|network|fetch failed|connection|socket|reset|terminated|服务暂时异常|service unavailable|overloaded|gateway|too many requests|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b/i.test(
    error.message
  );
}

async function queryGeekNowImageTask(apiKey: string, taskId: string, signal?: AbortSignal) {
  const response = await fetchWithTimeout(
    buildGeekNowImageTaskQueryUrl(taskId),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`
      }
    },
    GEEKNOW_IMAGE_QUERY_TIMEOUT_MS,
    "GeekAI 图片任务查询",
    signal
  );
  const data = await readProviderJson(response);

  if (!response.ok) {
    throw new Error(`GeekAI 图片任务查询失败：${getErrorMessage(data, response.statusText)}`);
  }

  return data;
}

async function waitForGeekNowImageTask({
  apiKey,
  taskId,
  signal
}: {
  apiKey: string;
  taskId: string;
  signal?: AbortSignal;
}) {
  await sleep(IMAGE_TASK_POLL_DELAY_MS, signal);

  let lastStatus = "";
  let lastSummary = "";
  let finishedWithoutImagePolls = 0;
  let consecutiveQueryFailures = 0;
  let totalQueryFailures = 0;
  for (let index = 0; index < IMAGE_TASK_MAX_POLLS; index += 1) {
    let taskData: unknown;
    try {
      taskData = await queryGeekNowImageTask(apiKey, taskId, signal);
      consecutiveQueryFailures = 0;
    } catch (error) {
      if (!isTransientImageTaskQueryError(error)) throw error;
      consecutiveQueryFailures += 1;
      totalQueryFailures += 1;
      lastSummary = error instanceof Error ? error.message : String(error || "任务查询暂时失败");
      await sleep(IMAGE_TASK_POLL_INTERVAL_MS, signal);
      continue;
    }
    const image = pickImageFromResponse(taskData);
    if (image) return image;

    const status = extractImageTaskStatus(taskData);
    if (status) lastStatus = status;
    lastSummary = summarizeImageResponse(taskData);

    if (status && isFailedImageTask(status)) {
      throw new Error(`GeekAI 图片任务失败：${extractImageTaskError(taskData) || lastSummary || status}`);
    }

    if (status && isFinishedImageTask(status)) {
      finishedWithoutImagePolls += 1;
      if (finishedWithoutImagePolls >= IMAGE_TASK_FINISHED_GRACE_POLLS) {
        throw new Error(
          `GeekAI 图片任务已完成，但等待图片转存约 ${Math.round(
            (IMAGE_TASK_FINISHED_GRACE_POLLS * IMAGE_TASK_POLL_INTERVAL_MS) / 1000
          )} 秒后仍没有返回可解析图片。任务 ID：${taskId}。${lastSummary}`
        );
      }
    } else {
      finishedWithoutImagePolls = 0;
    }

    await sleep(IMAGE_TASK_POLL_INTERVAL_MS, signal);
  }

  const waitMinutes = Math.max(
    1,
    Math.round((IMAGE_TASK_POLL_DELAY_MS + IMAGE_TASK_MAX_POLLS * IMAGE_TASK_POLL_INTERVAL_MS) / 60_000)
  );
  throw new Error(
    `GeekAI 图片任务已提交，但页面等待约 ${waitMinutes} 分钟仍未取回图片。任务 ID：${taskId}，最后状态：${lastStatus || "未知"}${
      totalQueryFailures > 0 ? `，期间查询波动 ${totalQueryFailures} 次（最后连续 ${consecutiveQueryFailures} 次）` : ""
    }。供应商可能仍在后台生成；请到 GeekAI / Geeknow 后台的任务日志或绘图日志里打开图片并手动下载，或稍后减少生成数量重试。`
  );
}

function summarizeImageResponse(data: unknown) {
  const partKeys: string[] = [];
  const textSnippets: string[] = [];
  const queue: Array<{ value: unknown; depth: number }> = [{ value: data, depth: 0 }];
  const visited = new Set<unknown>();

  while (queue.length && partKeys.length < 8 && textSnippets.length < 3) {
    const { value, depth } = queue.shift()!;
    if (!value || depth > 4 || visited.has(value)) continue;
    visited.add(value);

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed && trimmed.length < 500 && !/^data:image\//.test(trimmed) && !/^[A-Za-z0-9+/_=-]{200,}$/.test(trimmed)) {
        textSnippets.push(trimmed.slice(0, 120));
      }
      continue;
    }

    if (Array.isArray(value)) {
      value.slice(0, 12).forEach((item) => queue.push({ value: item, depth: depth + 1 }));
      continue;
    }

    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).slice(0, 8).join(",");
      if (keys) partKeys.push(keys);
      Object.values(record)
        .slice(0, 12)
        .forEach((item) => queue.push({ value: item, depth: depth + 1 }));
    }
  }

  const keysText = partKeys.length ? `返回字段：${partKeys.slice(0, 4).join(" / ")}。` : "";
  const textText = textSnippets.length ? `文本片段：${textSnippets[0]}。` : "";
  return `${keysText}${textText}` || "返回内容里没有找到 url、base64、inlineData 或 fileData。";
}

async function imageUrlToBase64(imageUrl: string, signal?: AbortSignal) {
  const response = await fetchWithTimeout(imageUrl, {}, GEEKNOW_DOWNLOAD_TIMEOUT_MS, "GeekAI 图片下载", signal);
  if (!response.ok) throw new Error(`图片下载失败：${response.status}`);

  const mimeType = response.headers.get("content-type") || "image/png";
  const bytes = await response.arrayBuffer();
  return {
    base64: Buffer.from(bytes).toString("base64"),
    mimeType
  };
}

function geekNowImageSize(model: string) {
  const normalized = model.toLowerCase();
  if (normalized.includes("seedream")) return envString("GEEKNOW_SEEDREAM_IMAGE_SIZE", "2048x2048");
  if (normalized.includes("gpt-image-2-pro")) return envString("GEEKNOW_GPT_IMAGE_PRO_SIZE", "2048x2048");
  return envString("GEEKNOW_IMAGE_SIZE", "1024x1024");
}

function isGeekNowGeminiImageModel(model: string) {
  const normalized = model.toLowerCase();
  return normalized.includes("gemini") && normalized.includes("image");
}

export async function callGeekNowChatCompletion({
  apiKey,
  model,
  messages,
  signal
}: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}) {
  const endpoint = geekNowEndpoint("GEEKNOW_CHAT_URL", "/v1/chat/completions");
  const normalizedModel = model.trim();
  const reasoningModel = isOpenAIReasoningModel(normalizedModel);
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: normalizedModel,
        messages,
        stream: false,
        max_completion_tokens: 8192,
        ...(reasoningModel
          ? {
              enable_thinking: false,
              thinking: {
                include_thoughts: false,
                reasoning_effort: "none"
              }
            }
          : { temperature: 0.75 })
      })
    },
    GEEKNOW_CHAT_TIMEOUT_MS,
    "GeekAI 方案模型",
    signal
  );

  const data = (await readProviderJson(response)) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(`GeekAI 方案模型调用失败：${getErrorMessage(data, response.statusText)}`);
  }

  const content = extractChatCompletionText(data);
  if (!content) throw new Error("GeekAI 方案模型没有返回方案内容。");
  return content;
}

async function generateGeekNowGeminiImage({
  apiKey,
  model,
  prompt,
  referenceImages,
  imageSize,
  imageAspectRatio,
  preserveInputAspectRatio,
  signal
}: {
  apiKey: string;
  model: string;
  prompt: string;
  referenceImages: string[];
  imageSize?: "2K" | "4K";
  imageAspectRatio?: "1:1" | "3:2";
  preserveInputAspectRatio?: boolean;
  signal?: AbortSignal;
}) {
  const endpoint = `${geekNowEndpoint("GEEKNOW_GEMINI_BASE_URL", "/v1beta/models")}/${encodeURIComponent(
    model.trim()
  )}:generateContent`;
  const safePrompt = limitGeekNowImagePrompt(prompt);
  const imageParts = await Promise.all(
    referenceImages.slice(0, MAX_IMAGE_REFERENCES_PER_CALL).map((image) => imageInputToInlinePart(image, signal))
  );
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${safePrompt}

Use the reference product images as visual input. Follow the request exactly, preserve the required product identity and constraints, and return image output.`
              },
              ...imageParts
            ]
          }
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: calibratedImageTemperature(safePrompt, 1),
          topP: 0.95,
          maxOutputTokens: 8192,
          imageConfig: {
            ...(preserveInputAspectRatio
              ? {}
              : { aspectRatio: imageAspectRatio || envString("GEEKNOW_GEMINI_ASPECT_RATIO", "1:1") }),
            imageSize: imageSize || (model.toLowerCase().includes("pro") ? envString("GEEKNOW_GEMINI_PRO_IMAGE_SIZE", "2K") : "1K")
          }
        }
      })
    },
    GEEKNOW_GEMINI_IMAGE_TIMEOUT_MS,
    "GeekAI Gemini 画图模型",
    signal
  );

  const data = (await readProviderJson(response)) as ImageResponse;
  if (!response.ok) {
    throw new Error(`GeekAI Gemini 画图模型调用失败：${getErrorMessage(data, response.statusText)}`);
  }

  const taskId = extractImageTaskId(data);
  const image = pickImageFromResponse(data);
  if (image) return resolvePickedImage(image, signal, taskId);

  if (taskId) {
    const taskImage = await waitForGeekNowImageTask({
      apiKey,
      taskId,
      signal
    });
    return resolvePickedImage(taskImage, signal, taskId);
  }

  throw new Error(`GeekAI Gemini 画图模型已响应，但没有返回可解析的图片。${summarizeImageResponse(data)}`);
}

async function generateGeekNowCompatibleImage({
  apiKey,
  model,
  prompt,
  referenceImages,
  signal
}: {
  apiKey: string;
  model: string;
  prompt: string;
  referenceImages: string[];
  signal?: AbortSignal;
}) {
  const normalizedModel = model.trim();
  const safePrompt = limitGeekNowImagePrompt(prompt);
  const endpoint = geekNowEndpoint("GEEKNOW_IMAGE_GENERATION_URL", "/v1/images/generations");
  const imageInputs = await Promise.all(
    referenceImages.slice(0, MAX_IMAGE_REFERENCES_PER_CALL).map((image) => imageInputToBase64Input(image, signal))
  );
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: normalizedModel,
        prompt: safePrompt,
        n: 1,
        size: geekNowImageSize(normalizedModel),
        image: imageInputs,
        response_format: "url",
        quality: "high",
        watermark: false,
        background: "auto"
      })
    },
    GEEKNOW_IMAGE_SUBMIT_TIMEOUT_MS,
    "GeekAI 画图模型",
    signal
  );

  const data = (await readProviderJson(response)) as ImageResponse;
  if (!response.ok) {
    throw new Error(`GeekAI 画图模型调用失败：${getErrorMessage(data, response.statusText)}`);
  }

  const taskId = extractImageTaskId(data);
  const image = pickImageFromResponse(data);
  if (image) return resolvePickedImage(image, signal, taskId);

  if (taskId) {
    const taskImage = await waitForGeekNowImageTask({
      apiKey,
      taskId,
      signal
    });
    return resolvePickedImage(taskImage, signal, taskId);
  }

  throw new Error(`GeekAI 画图模型已响应，但没有返回可解析的图片或任务 ID。${summarizeImageResponse(data)}`);
}

async function generateGeekNowAsyncImage({
  apiKey,
  model,
  prompt,
  referenceImages,
  signal
}: {
  apiKey: string;
  model: string;
  prompt: string;
  referenceImages: string[];
  signal?: AbortSignal;
}) {
  const normalizedModel = model.trim();
  const safePrompt = limitGeekNowImagePrompt(prompt);
  const endpoint = geekNowEndpoint(
    "GEEKNOW_IMAGE_ASYNC_GENERATION_URL",
    "/v1/images/generations/async"
  );
  const imageInputs = await prepareGeekNowAsyncImageInputs(apiKey, referenceImages, signal);
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: normalizedModel,
        prompt: safePrompt,
        n: 1,
        size: geekNowImageSize(normalizedModel),
        image: imageInputs,
        response_format: "url",
        quality: "high",
        watermark: false,
        background: "auto"
      })
    },
    GEEKNOW_IMAGE_SUBMIT_TIMEOUT_MS,
    "GeekAI 异步画图模型",
    signal
  );

  const data = (await readProviderJson(response)) as ImageResponse;
  if (!response.ok) {
    throw new Error(`GeekAI 异步画图模型调用失败：${getErrorMessage(data, response.statusText)}`);
  }

  const taskId = extractImageTaskId(data);
  const image = pickImageFromResponse(data);
  if (image) return resolvePickedImage(image, signal, taskId);

  if (taskId) {
    const taskImage = await waitForGeekNowImageTask({
      apiKey,
      taskId,
      signal
    });
    return resolvePickedImage(taskImage, signal, taskId);
  }

  throw new Error(`GeekAI 异步画图模型已响应，但没有返回可解析的图片或任务 ID。${summarizeImageResponse(data)}`);
}

export async function generateGeekNowImageEdit({
  apiKey,
  model,
  prompt,
  referenceImages,
  imageSize,
  imageAspectRatio,
  preserveInputAspectRatio,
  signal
}: {
  apiKey: string;
  model: string;
  prompt: string;
  referenceImages: string[];
  imageSize?: "2K" | "4K";
  imageAspectRatio?: "1:1" | "3:2";
  preserveInputAspectRatio?: boolean;
  signal?: AbortSignal;
}) {
  const normalizedModel = model.trim();
  if (isGeekNowGeminiImageModel(normalizedModel)) {
    return generateGeekNowGeminiImage({
      apiKey,
      model: normalizedModel,
      prompt,
      referenceImages,
      imageSize,
      imageAspectRatio,
      preserveInputAspectRatio,
      signal
    });
  }

  if (envString("GEEKNOW_IMAGE_FORCE_SYNC", "").toLowerCase() === "true") {
    return generateGeekNowCompatibleImage({
      apiKey,
      model: normalizedModel,
      prompt,
      referenceImages,
      signal
    });
  }

  return generateGeekNowAsyncImage({
    apiKey,
    model: normalizedModel,
    prompt,
    referenceImages,
    signal
  });
}
