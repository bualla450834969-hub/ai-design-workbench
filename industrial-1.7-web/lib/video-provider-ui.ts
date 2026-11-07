import { isImageToVideoModel, videoModelsFromCatalog } from "@/lib/video-models";

type VideoConnection = Pick<DesktopProvider, "id" | "type" | "name" | "baseUrl" | "hasApiKey" | "keyHint">;

export function activeVideoProvider(providers: DesktopProvider[]): DesktopProvider | null {
  return providers.find((provider) => provider.enabled) || null;
}

export function videoConnectionIdentity(provider: VideoConnection | null): string {
  return provider ? JSON.stringify([provider.id, provider.type, provider.name, provider.baseUrl, provider.hasApiKey, provider.keyHint]) : "";
}

export function videoProviderDisplayName(provider: Pick<VideoConnection, "name" | "type"> | null): string {
  const names: Record<string, string> = { geekai: "GeekAI", apiyi: "API易", aihubmix: "AIHubMix", relayrouter: "RelayRouter", "openai-compatible": "当前供应商" };
  return provider?.name?.trim() || (provider ? names[provider.type] : "当前供应商") || "当前供应商";
}

/** Native video endpoints are often absent from the supplier's chat model list. */
export function providerVideoCatalog(providerType: string, verified: string[], discovered: string[]) {
  const supported = videoModelsFromCatalog(verified).filter((model) => isImageToVideoModel(model, providerType));
  const matches = videoModelsFromCatalog(discovered).filter((model) => supported.includes(model));
  return { models: supported, discovered: matches.length > 0 };
}
