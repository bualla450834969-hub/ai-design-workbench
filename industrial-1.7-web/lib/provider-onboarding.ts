import { getUnavailableImageModelReason } from "@/lib/model-pricing";

/** Readiness comes from saved connection data, never from a dismissed guide flag. */
export function isModelProviderReady(provider: DesktopProvider | null | undefined): provider is DesktopProvider {
  if (!provider?.enabled || !provider.hasApiKey || !provider.name?.trim() || !provider.textModel?.trim() || !provider.imageModel?.trim()) return false;
  if (getUnavailableImageModelReason(provider.type, provider.imageModel)) return false;
  try {
    const url = new URL(provider.baseUrl);
    const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
    return !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && local));
  } catch { return false; }
}

export function readyModelProvider(providers: readonly DesktopProvider[]): DesktopProvider | null {
  const active = providers.find((provider) => provider.enabled);
  return isModelProviderReady(active) ? active : null;
}

/** Saving an unsaved draft or a disabled connection cannot finish first use. */
export function savedModelProvider(providers: readonly DesktopProvider[], requestedId: string): DesktopProvider {
  const saved = readyModelProvider(providers);
  if (!saved || saved.id !== requestedId) throw new Error("模型连接尚未启用，请确认 API Key、文字模型和图片模型后重新保存。");
  return saved;
}
