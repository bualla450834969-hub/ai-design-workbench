import { readFileSync, statSync } from "node:fs";
import { dataPath } from "@/lib/data-path";
import type { ImageOutput, ImageProvider, ProviderContext, TextOutput, TextProvider } from "./types";
import { ProviderError } from "./types";

type GatewayTextResponse = { text?: string; provider?: string; model?: string };
type GatewayImageResponse = { imageUrls?: string[]; provider?: string; model?: string; revisedPrompt?: string };
type GatewayCredentials = { url: string; token: string };

const LICENSE_GATEWAY_FILE = "license-gateway.json";

function trimmedEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function licenseGatewayConfig(): GatewayCredentials {
  try {
    const file = dataPath(LICENSE_GATEWAY_FILE);
    if (statSync(file).size > 16 * 1024) return { url: "", token: "" };
    const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { url: "", token: "" };
    const token = typeof parsed.token === "string" ? parsed.token.trim() : "";
    const rawUrl = typeof parsed.url === "string" ? parsed.url.trim() : "";
    if (!rawUrl) return { url: "", token: safeToken(token) };
    const url = new URL(rawUrl);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return { url: "", token: safeToken(token) };
    return { url: url.toString().replace(/\/$/, ""), token: safeToken(token) };
  } catch {
    return { url: "", token: "" };
  }
}

function safeToken(token: string) {
  if (!token || token.length > 4096 || /[\u0000-\u001f\u007f]/.test(token)) return "";
  return token;
}

/** Env wins. A customer machine can instead drop url/token into the data dir. */
function gatewayCredentials(): GatewayCredentials {
  const urlFromEnv = trimmedEnv("MODEL_GATEWAY_URL").replace(/\/$/, "");
  const tokenFromEnv = safeToken(trimmedEnv("MODEL_GATEWAY_TOKEN"));
  if (urlFromEnv && tokenFromEnv) return { url: urlFromEnv, token: tokenFromEnv };
  const file = licenseGatewayConfig();
  return { url: urlFromEnv || file.url, token: tokenFromEnv || file.token };
}

async function gatewayRequest<T>(pathname: string, body: unknown, timeout: number, signal?: AbortSignal): Promise<T> {
  const { url, token } = gatewayCredentials();
  const response = await fetch(`${url}${pathname}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Client": "industrial-design-agents-desktop",
    },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    throw new ProviderError(detail || `模型网关调用失败（${response.status}）`, "model-gateway", response.status === 408 || response.status === 429 || response.status >= 500, response.status);
  }
  const content = await response.text().catch(() => "");
  if (!content.trim()) throw new ProviderError("模型网关返回了空内容", "model-gateway", true, response.status);
  try { return JSON.parse(content) as T; }
  catch { throw new ProviderError("模型网关返回的内容格式不正确", "model-gateway", true, response.status); }
}

function payload(context: ProviderContext) {
  return {
    agentId: context.agentId,
    systemPrompt: context.systemPrompt,
    userPrompt: context.userPrompt,
    settings: context.settings ?? {},
    assets: (context.assets ?? []).slice(0, 9).map((asset) => ({
      name: asset.name,
      type: asset.type,
      role: asset.role,
      dataUrl: asset.url.startsWith("data:") ? asset.url : undefined,
      url: /^https:\/\//i.test(asset.url) ? asset.url : undefined,
    })),
  };
}

export class ModelGatewayProvider implements TextProvider, ImageProvider {
  readonly name = "model-gateway";

  isConfigured() {
    if (process.env.WEB_MODE === "true" && process.env.DESKTOP_MODE !== "true") return false;
    const { url, token } = gatewayCredentials();
    return Boolean(url && token);
  }

  async generateText(context: ProviderContext): Promise<TextOutput> {
    if (!this.isConfigured()) throw new ProviderError("模型网关尚未配置", this.name, false);
    const result = await gatewayRequest<GatewayTextResponse>("/v1/generate/text", payload(context), context.settings?.task === "prompt-enhancement" ? 25_000 : 120_000, context.signal);
    if (!result.text?.trim()) throw new ProviderError("模型网关返回了空文本", this.name, true);
    return { text: result.text, provider: result.provider || this.name, model: result.model || "gateway-auto" };
  }

  async generateImages(context: ProviderContext, count: number): Promise<ImageOutput> {
    if (!this.isConfigured()) throw new ProviderError("模型网关尚未配置", this.name, false);
    const result = await gatewayRequest<GatewayImageResponse>("/v1/generate/images", { ...payload(context), count: Math.min(Math.max(Math.trunc(count || 1), 1), 100) }, 240_000, context.signal);
    const imageUrls = (result.imageUrls ?? []).filter((url) => /^https:\/\//i.test(url) || url.startsWith("data:image/"));
    if (!imageUrls.length) throw new ProviderError("模型网关返回了空图像结果", this.name, true);
    return { imageUrls, provider: result.provider || this.name, model: result.model || "gateway-auto", revisedPrompt: result.revisedPrompt };
  }
}
