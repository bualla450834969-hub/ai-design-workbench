import crypto from "node:crypto";
import type { VideoPriceQuote } from "@/lib/video-pricing-types";
import { isImageToVideoModel, videoModelPricePerSecond, videoModelDurations, videoModelResolutions, videoProviderModelIds, recommendedVideoModelIds } from "@/lib/video-models";
import { assertActiveVideoConnection, type VideoConnection } from "@/lib/services/video-provider-config";
import { APIYI_PUBLIC_VIDEO_PRICES } from "@/lib/services/video-apiyi";
import { AIHUBMIX_PUBLIC_VIDEO_RATES } from "@/lib/services/video-aihubmix";
import { relayrouterVideoCreditCost } from "@/lib/services/video-relayrouter";
import { videoQuoteInYuan, videoUsdCnyRate, type VideoExchangeRate } from "@/lib/services/video-currency";

type JsonRecord = Record<string, unknown>;
type PriceEvidence = { status?: unknown; usage?: unknown; pricing?: unknown; logs?: unknown; fetchedAt?: string };
const MAX_PRICE_BYTES = 1024 * 1024;
const cache = new Map<string, { expires: number; evidence: PriceEvidence }>();
const inFlight = new Map<string, Promise<PriceEvidence>>();

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}
function positive(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}
function fixed(value: number) { return Math.round(value * 1_000_000) / 1_000_000; }

/** The published model-square reference is independent of a user's past bills. */
export function quoteVideoPrice(model: string, duration: number, _evidence: PriceEvidence, now = new Date()): VideoPriceQuote {
  const price = videoModelPricePerSecond(model);
  const base: VideoPriceQuote = { status: "unavailable", model, duration, resolution: videoModelResolutions(model)[0], billingUnit: "second", currencySymbol: "¥", sourceCurrency: "CNY", checkedAt: now.toISOString(), note: "官方表暂未提供可用的每秒标价，请查看供应商模型页面。" };
  if (!isImageToVideoModel(model) || price === null) return base;
  return { ...base, status: "reference", unitPrice: price, perSecond: price, estimatedTotal: fixed(price * duration), sourceAt: "2026-11-07T00:00:00+08:00", note: "GeekAI 官方模型广场参考价，实际以供应商账单为准。" };
}

async function readJson(url: string, key?: string): Promise<unknown> {
  try {
    const response = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : undefined, redirect: "error", signal: AbortSignal.timeout(8_000), cache: "no-store" });
    if (!response.ok || !response.body) { await response.body?.cancel(); return undefined; }
    if (Number(response.headers.get("content-length") || 0) > MAX_PRICE_BYTES) { await response.body.cancel(); return undefined; }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.byteLength;
        if (length > MAX_PRICE_BYTES) { await reader.cancel(); return undefined; }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return undefined; }
}

async function currentEvidence(config: VideoConnection, resolution?: number): Promise<PriceEvidence> {
  if (config.providerType !== "aihubmix") return {};
  const origin = new URL(config.baseUrl).origin;
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify([
    config.providerId, config.providerType, config.baseUrl, config.key, resolution ?? null,
  ])).digest("hex");
  const existing = cache.get(fingerprint);
  let evidence = existing && existing.expires > Date.now() ? existing.evidence : undefined;
  if (!evidence) {
    let pending = inFlight.get(fingerprint);
    if (!pending) {
      pending = (async () => {
        // The public AIHubMix directory is read without account credentials. Its
        // prices remain references, even when the catalog fetch itself is current.
        const next: PriceEvidence = { pricing: await readJson("https://aihubmix.com/api/v1/models?type=video") };
        next.fetchedAt = new Date().toISOString();
        if (cache.size >= 8) cache.delete(cache.keys().next().value!);
        cache.set(fingerprint, { expires: Date.now() + 60_000, evidence: next });
        return next;
      })();
      inFlight.set(fingerprint, pending);
    }
    try { evidence = await pending; } finally { inFlight.delete(fingerprint); }
  }
  return evidence;
}

function unavailableQuote(config: VideoConnection, model: string, duration: number, resolution?: number): VideoPriceQuote {
  return {
    status: "unavailable", model, duration, resolution,
    currencySymbol: "¥", checkedAt: new Date().toISOString(),
    note: `当前无法核实此型号、清晰度和时长的价格，请先在 ${config.providerName} 核对费用。`,
  };
}

function quoteProviderPrice(config: VideoConnection, model: string, duration: number, resolution: number | undefined, evidence: PriceEvidence): VideoPriceQuote {
  const supportedResolutions = videoModelResolutions(model, config.providerType);
  const selectedResolution = resolution ?? supportedResolutions[0];
  const base = unavailableQuote(config, model, duration, selectedResolution);
  if (!isImageToVideoModel(model, config.providerType) || !videoModelDurations(model, config.providerType).includes(duration)
    || !selectedResolution || !supportedResolutions.includes(selectedResolution)) return base;
  if (config.providerType === "geekai") return quoteVideoPrice(model, duration, evidence);
  if (config.providerType === "apiyi") {
    // Provider-owned official image-to-video docs, checked 2026-11-04:
    // https://docs.apiyi.com/api-capabilities/veo-3-1-official/image-to-video
    // This is billed per completed task, not per second or per resolution.
    const price = APIYI_PUBLIC_VIDEO_PRICES[model];
    const unitPrice = price?.perResolution ? price.perResolution[selectedResolution] : price?.unitPrice;
    return !price || !unitPrice ? base : {
      ...base, status: "reference", billingUnit: price.billingUnit, unitPrice,
      perSecond: price.billingUnit === "second" ? unitPrice : undefined,
      estimatedTotal: fixed(price.billingUnit === "second" ? unitPrice * duration : unitPrice),
      sourceAt: "2026-11-04T00:00:00+08:00",
      note: `API易公开${price.billingUnit === "second" ? "每秒" : "每次"}单价，未核实当前账号折扣；实际以供应商结算为准。`,
    };
  }
  if (config.providerType === "relayrouter") {
    const cost = relayrouterVideoCreditCost(model, selectedResolution, duration);
    if (!cost) return base;
    // Verified public Vidu-1 group: base $0.0014706 * ratio 0.6 * 3.125 / credit.
    // Account group and Q2 first-second billing are not inferred from a card's minimum.
    const usdPerCredit = 0.0014706 * 0.6 * 3.125;
    const total = cost.credits * usdPerCredit;
    return {
      ...base, status: "reference", billingUnit: cost.perSecondCredits ? "second" : "task",
      unitPrice: fixed(cost.perSecondCredits ? cost.perSecondCredits * usdPerCredit : total),
      perSecond: cost.perSecondCredits ? fixed(cost.perSecondCredits * usdPerCredit) : undefined,
      averagePerSecond: fixed(total / duration), estimatedTotal: fixed(total), sourceAt: "2026-11-05T00:00:00+08:00",
      note: cost.firstSecondCredits
        ? "按最低公开分组的首秒与续秒规则计算总价，秒价为本段平均参考；未核实当前账号分组，实际以供应商结算为准。"
        : "按最低公开分组计算每秒参考价，未核实当前账号分组；实际以供应商结算为准。",
    };
  }
  if (config.providerType !== "aihubmix") return base;
  if (evidence.pricing === undefined) {
    const rate = AIHUBMIX_PUBLIC_VIDEO_RATES[model]?.[selectedResolution];
    return !rate ? base : {
      ...base, status: "reference", billingUnit: "second", unitPrice: rate, perSecond: rate,
      estimatedTotal: fixed(rate * duration), sourceAt: "2026-11-04T00:00:00+08:00",
      note: "AIHubMix 当前价格暂时无法读取，显示最近核对的每秒标价；实际以供应商结算为准。",
    };
  }
  const catalog = record(evidence.pricing);
  const entries = Array.isArray(catalog?.data) ? catalog.data.map(record) : [];
  const matches = entries.filter((entry) => entry?.model_id === model);
  if (matches.length !== 1) return base;
  const entry = matches[0]!;
  if (entry.retire_stage && entry.retire_stage !== "active") return base;
  if (entry.billing_expr || entry.billing_usage_schema || entry.billing_mode === "tiered_expr") return base;
  const lines = Array.isArray(entry.pricing_lines) ? entry.pricing_lines.map(record) : [];
  const sizes = model.startsWith("wan3.0-") ? [`${selectedResolution}p`]
    : selectedResolution === 1080 ? ["1920x1080", "1080x1920"] : selectedResolution === 480 ? ["832x480", "480x832"] : ["1280x720", "720x1280"];
  const perOrientation = sizes.map((size) => lines.filter((line) => {
    const variant = record(line?.variant);
    return line?.billable === "generate" && line.unit === "second" && variant?.quality === "standard" && variant.size === size;
  }));
  // Quotes have a resolution but no orientation argument. Require one explicit,
  // identical rate for both offered orientations, rather than picking a minimum.
  if (perOrientation.some((items) => items.length !== 1)) return base;
  const rates = perOrientation.map((items) => positive(items[0]?.cost_usd));
  const perSecond = rates[0];
  if (!perSecond || rates.some((rate) => rate !== perSecond)) return base;
  return {
    ...base, status: "reference", billingUnit: "second", unitPrice: perSecond, perSecond,
    estimatedTotal: fixed(perSecond * duration), sourceAt: evidence.fetchedAt,
    note: "AIHubMix 公开每秒单价，未核实当前账号折扣；实际以供应商结算为准。",
  };
}

export async function getVideoPriceQuote(model: string, duration: number, providerId?: string, resolution?: number): Promise<VideoPriceQuote> {
  const config = assertActiveVideoConnection(providerId);
  const evidence = await currentEvidence(config, resolution);
  const quote = quoteProviderPrice(config, model, duration, resolution, evidence);
  return presentYuanQuote(config, quote, evidence);
}

async function presentYuanQuote(config: VideoConnection, quote: VideoPriceQuote, evidence: PriceEvidence, fx?: VideoExchangeRate): Promise<VideoPriceQuote> {
  const supplierStatus = record(record(evidence.status)?.data);
  const usd = config.providerType !== "geekai" || quote.status !== "reference" && supplierStatus?.quota_display_type === "USD";
  return videoQuoteInYuan(quote, usd ? "USD" : "CNY", usd ? fx || await videoUsdCnyRate() : undefined);
}

export async function getVideoPriceQuotes(duration: number, providerId?: string, resolution?: number): Promise<Record<string, VideoPriceQuote>> {
  const config = assertActiveVideoConnection(providerId);
  const models = videoProviderModelIds(config.providerType).filter((model) => videoModelDurations(model, config.providerType).includes(duration)
    && (resolution === undefined || videoModelResolutions(model, config.providerType).includes(resolution)));
  if (models.length === 0) return {};
  const evidence = await currentEvidence(config, resolution);
  const fx = config.providerType === "geekai" ? undefined : await videoUsdCnyRate();
  return Object.fromEntries(await Promise.all(models.map(async (model) => [model, await presentYuanQuote(config, quoteProviderPrice(config, model, duration, resolution, evidence), evidence, fx)])));
}

/** Keep all three recommendations visible even when they have different resolution tiers. */
export async function getRecommendedVideoPriceQuotes(duration: number, providerId: string, requestedResolution?: number): Promise<Record<string, VideoPriceQuote>> {
  const config = assertActiveVideoConnection(providerId);
  const models = recommendedVideoModelIds(config.providerType);
  const [evidence, fx] = await Promise.all([currentEvidence(config, requestedResolution), config.providerType === "geekai" ? Promise.resolve(undefined) : videoUsdCnyRate()]);
  return Object.fromEntries(await Promise.all(models.map(async (model) => {
    const resolutions = videoModelResolutions(model, config.providerType);
    const resolution = requestedResolution && resolutions.includes(requestedResolution) ? requestedResolution : Math.min(...resolutions);
    const quote = quoteProviderPrice(config, model, duration, resolution, evidence);
    return [model, await presentYuanQuote(config, quote, evidence, fx)];
  })));
}
