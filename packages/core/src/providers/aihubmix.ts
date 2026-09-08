type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: unknown;
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
  data?: Array<{
    url?: string;
    b64_json?: string;
    bs62_json?: string;
  }>;
  output?: unknown;
  images?: unknown;
  url?: string;
  b64_json?: string;
  bs62_json?: string;
};

const MAX_IMAGE_REFERENCES_PER_CALL = 10;

function calibratedImageTemperature(prompt: string, fallback: number) {
  const marker = prompt.match(/CONTINUOUS_IMAGE_VARIATION_TEMPERATURE:\s*(0(?:\.\d+)?|1(?:\.0+)?)/i);
  if (marker) return Math.min(0.95, Math.max(0.35, Number(marker[1])));
  if (/LOCALIZED PRODUCT INPAINTING/i.test(prompt)) return 0.55;
  if (/SHARED STRENGTH LOCK|ORDINARY MULTI-OUTPUT MAGNITUDE SIGNATURE|SAME-REQUEST SIBLING MAGNITUDE SIGNATURE/i.test(prompt)) {
    return 0.7;
  }
  return fallback;
}

function envString(name: string, fallback = "") {
  return (process.env[name] || fallback).trim();
}

function shouldReturnImageUrlDirectly() {
  return envString("IMAGE_RETURN_MODE", "url").toLowerCase() !== "base64";
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
    return "AIHubMix 服务暂时异常，本次没有收到结果。请等 1-2 分钟后再次尝试；如果连续失败，请切换画图模型或供应商。";
  }

  if (/invalid key|incorrect api key|unauthorized|authentication|permission denied|access denied|\b401\b/.test(lower)) {
    return "API Key 无效或已失效。请到 AIHubMix 后台重新复制完整 Key，确认没有多复制空格，再回到页面重新填写。";
  }

  if (
    /insufficient[_\s-]?quota|quota exceeded|exceeded your current quota|billing|payment required|balance|credit|credits|recharge|top up|not enough|insufficient funds|\b402\b/.test(
      lower
    )
  ) {
    return "AIHubMix 账户余额不足或套餐额度已用完。请先到 AIHubMix 后台充值/续费，或换一个有余额的 API Key 后再生成。";
  }

  if (/rate limit|too many requests|request limit|rpm|tpm|\b429\b/.test(lower)) {
    return "请求太频繁，已触发供应商限流。请等 1-2 分钟再试，或把生成数量先调成 1-2 张。";
  }

  if (/model.*(not found|not exist|does not exist|unavailable|unsupported)|invalid model|unsupported model|model_not_found/.test(lower)) {
    return "所选模型当前不可用或模型 ID 不正确。请换用页面推荐模型，或到 AIHubMix 模型页确认该模型是否支持你的 API Key。";
  }

  if (/timeout|timed out|gateway|bad gateway|service unavailable|overloaded|\b503\b|\b504\b/.test(lower)) {
    return "AIHubMix 响应超时或服务繁忙。供应商后台可能仍有任务记录；请到 AIHubMix 后台查看生成日志或图片记录并手动下载，或稍后减少生成数量重试。";
  }

  if (/content policy|safety|moderation|blocked|violate|sensitive|forbidden|\b403\b/.test(lower)) {
    return "请求被供应商安全策略拦截。请删掉品牌、人物隐私、夸张功效或敏感描述后再试。";
  }

  if (/payload too large|request entity too large|too large|\b413\b/.test(lower)) {
    return "上传图片或请求内容太大。请减少参考图数量，或重新上传更小、更清晰的图片。";
  }

  if (/[\u4e00-\u9fa5]/.test(trimmed)) {
    return trimmed;
  }

  return "AIHubMix 本次没有正常返回结果。请检查 API Key、账户余额和所选模型；确认无误后再次尝试。";
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

function dataUrlToBlob(dataUrl: string) {
  const match = dataUrl.trim().match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) throw new Error("参考图格式不正确。");

  const bytes = Buffer.from(match[2], "base64");
  return {
    blob: new Blob([new Uint8Array(bytes)], { type: match[1] }),
    mimeType: match[1]
  };
}

async function imageInputToBlob(imageInput: string, signal?: AbortSignal) {
  const trimmed = imageInput.trim();
  if (/^data:image\/[a-zA-Z0-9+.-]+;base64,/.test(trimmed)) return dataUrlToBlob(trimmed);
  if (/^https?:\/\//.test(trimmed)) {
    const image = await imageUrlToBase64(trimmed, signal);
    const bytes = Buffer.from(image.base64, "base64");
    return {
      blob: new Blob([new Uint8Array(bytes)], { type: image.mimeType || "image/png" }),
      mimeType: image.mimeType || "image/png"
    };
  }
  throw new Error("参考图格式不正确。");
}

function dataUrlToImageContent(dataUrl: string) {
  return {
    type: "image_url",
    image_url: { url: dataUrl }
  };
}

function normalizeImageBase64(value: string) {
  const stripped = value.includes(",") ? value.split(",").pop() || "" : value;
  const normalized = stripped.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const bytes = Buffer.from(padded, "base64");

  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp = bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  const isGif = bytes.subarray(0, 3).toString("ascii") === "GIF";

  if (!isPng && !isJpeg && !isWebp && !isGif) return null;

  return {
    base64: padded,
    mimeType: isPng ? "image/png" : isJpeg ? "image/jpeg" : isWebp ? "image/webp" : "image/gif"
  };
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
      return [extractChatTextContent(record.text), extractChatTextContent(record.content)].filter(Boolean);
    })
    .join("\n")
    .trim();
}

function extractChatCompletionText(data: ChatCompletionResponse) {
  const choice = data.choices?.[0];
  const candidates = [
    extractChatTextContent(choice?.message?.content),
    extractChatTextContent(choice?.text),
    extractChatTextContent(data.output_text),
    extractStructuredOutputText(data.output)
  ];
  const content = candidates.find(Boolean);
  if (content) return content;

  const reasoning = extractChatTextContent(choice?.message?.reasoning_content);
  return /\"cards\"\s*:|\{\s*\"title\"\s*:/.test(reasoning) ? reasoning : "";
}

function isOpenAIReasoningModel(model: string) {
  const normalized = model.trim().toLowerCase();
  return /^gpt-5(?:[.-]|$)/.test(normalized) || /^o\d(?:[.-]|$)/.test(normalized);
}

function pickImageFromResponse(data: unknown): { url?: string; base64?: string; mimeType: string } | null {
  const queue: unknown[] = [data];
  const visited = new Set<unknown>();

  while (queue.length) {
    const node = queue.shift();
    if (!node || visited.has(node)) continue;
    visited.add(node);

    if (typeof node === "string") {
      if (/^https?:\/\//.test(node)) return { url: node, mimeType: "image/png" };
      if (/^data:image\/[a-zA-Z0-9+.-]+;base64,/.test(node)) {
        const [prefix, base64] = node.split(",");
        const mimeType = prefix.replace("data:", "").replace(";base64", "") || "image/png";
        const image = normalizeImageBase64(base64);
        return image ? { ...image, mimeType } : null;
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
    if (typeof url === "string" && /^https?:\/\//.test(url)) return { url, mimeType: "image/png" };

    const inlineData = record.inlineData || record.inline_data;
    if (typeof inlineData === "object" && inlineData !== null) {
      const inlineRecord = inlineData as Record<string, unknown>;
      const data = inlineRecord.data || inlineRecord.bytesBase64Encoded;
      if (typeof data === "string" && data.length > 200) {
        const image = normalizeImageBase64(data);
        if (image) {
          return {
            ...image,
            mimeType:
              typeof inlineRecord.mimeType === "string"
                ? inlineRecord.mimeType
                : typeof inlineRecord.mime_type === "string"
                  ? inlineRecord.mime_type
                  : image.mimeType
          };
        }
      }
    }

    const b64 = record.b64_json || record.base64 || record.image_base64;
    if (typeof b64 === "string" && b64.length > 200) {
      const image = normalizeImageBase64(b64);
      if (image) {
        return {
          ...image,
          mimeType:
            typeof record.mime_type === "string"
              ? record.mime_type
              : typeof record.mimeType === "string"
                ? record.mimeType
                : image.mimeType
        };
      }
    }

    if (typeof record.bs62_json === "string") {
      throw new Error("模型返回了浏览器不能直接显示的图片格式。请换用支持 Base64/URL 图片输出的画图模型。");
    }

    queue.push(...Object.values(record));
  }

  return null;
}

async function imageUrlToBase64(imageUrl: string, signal?: AbortSignal) {
  const response = await fetch(imageUrl, { signal });
  if (!response.ok) {
    throw new Error(`图片下载失败：${response.status}`);
  }

  const mimeType = response.headers.get("content-type") || "image/png";
  const bytes = await response.arrayBuffer();
  return {
    base64: Buffer.from(bytes).toString("base64"),
    mimeType
  };
}

export async function callAIHubMixChatCompletion({
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
  const endpoint = envString("AI_CHAT_URL", "https://aihubmix.com/v1/chat/completions");
  const normalizedModel = model.trim();
  const reasoningModel = isOpenAIReasoningModel(normalizedModel);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json"
    },
    signal,
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
  });

  const data = (await readProviderJson(response)) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(`AIHubMix 方案模型调用失败：${getErrorMessage(data, response.statusText)}`);
  }

  const content = extractChatCompletionText(data);
  if (!content) throw new Error("AIHubMix 方案模型没有返回方案内容。");
  return content;
}

async function generateAIHubMixGeminiImage({
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
  const endpoint = envString("AI_CHAT_URL", "https://aihubmix.com/v1/chat/completions");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json"
    },
    signal,
    body: JSON.stringify({
      model: model.trim(),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${prompt}

Requested native output resolution: ${imageSize || "provider standard"}. Preserve fine detail and avoid artificial oversharpening.
${imageAspectRatio ? `Requested output aspect ratio: ${imageAspectRatio}.` : ""}
${preserveInputAspectRatio ? "Preserve the native aspect ratio and framing of input image 1; do not force a square output." : ""}

Use the reference product images as visual input. Follow the request exactly, preserve the required product identity and constraints, and return image output.`
            },
            ...referenceImages.slice(0, MAX_IMAGE_REFERENCES_PER_CALL).map(dataUrlToImageContent)
          ]
        }
      ],
      modalities: ["text", "image"],
      temperature: calibratedImageTemperature(prompt, 0.85)
    })
  });

  const data = (await readProviderJson(response)) as ImageResponse;
  if (!response.ok) {
    throw new Error(`AIHubMix Gemini 画图模型调用失败：${getErrorMessage(data, response.statusText)}`);
  }

  const image = pickImageFromResponse(data);
  if (image?.url && shouldReturnImageUrlDirectly()) return image;
  if (image?.url) return imageUrlToBase64(image.url, signal);
  if (image) return image;

  throw new Error("AIHubMix Gemini 画图模型没有返回图片。");
}

export async function generateAIHubMixImageEdit({
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
  if (normalizedModel.toLowerCase().includes("gemini") && normalizedModel.toLowerCase().includes("image")) {
    return generateAIHubMixGeminiImage({
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

  const endpoint = envString("AI_IMAGE_EDIT_URL", "https://aihubmix.com/v1/images/edits");
  const formData = new FormData();

  const imagesForEdit = referenceImages.slice(0, MAX_IMAGE_REFERENCES_PER_CALL);
  for (const [index, imageDataUrl] of imagesForEdit.entries()) {
    const { blob, mimeType } = await imageInputToBlob(imageDataUrl, signal);
    const extension = mimeType.includes("jpeg") ? "jpg" : mimeType.split("/")[1] || "png";
    formData.append(imagesForEdit.length > 1 ? "image[]" : "image", blob, `reference-${index + 1}.${extension}`);
  }

  formData.append(
    "prompt",
    imageSize
      ? `${prompt}\n\nRequested output resolution: ${imageSize}. Preserve fine detail and avoid artificial oversharpening.`
      : prompt
  );
  formData.append("model", normalizedModel);
  formData.append("n", "1");
  formData.append("size", preserveInputAspectRatio ? "auto" : envString("IMAGE_SIZE", "1024x1024"));
  formData.append("quality", envString("IMAGE_QUALITY", "high"));
  formData.append("background", "auto");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: formData,
    signal
  });

  const data = (await readProviderJson(response)) as ImageResponse;
  if (!response.ok) {
    throw new Error(`AIHubMix 画图模型调用失败：${getErrorMessage(data, response.statusText)}`);
  }

  const image = pickImageFromResponse(data);
  if (image?.url && shouldReturnImageUrlDirectly()) return image;
  if (image?.url) return imageUrlToBase64(image.url, signal);
  if (image) return image;

  throw new Error("AIHubMix 画图模型没有返回图片。");
}
