export type ServerApiProvider = "aihubmix" | "302ai" | "geeknow" | "apiyi";

function envString(name: string, fallback = "") {
  return (process.env[name] || fallback).trim();
}

export function normalizeServerApiProvider(provider: string): ServerApiProvider {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "geekai" || normalized === "geeknow") return "geeknow";
  if (normalized === "apiyi" || normalized === "api易") return "apiyi";
  if (normalized === "302ai") return "302ai";
  return "aihubmix";
}

export function getServerApiKey(provider: string) {
  const normalized = normalizeServerApiProvider(provider);
  if (normalized === "geeknow") return envString("GEEKNOW_API_KEY", envString("SERVER_API_KEY"));
  if (normalized === "apiyi") return envString("APIYI_API_KEY", envString("SERVER_API_KEY"));
  return envString("AIHUBMIX_API_KEY", envString("SERVER_API_KEY"));
}

export function getServerApiProvider() {
  return normalizeServerApiProvider(envString("AI_PROVIDER", "geeknow"));
}

export function getServerManagedApiConfig() {
  const provider = getServerApiProvider();
  const apiKey = getServerApiKey(provider);
  return {
    enabled: Boolean(apiKey),
    provider,
    apiKey
  };
}

export function resolveApiKey(provider: string, userApiKey?: string) {
  return userApiKey?.trim() || getServerApiKey(provider);
}

export function hasServerApiKey(provider?: string) {
  if (provider) return Boolean(getServerApiKey(provider));
  return Boolean(envString("SERVER_API_KEY") || envString("GEEKNOW_API_KEY") || envString("AIHUBMIX_API_KEY") || envString("APIYI_API_KEY"));
}
