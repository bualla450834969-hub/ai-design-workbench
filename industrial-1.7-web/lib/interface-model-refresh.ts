export const INTERFACE_MODEL_REFRESH_KEY = "idai:refresh-models-after-interface-recovery";
const REFRESH_REQUEST_MAX_AGE_MS = 60_000;

type RefreshStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function queueInterfaceModelRefresh(storage: RefreshStorage, now = Date.now()) {
  storage.setItem(INTERFACE_MODEL_REFRESH_KEY, String(now));
}

export function cancelInterfaceModelRefresh(storage: RefreshStorage) {
  storage.removeItem(INTERFACE_MODEL_REFRESH_KEY);
}

export function takeInterfaceModelRefresh(storage: RefreshStorage, now = Date.now()) {
  const requestedAt = Number(storage.getItem(INTERFACE_MODEL_REFRESH_KEY));
  storage.removeItem(INTERFACE_MODEL_REFRESH_KEY);
  return requestedAt > 0 && now >= requestedAt && now - requestedAt <= REFRESH_REQUEST_MAX_AGE_MS;
}

type ModelConnections = {
  listProviders: () => Promise<DesktopProvider[]>;
  loadProviderModels: (provider: DesktopProviderDraft) => Promise<string[]>;
};

export async function refreshActiveProviderModelCatalog(connections: ModelConnections) {
  const active = (await connections.listProviders()).find((provider) => provider.enabled && provider.hasApiKey);
  if (!active) return { status: "unconfigured" as const };

  // The existing provider endpoint persists the catalog for a saved connection.
  // It does not test or charge for text/image generation.
  const draft: DesktopProviderDraft = {
    id: active.id, name: active.name, type: active.type, baseUrl: active.baseUrl,
    textModel: active.textModel, imageModel: active.imageModel, workspaceId: active.workspaceId,
    modelCatalog: active.modelCatalog, modelVerifications: active.modelVerifications, enabled: active.enabled,
  };
  const models = await connections.loadProviderModels(draft);
  if (!models.length) throw new Error("供应商没有返回模型列表");

  const current = (await connections.listProviders()).find((provider) => provider.id === active.id && provider.enabled);
  if (!current || current.type !== active.type || current.baseUrl !== active.baseUrl || current.keyHint !== active.keyHint || JSON.stringify(current.modelCatalog) !== JSON.stringify(models)) return { status: "changed" as const };
  return { status: "refreshed" as const, count: current.modelCatalog.length, provider: current, name: current.name };
}
