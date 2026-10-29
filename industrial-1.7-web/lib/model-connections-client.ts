import { fetchWithTimeout } from "@/lib/client-operations";
import { readApiJson } from "@/lib/client-response";

async function webRequest<T>(path: string, body?: unknown, method = "POST"): Promise<T> {
  return readApiJson<T>(await fetchWithTimeout(path, {
    method, cache: "no-store", ...(body !== undefined ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  }), "模型连接操作失败");
}

const browserConnections = {
  listProviders: async () => (await webRequest<{ providers: DesktopProvider[] }>("/api/web/providers", undefined, "GET")).providers,
  loadProviderModels: async (draft: DesktopProviderDraft) => (await webRequest<{ models: string[] }>("/api/web/providers/models", draft)).models,
  testTextProvider: (draft: DesktopProviderDraft) => webRequest<DesktopProviderTestResult>("/api/web/providers/test-text", draft),
  saveProvider: (draft: DesktopProviderDraft) => webRequest<DesktopProviderSaveResult>("/api/web/providers", draft),
  activateProvider: (id: string) => webRequest<DesktopProviderSaveResult>("/api/web/providers/activate", { id }),
  deleteProvider: (id: string) => webRequest<DesktopProviderSaveResult>("/api/web/providers", { id }, "DELETE"),
};

export function modelConnections() {
  return typeof window !== "undefined" && window.desktopAPI ? window.desktopAPI : browserConnections;
}

export function openExternalLink(url: string) {
  if (window.desktopAPI) return window.desktopAPI.openExternal(url);
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("仅支持打开 HTTPS 链接");
  const link = document.createElement("a");
  link.href = parsed.href; link.target = "_blank"; link.rel = "noopener noreferrer";
  link.click();
  return Promise.resolve();
}
