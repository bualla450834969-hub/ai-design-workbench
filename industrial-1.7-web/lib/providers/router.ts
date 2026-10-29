import { GeekAiProvider, activeProviderSettings } from "./geekai";
import { ModelGatewayProvider } from "./gateway";
import { MockProvider } from "./mock";
import type { ImageOutput, ImageProvider, ProviderContext, TextOutput } from "./types";

const geekai = new GeekAiProvider();
const gateway = new ModelGatewayProvider();
const mock = new MockProvider();

function demoAllowed() {
  return process.env.ALLOW_DEMO_PROVIDER === "true" || (process.env.NODE_ENV === "test" && process.env.DESKTOP_MODE !== "true");
}

function providerFailure(kind: "文字" | "图片", errors: unknown[]): never {
  const last = errors.at(-1);
  if (last instanceof Error) throw last;
  throw new Error(errors.length
    ? `${kind}模型调用失败，请检查模型设置后重试`
    : `尚未配置可用的${kind}模型，请先打开“模型设置”完成连接`);
}

export async function generateText(context: ProviderContext): Promise<TextOutput> {
  const errors: unknown[] = [];
  if (gateway.isConfigured()) {
    try { return await gateway.generateText(context); } catch (error) { errors.push(error); console.error("Model gateway text failed", error); }
  }
  if (geekai.isConfigured()) {
    try { return await geekai.generateText(context); } catch (error) { errors.push(error); console.error("GeekAI text failed", error); }
  }
  if (demoAllowed()) return mock.generateText(context);
  return providerFailure("文字", errors);
}

export async function generateImages(context: ProviderContext, count: number): Promise<ImageOutput> {
  const providers = [gateway, geekai].filter((provider) => provider.isConfigured());
  const provider = providers[0];
  // Never fall through to a second paid image provider after a failure. A timeout
  // can occur after the first provider has already generated and billed the image.
  if (provider) return generateCompleteBatch(provider, context, count);
  if (demoAllowed()) return mock.generateImages(context, count);
  return providerFailure("图片", []);
}

export function activeImageModel() {
  if (gateway.isConfigured()) return "gateway-auto";
  if (geekai.isConfigured()) return geekai.configuredImageModel() || "provider-default";
  return "design-demo-renderer-v1";
}

export async function generateCompleteBatch(provider: ImageProvider, context: ProviderContext, count: number): Promise<ImageOutput> {
  const requested = Math.max(1, Math.min(Math.trunc(count || 1), 100));
  if (context.signal?.aborted) throw context.signal.reason || new Error("用户已取消生成");
  // A request can already be billed when its response is short or closes late.
  // Never issue an implicit fill request: all returned images belong to the user.
  const batch = await provider.generateImages({
    ...context,
    settings: { ...context.settings, batchOffset: 0, batchTotal: requested },
  }, requested);
  const imageUrls = batch.imageUrls.slice(0, requested).filter(Boolean);
  if (!imageUrls.length) throw new Error("供应商没有返回图片");
  return {
    ...batch,
    imageUrls,
    provider: batch.provider || provider.name,
    model: batch.model || "provider-default",
    variants: (batch.variants ?? []).slice(0, imageUrls.length),
  };
}

export function providerStatus() {
  return {
    mode: gateway.isConfigured() || geekai.isConfigured() ? "connected" : demoAllowed() ? "demo" : "unconfigured",
    providers: [
      { id: gateway.name, configured: gateway.isConfigured(), textModel: "自动路由", imageModel: "自动路由" },
      { id: geekai.name, configured: geekai.isConfigured(), textModel: activeProviderSettings().textModel || null, imageModel: activeProviderSettings().imageModel || null },
    ],
  };
}
