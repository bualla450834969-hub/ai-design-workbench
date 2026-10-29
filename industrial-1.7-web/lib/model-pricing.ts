export const TEXT_MODEL_ALLOWLIST = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gpt-6.1-sol",
  "gpt-6-astra",
  "gpt-6-sol",
  "gpt-5.6-sol",
  "gpt-5.6-terra",
] as const;

export const IMAGE_MODEL_PRICES: Record<string, number> = {
  "gemini-nano-banana-2.1": 0.15,
  "gpt-image-2": 0.04,
  "gpt-image-2.5-flare": 0.04,
  "gpt-image-2.5-sunburst": 0.04,
  "gpt-image-2-pro": 0.10,
  "gemini-2.5-flash-image": 0.06,
  "gemini-2.5-flash-image-preview": 0.06,
  "gemini-3.1-flash-image-preview": 0.15,
  "gemini-3-pro-image-preview": 0.22,
};

export const KNOWN_IMAGE_MODELS = [
  ...Object.keys(IMAGE_MODEL_PRICES),
  "gemini-3.1-flash-image",
  "gemini-3-pro-image",
  "gpt-image-1.5",
] as const;

const IMAGE_MODEL_PROVIDER_SUPPORT: Record<string, readonly string[]> = {
  "gemini-3.1-flash-image": ["aihubmix"],
  "gemini-3-pro-image": ["aihubmix"],
  "gpt-image-1.5": ["aihubmix"],
};

// 文字模型按一次完整“图片分析 + 方案规划”调用给出经验估算。供应商最终账单可能不同。
export const TEXT_ANALYSIS_ESTIMATES: Record<string, number> = {
  "gemini-3.6-flash": 0.008,
  "gemini-3.7-flash": 0.004,
  "gemini-3.8-flash": 0.004,
  "gpt-5.5": 0.018,
  "gpt-5.6-sol": 0.010,
  "gpt-5.6-terra": 0.005,
  "gpt-6-astra": 0.020,
  // GeekAI 账单样本分别约 $0.015110 和 $0.014976；折算人民币约 ¥0.10。
  "gpt-6-sol": 0.10,
  "gpt-6.1-sol": 0.10,
};

export const DEFAULT_TEXT_MODEL = "gemini-3.8-flash";
export const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-image-preview";
export const APIYI_IMAGE_MODEL = "gemini-nano-banana-2.1";
export const APIYI_REFERENCE_EXCHANGE_RATE = {
  usdToCny: 6.7298,
  sourceDate: "2026-10-13",
  source: "中国银行外汇牌价（美元折算价 672.98 元 / 100 美元）",
  sourceUrl: "https://www.boc.cn/sourcedb/whpj/",
} as const;

export type ModelPriceKind = "text" | "image";
export type ModelPriceReference = {
  kind: ModelPriceKind;
  sampleDate: string;
  recordedDate: string;
  samplesUsd: readonly number[];
  sampleCount: number;
  minUsd: number;
  maxUsd: number;
  meanUsd: number;
  minCny: number;
  maxCny: number;
  meanCny: number;
  basis: "request-sample";
};

// 用户 2026-10-13 提供的 API易消费截图，按时间去重。
// 单次请求的实测扣费不是固定每张报价；截图没有完整分辨率或每次图片张数。
const APIYI_TEXT_SAMPLES_USD: Record<string, readonly number[]> = {
  "gemini-3.8-flash": [0.006798, 0.004546, 0.008212, 0.005908, 0.007072, 0.008654, 0.005736, 0.006734, 0.006624],
  "gemini-3.7-flash": [0.004640],
  "gemini-3.6-flash": [0.019510],
  "gpt-6.1-sol": [0.019650],
  "gpt-6-astra": [0.102754],
  "gpt-6-sol": [0.014550],
  "gpt-5.6-sol": [0.050142],
  "gpt-5.6-terra": [0.025160],
  "gpt-5.5": [0.086414],
};
const APIYI_IMAGE_SAMPLES_USD: Record<string, readonly number[]> = {
  "gemini-nano-banana-2.1": [0.031334],
  "gpt-image-2": [0.036476, 0.033426, 0.033586, 0.023986, 0.031026, 0.030986, 0.021686, 0.021776, 0.023370],
  "gpt-image-2.5-flare": [0.021886],
  "gpt-image-2.5-sunburst": [0.024006],
  "gemini-2.5-flash-image": [0.020000],
  "gemini-2.5-flash-image-preview": [0.020000],
  "gemini-3.1-flash-image-preview": [0.033844],
  "gemini-3-pro-image-preview": [0.090000],
};

// AIHubMix 用户 2026-10-13 与 2026-10-14 提供的独立账户样本（含 10-12 的记录）；
// 9 输入 / 37 输出的 $0.000146 是连接测试，
// 不进入完整文字分析参考。Gemini 图片型号按截图原始 ID 保留，不跨 preview 型号套价。
const AIHUBMIX_TEXT_SAMPLES_USD: Record<string, readonly number[]> = {
  "gemini-3.8-flash": [0.007236, 0.006892, 0.006044],
  "gemini-3.7-flash": [0.005624, 0.004862, 0.007758, 0.003378, 0.004364, 0.005928, 0.006050, 0.006546],
  "gemini-3.6-flash": [0.010724],
  "gpt-6.1-sol": [0.022754],
  "gpt-6-astra": [0.123520],
  "gpt-6-sol": [0.015910, 0.018084],
  "gpt-5.6-sol": [0.076688],
  "gpt-5.6-terra": [0.027648],
  "gpt-5.5": [0.090540],
};
const AIHUBMIX_IMAGE_SAMPLES_USD: Record<string, readonly number[]> = {
  "gemini-nano-banana-2.1": [0.044444],
  "gemini-2.5-flash-image": [0.040356, 0.040300, 0.040166],
  "gemini-3.1-flash-image": [0.068664],
  "gemini-3-pro-image": [0.145378],
  "gpt-image-1.5": [0.0226916],
  "gpt-image-2": [0.022526],
  "gpt-image-2.5-flare": [0.020886],
  "gpt-image-2.5-sunburst": [0.021006],
};

function roundCny(amount: number) { return Math.round(amount * 1_000_000) / 1_000_000; }

function buildMeasuredReferences(kind: ModelPriceKind, samplesByModel: Record<string, readonly number[]>, sampleDate = "2026-10-13", recordedDate = "2026-10-13") {
  return Object.fromEntries(Object.entries(samplesByModel).map(([model, samplesUsd]) => {
    const minUsd = Math.min(...samplesUsd);
    const maxUsd = Math.max(...samplesUsd);
    const meanUsd = samplesUsd.reduce((sum, value) => sum + value, 0) / samplesUsd.length;
    const reference: ModelPriceReference = {
      kind, sampleDate, recordedDate, samplesUsd, sampleCount: samplesUsd.length,
      minUsd, maxUsd, meanUsd,
      minCny: roundCny(minUsd * APIYI_REFERENCE_EXCHANGE_RATE.usdToCny),
      maxCny: roundCny(maxUsd * APIYI_REFERENCE_EXCHANGE_RATE.usdToCny),
      meanCny: roundCny(meanUsd * APIYI_REFERENCE_EXCHANGE_RATE.usdToCny),
      basis: "request-sample",
    };
    return [model, reference];
  })) as Record<string, ModelPriceReference>;
}

export const APIYI_TEXT_PRICE_REFERENCES = buildMeasuredReferences("text", APIYI_TEXT_SAMPLES_USD);
export const APIYI_IMAGE_PRICE_REFERENCES = buildMeasuredReferences("image", APIYI_IMAGE_SAMPLES_USD);
export const APIYI_ESTIMATED_TEXT_PRICE = APIYI_TEXT_PRICE_REFERENCES[DEFAULT_TEXT_MODEL].meanCny;
export const APIYI_ESTIMATED_IMAGE_PRICE = APIYI_IMAGE_PRICE_REFERENCES[APIYI_IMAGE_MODEL].meanCny;
export const AIHUBMIX_TEXT_PRICE_REFERENCES = buildMeasuredReferences("text", AIHUBMIX_TEXT_SAMPLES_USD, "2026-10-12 至 2026-10-14", "2026-10-14");
export const AIHUBMIX_IMAGE_PRICE_REFERENCES = buildMeasuredReferences("image", AIHUBMIX_IMAGE_SAMPLES_USD, "2026-10-12 至 2026-10-14", "2026-10-14");
export const AIHUBMIX_ESTIMATED_TEXT_PRICE = AIHUBMIX_TEXT_PRICE_REFERENCES[DEFAULT_TEXT_MODEL].meanCny;
export const AIHUBMIX_ESTIMATED_IMAGE_PRICE = AIHUBMIX_IMAGE_PRICE_REFERENCES[APIYI_IMAGE_MODEL].meanCny;

export type PublishedModelPriceEstimate = {
  basis: "published-rate-estimate";
  sourceDate: string;
  sourceUrl: string;
  ratesUsdPerMillion: { textInput: number; textOutput?: number; imageInput: number; imageOutput: number };
  baseline: { size: string; quality: string; count: number; textInputTokens: number; imageInputTokens: number; textOutputTokens: number; imageOutputTokens?: number; publishedImageOutputUsd?: number };
  estimatedUsd: number;
  estimatedCny: number;
  assumptions: string;
};

function buildPublishedImageEstimate(model: string, imageOutputRate: number, publishedImageOutputUsd?: number): PublishedModelPriceEstimate {
  const ratesUsdPerMillion = { textInput: 5, ...(model === "gpt-image-1.5" ? { textOutput: 10 } : {}), imageInput: 8, imageOutput: imageOutputRate };
  const baseline: PublishedModelPriceEstimate["baseline"] = {
    size: "1024x1024", quality: "auto/high", count: 1, textInputTokens: 1000, imageInputTokens: 0, textOutputTokens: 0,
    ...(publishedImageOutputUsd === undefined ? { imageOutputTokens: 7000 } : { publishedImageOutputUsd }),
  };
  const imageOutputUsd = publishedImageOutputUsd ?? (baseline.imageOutputTokens || 0) * imageOutputRate / 1_000_000;
  const estimatedUsd = imageOutputUsd + baseline.textInputTokens * ratesUsdPerMillion.textInput / 1_000_000;
  return {
    basis: "published-rate-estimate", sourceDate: "2026-10-13",
    sourceUrl: model === "gpt-image-1.5"
      ? "https://aihubmix.com/models?lang=zh-CN&sort=price_low&developer=OpenAI&type=t2i"
      : `https://aihubmix.com/model/${model}`,
    ratesUsdPerMillion, baseline, estimatedUsd, estimatedCny: roundCny(estimatedUsd * APIYI_REFERENCE_EXCHANGE_RATE.usdToCny),
    assumptions: publishedImageOutputUsd === undefined
      ? "截至 2026-10-13 无本机成功扣费样本。按公开 token 费率和保守单图高档基准推算：1000 文字输入、7000 图片输出 token。7000 是估算基准，不是模型承诺或实测；实际质量、尺寸、参考图及输出 token 会改变账单。"
      : "截至 2026-10-13 无本机成功扣费样本。图片输出取供应商公开 1024x1024 auto/high 档单图 $0.211，另计 1000 文字输入 token。未计参考图输入费用，实际尺寸、质量及输入图片会改变账单。",
  };
}

// 用户提供的 AIHubMix 公开价格截图：1.5 的文字输入 $5/M、文字输出 $10/M、
// 图片输入 $8/M、图片输出 $32/M；2 与 2.5 两款为 $5/M、$8/M、$30/M。
// 2.5 官方供应商页面另有 1K 方图 auto/high 输出 $0.211 的参考表。
// 这些是 2026-10-13 的独立费率推算，保留作为历史依据；有后续账单实测时优先使用实测价。
export const AIHUBMIX_PUBLISHED_IMAGE_ESTIMATES: Record<string, PublishedModelPriceEstimate> = {
  "gpt-image-1.5": buildPublishedImageEstimate("gpt-image-1.5", 32),
  "gpt-image-2": buildPublishedImageEstimate("gpt-image-2", 30),
  "gpt-image-2.5-flare": buildPublishedImageEstimate("gpt-image-2.5-flare", 30, 0.211),
  "gpt-image-2.5-sunburst": buildPublishedImageEstimate("gpt-image-2.5-sunburst", 30, 0.211),
};

export function getPublishedModelPriceEstimate(providerType: string, model: string) {
  return providerType === "aihubmix" ? AIHUBMIX_PUBLISHED_IMAGE_ESTIMATES[model] : undefined;
}

export function defaultImageModelForProvider(providerType: string) {
  return providerType === "apiyi" || providerType === "aihubmix" ? APIYI_IMAGE_MODEL : DEFAULT_IMAGE_MODEL;
}

export function providerTextPrice(providerType: string, model: string) {
  return providerType === "geekai" ? TEXT_ANALYSIS_ESTIMATES[model]
    : providerType === "apiyi" ? APIYI_TEXT_PRICE_REFERENCES[model]?.meanCny
      : providerType === "aihubmix" ? AIHUBMIX_TEXT_PRICE_REFERENCES[model]?.meanCny : undefined;
}

export function providerImagePrice(providerType: string, model: string) {
  return providerType === "geekai" ? IMAGE_MODEL_PRICES[model]
    : providerType === "apiyi" ? APIYI_IMAGE_PRICE_REFERENCES[model]?.meanCny
      : providerType === "aihubmix" ? AIHUBMIX_IMAGE_PRICE_REFERENCES[model]?.meanCny ?? getPublishedModelPriceEstimate(providerType, model)?.estimatedCny : undefined;
}

export function isAllowedTextModel(model: string) {
  return (TEXT_MODEL_ALLOWLIST as readonly string[]).includes(model.trim());
}

export function isKnownImageModel(model: string) {
  return (KNOWN_IMAGE_MODELS as readonly string[]).includes(model.trim());
}

export function isSelectableImageModel(model: string) {
  return /^(?:gpt[-_]?image|gemini[-_].*(?:image|imagen|nano[-_]?banana)|nano[-_]?banana)/i.test(model.trim());
}

/** An account catalog and the published remote catalog are discovery, not paid generation verification. */
export function getSelectableImageModels(providerType: string, catalog: readonly string[] = [], currentModel = "", remoteModels: readonly string[] = []) {
  void catalog; void remoteModels;
  const candidates = KNOWN_IMAGE_MODELS.filter((model) => isImageModelAvailableForProvider(model, providerType)
    && (providerType !== "aihubmix" || AIHUBMIX_IMAGE_PRICE_REFERENCES[model] !== undefined || getPublishedModelPriceEstimate(providerType, model) !== undefined));
  const current = currentModel.trim();
  const unique = [...new Set([...candidates, ...(current && !isKnownImageModel(current) && !isSelectableImageModel(current) ? [current] : [])])];
  const recommended = defaultImageModelForProvider(providerType);
  return unique.sort((left, right) => Number(right === recommended) - Number(left === recommended)
    || (providerType === "geekai" ? Number(right === APIYI_IMAGE_MODEL) - Number(left === APIYI_IMAGE_MODEL) : 0)
    || modelRecency(left, right));
}

/** Shared model order for settings and the workspace quick switcher. */
export function getSelectableTextModels(currentModel = "") {
  const current = currentModel.trim();
  return [...new Set([...TEXT_MODEL_ALLOWLIST, ...(current && current.toLowerCase() !== "gpt-5.5" && !isAllowedTextModel(current) ? [currentModel] : [])])];
}

function modelRecency(left: string, right: string) {
  const family = (model: string) => model.startsWith("gemini-") ? 0 : model.startsWith("gpt-") ? 1 : 2;
  const familyDifference = family(left) - family(right);
  if (familyDifference) return familyDifference;
  const version = (model: string) => [...model.matchAll(/\d+(?:\.\d+)*/g)].map((match) => match[0]);
  const leftVersion = version(left)[0] || "0";
  const rightVersion = version(right)[0] || "0";
  const numeric = rightVersion.localeCompare(leftVersion, undefined, { numeric: true });
  return numeric || left.localeCompare(right);
}

export function getRecommendedImageModel(providerType: string, catalog: readonly string[] = [], currentModel = "", remoteModels: readonly string[] = []) {
  const models = getSelectableImageModels(providerType, catalog, "", remoteModels);
  const recommended = defaultImageModelForProvider(providerType);
  if (models.includes(recommended)) return recommended;
  if (currentModel && models.includes(currentModel)) return currentModel;
  return models.find((model) => !/preview/i.test(model)) || models[0] || DEFAULT_IMAGE_MODEL;
}

export function getImageModelAvailabilityLabel(model: string, verification?: { status?: string; reason?: string }) {
  const status = verification?.status === "verified" ? "当前账户已实测可用"
    : verification?.status === "failed" ? "当前账户测试失败"
      : verification?.status === "incompatible" ? "接口兼容性待确认" : "目录兼容项 · 当前账户未实测";
  const retirement = /^gemini-3\.1-flash-image-preview(?:$|[-\[])/i.test(model)
    ? "；Google 原始预览版已退役，供应商同名线路以平台为准"
    : /^gemini-3\.1-flash-image(?:$|[-\[])/i.test(model)
      ? "；正式旧版已弃用，尚无官方停用日期，建议使用 Nano 2.1" : "";
  return `${status}${retirement}`;
}

export function isImageModelAvailableForProvider(model: string, providerType: string) {
  if (getUnavailableImageModelReason(providerType, model)) return false;
  const supportedProviders = IMAGE_MODEL_PROVIDER_SUPPORT[model.trim()];
  return !supportedProviders || supportedProviders.includes(providerType.trim());
}

/** An account-specific failure must not retire the model on unrelated providers. */
export function getUnavailableImageModelReason(providerType: string, model: string): string | undefined {
  if (providerType.trim().toLowerCase() === "apiyi" && /^gpt-image-2-pro(?:$|\[|[ :])/i.test(model.trim())) {
    return "gpt-image-2-pro 在当前 API易账户没有可用通道，请改选其他图片模型。";
  }
  if (providerType.trim().toLowerCase() === "aihubmix" && /^gpt-image-2-pro(?:$|\[|[ :])/i.test(model.trim())) {
    return "gpt-image-2-pro 不在当前 AIHubMix 预设可用目录中，请改选其他图片模型。";
  }
  return undefined;
}

export function getModelPriceReference(providerType: string, model: string, kind: ModelPriceKind) {
  if (providerType === "apiyi") return (kind === "text" ? APIYI_TEXT_PRICE_REFERENCES : APIYI_IMAGE_PRICE_REFERENCES)[model];
  if (providerType === "aihubmix") return (kind === "text" ? AIHUBMIX_TEXT_PRICE_REFERENCES : AIHUBMIX_IMAGE_PRICE_REFERENCES)[model];
  return undefined;
}

export function providerPricingNotice(providerType: string) {
  void providerType;
  return "";
}

export function modelReferencePriceDescription(providerType: string, model: string, kind: ModelPriceKind) {
  if (kind === "image" && getUnavailableImageModelReason(providerType, model)) return providerType === "apiyi" ? "当前账户无可用通道 · 请改选" : "当前预设不支持 · 请改选";
  const reference = getModelPriceReference(providerType, model, kind);
  if (reference) return `约 ¥${reference.meanCny.toFixed(3)}/次`;
  const publishedEstimate = kind === "image" ? getPublishedModelPriceEstimate(providerType, model) : undefined;
  if (publishedEstimate) return `约 ¥${publishedEstimate.estimatedCny.toFixed(3)}/次`;
  const price = kind === "text" ? providerTextPrice(providerType, model) : providerImagePrice(providerType, model);
  return price === undefined ? "费用待统计"
    : kind === "text" ? `约 ¥${price.toFixed(3)}/次` : `约 ¥${price.toFixed(2)}/张`;
}

export function imageModelLabel(model: string, providerType = "geekai") {
  const badge = model === defaultImageModelForProvider(providerType) ? "（默认推荐）" : "";
  return `${model}${badge} · ${modelReferencePriceDescription(providerType, model, "image")}`;
}

export function textModelLabel(model: string, providerType = "geekai") {
  const badge = model === DEFAULT_TEXT_MODEL ? "（默认推荐）" : "";
  return `${model}${badge} · ${modelReferencePriceDescription(providerType, model, "text")}`;
}

export function estimateGenerationCost(input: { textModel: string; imageModel: string; count: number; includeText?: boolean; imageUnitPrice?: number; textAnalysisPrice?: number; providerType?: string }) {
  const providerType = input.providerType || "geekai";
  const text = input.includeText === false ? 0 : input.textAnalysisPrice ?? providerTextPrice(providerType, input.textModel);
  const baseImageUnit = providerImagePrice(providerType, input.imageModel);
  const imageUnit = input.imageUnitPrice ?? baseImageUnit;
  const image = imageUnit === undefined ? undefined : imageUnit * Math.max(1, input.count);
  const total = text === undefined || image === undefined ? undefined : text + image;
  const imagePriceBasis = getModelPriceReference(providerType, input.imageModel, "image") ? "request-sample" as const
    : getPublishedModelPriceEstimate(providerType, input.imageModel) ? "published-rate-estimate" as const
      : providerType === "apiyi" || providerType === "aihubmix" ? "request-sample" as const : "image-reference" as const;
  const referenceNote = undefined;
  return { text, baseImageUnit, imageUnit, image, total, currency: "CNY" as const, imagePriceBasis, referenceNote };
}
