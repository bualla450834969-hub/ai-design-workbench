import type { VideoPriceQuote } from "@/lib/video-pricing-types";

export type VideoExchangeRate = { rate: number; date: string; live: boolean };
// Public ECB-derived USD/CNY reference checked on 2026-11-05. This is an
// explicit dated fallback, never an account's actual settlement exchange rate.
export const LAST_VERIFIED_USD_CNY: VideoExchangeRate = { rate: 6.6723, date: "2026-11-04", live: false };
const RATE_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=CNY";
let cached: { value: VideoExchangeRate; expires: number } | undefined;
let pending: Promise<VideoExchangeRate> | undefined;

export async function videoUsdCnyRate(): Promise<VideoExchangeRate> {
  if (cached && cached.expires > Date.now()) return cached.value;
  if (pending) return pending;
  pending = (async () => {
    let value = LAST_VERIFIED_USD_CNY;
    try {
      const response = await fetch(RATE_URL, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(3000) });
      if (response.ok && response.body && Number(response.headers.get("content-length") || 0) <= 4096) {
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            length += next.value.byteLength;
            if (length > 4096) { await reader.cancel(); throw new Error("汇率响应过大"); }
            chunks.push(next.value);
          }
        } finally { reader.releaseLock(); }
        const body = Buffer.concat(chunks).toString("utf8");
        if (body.length <= 4096) {
          const data = JSON.parse(body) as { base?: unknown; date?: unknown; rates?: { CNY?: unknown } };
          if (data.base === "USD" && typeof data.rates?.CNY === "number" && data.rates.CNY >= 1 && data.rates.CNY <= 20
            && typeof data.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.date)
            && Date.parse(data.date) <= Date.now() + 24 * 3600_000 && Date.parse(data.date) >= Date.parse(LAST_VERIFIED_USD_CNY.date)) {
            value = { rate: data.rates.CNY, date: data.date, live: true };
          }
        }
      } else { await response.body?.cancel(); }
    } catch { /* A dated public reference remains available during a network outage. */ }
    cached = { value, expires: Date.now() + (value.live ? 12 * 3600_000 : 10 * 60_000) };
    return value;
  })();
  try { return await pending; } finally { pending = undefined; }
}

/** Convert amounts as well as symbols. Keep the original supplier's billing unit. */
export function videoQuoteInYuan(quote: VideoPriceQuote, sourceCurrency: "USD" | "CNY", exchange?: VideoExchangeRate): VideoPriceQuote {
  const fx = sourceCurrency === "USD" ? exchange || LAST_VERIFIED_USD_CNY : undefined;
  const factor = fx?.rate || 1;
  const convert = (value: number | undefined) => value === undefined ? undefined : Math.round(value * factor * 1_000_000) / 1_000_000;
  const estimatedTotal = convert(quote.estimatedTotal);
  return {
    ...quote, currencySymbol: "¥", currencyCode: "CNY", sourceCurrency,
    perSecond: convert(quote.perSecond), unitPrice: convert(quote.unitPrice), estimatedTotal,
    averagePerSecond: quote.averagePerSecond !== undefined ? convert(quote.averagePerSecond)
      : quote.billingUnit === "task" && estimatedTotal !== undefined ? Math.round(estimatedTotal / quote.duration * 1_000_000) / 1_000_000 : undefined,
    lastBillTotal: convert(quote.lastBillTotal),
    ...(fx ? { fxRate: fx.rate, fxDate: fx.date } : {}),
  };
}
