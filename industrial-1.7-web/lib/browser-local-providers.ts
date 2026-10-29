import { directText, fetchDirectModels, validateDirectProviderConfig, type BrowserDirectProvider } from "@/lib/browser-direct-provider";
import type { BrowserLocalProvider, BrowserWorkspaceStore } from "@/lib/browser-local-store";

const TYPES = new Set<DesktopProviderType>(["geekai", "apiyi", "aihubmix", "openai-compatible"]);
const IMAGE_MODEL = /(?:gpt[-_]?image|gemini[-_].*(?:image|imagen|nano[-_]?banana)|nano[-_]?banana|imagen[-_]?\d|seedream|flux[-_]|dall[-_]?e|grok[-_].*image)/i;
const ROOT = "/api/web/providers";
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("模型连接格式无效。");
  return value as Record<string, unknown>;
}
function field(value: unknown, label: string, max: number, optional = false) {
  if (optional && value === undefined) return "";
  if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label}格式无效。`);
  const output = value.trim();
  if (!optional && !output) throw new Error(`请填写${label}。`);
  return output;
}
function id(value: unknown) {
  const result = field(value, "模型连接编号", 80);
  if (!/^[a-zA-Z0-9-]+$/.test(result)) throw new Error("模型连接编号格式无效。");
  return result;
}
function normalizeDraft(value: unknown, requireModels: boolean): DesktopProviderDraft {
  const input = object(value);
  if (typeof input.type !== "string" || !TYPES.has(input.type as DesktopProviderType)) throw new Error("模型供应商类型无效。");
  const type = input.type as DesktopProviderType;
  if (input.enabled !== undefined && typeof input.enabled !== "boolean") throw new Error("模型启用状态格式无效。");
  if (input.modelCatalog !== undefined && (!Array.isArray(input.modelCatalog) || input.modelCatalog.length > 1000)) throw new Error("模型目录格式无效，最多保存 1000 项。");
  const modelCatalog = [...new Set((input.modelCatalog as unknown[] | undefined || []).map((model) => field(model, "模型 ID", 180)))];
  const draft: DesktopProviderDraft = {
    id: id(input.id), name: field(input.name, "供应商名称", 60), type,
    baseUrl: field(input.baseUrl, "API 地址", 500),
    textModel: field(input.textModel, "文字模型", 160, !requireModels), imageModel: field(input.imageModel, "图片模型", 160, !requireModels),
    workspaceId: field(input.workspaceId, "工作区编号", 160, true), modelCatalog,
    modelVerifications: {}, enabled: input.enabled !== false, apiKey: field(input.apiKey, "API Key", 800, true),
  };
  // Validation is pure: no supplier call, license call or server persistence.
  const target = validateDirectProviderConfig({ ...draft, apiKey: draft.apiKey || "validation-only-placeholder" });
  return { ...draft, baseUrl: target.baseUrl };
}
function publicProvider(record: BrowserLocalProvider): DesktopProvider {
  const catalog = [...new Set([...record.modelCatalog, record.imageModel])];
  return {
    id: record.id, name: record.name, type: record.type, baseUrl: record.baseUrl,
    textModel: record.textModel, imageModel: record.imageModel, workspaceId: record.workspaceId,
    modelCatalog: [...record.modelCatalog], modelVerifications: {}, enabled: record.enabled,
    hasApiKey: Boolean(record.apiKey), keyHint: "",
    imageModelStatuses: Object.fromEntries(catalog.map((model) => [model, { status: IMAGE_MODEL.test(model) ? "untested" : "incompatible", reason: IMAGE_MODEL.test(model) ? "尚未在此设备完成图片生成验证" : "模型名称不在已知图片生成兼容目录中" }])),
  };
}
function privateSnapshot(record: Pick<BrowserLocalProvider, "name" | "type" | "baseUrl" | "textModel" | "imageModel" | "apiKey">): BrowserDirectProvider {
  return validateDirectProviderConfig({ name: record.name, type: record.type, baseUrl: record.baseUrl, textModel: record.textModel, imageModel: record.imageModel, apiKey: record.apiKey });
}
function resolveDraft(draft: DesktopProviderDraft, records: BrowserLocalProvider[]): BrowserDirectProvider {
  const previous = records.find((record) => record.id === draft.id && record.type === draft.type && record.baseUrl === draft.baseUrl);
  const apiKey = draft.apiKey?.trim() || previous?.apiKey || "";
  if (!apiKey) throw new Error("请先填写 API Key；更改供应商类型或地址后必须重新填写，旧密钥不会发给新地址。");
  return privateSnapshot({ ...draft, apiKey });
}

/** Public settings never expose stored API keys, including in masked hints. */
export async function listLocalProviders(store: BrowserWorkspaceStore): Promise<DesktopProvider[]> {
  return ((await store.getState()).providers || []).map(publicProvider);
}
/** A detached key snapshot for this browser's direct transport only. */
export async function activeLocalProvider(store: BrowserWorkspaceStore): Promise<BrowserDirectProvider> {
  const active = ((await store.getState()).providers || []).find((record) => record.enabled);
  if (!active) throw new Error("请先在此设备连接模型并填写自己的 API Key。");
  if (!active.apiKey) throw new Error("此设备尚未保存模型 API Key，请重新填写；不会使用服务器或其他设备的密钥。");
  return privateSnapshot(active);
}

export async function handleLocalProviderRequest(store: BrowserWorkspaceStore, path: string, method: string, body: unknown, beforeRequest: () => Promise<void>, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) throw new DOMException("本机模型操作已取消。", "AbortError");
  if (path === ROOT && method === "GET") return { providers: await listLocalProviders(store) };
  if (path === ROOT && method === "POST") {
    const draft = normalizeDraft(body, true);
    await store.update((state) => {
      const current = state.providers || [];
      const previous = current.find((record) => record.id === draft.id);
      if (!previous && current.length >= 12) throw new Error("此设备最多保存 12 个模型连接，请先删除不需要的连接。");
      const snapshot = resolveDraft(draft, current);
      const record: BrowserLocalProvider = { ...publicProvider({ ...draft, apiKey: snapshot.apiKey, hasApiKey: true, keyHint: "", imageModelStatuses: {} }), apiKey: snapshot.apiKey };
      const others = current.filter((item) => item.id !== draft.id).map((item) => draft.enabled ? { ...item, enabled: false } : item);
      state.providers = [record, ...others];
    });
    return { providers: await listLocalProviders(store), restarting: false } satisfies DesktopProviderSaveResult;
  }
  if (path === ROOT && method === "DELETE") {
    const providerId = id(object(body).id);
    await store.update((state) => {
      const current = state.providers || [], removed = current.find((record) => record.id === providerId);
      if (!removed) throw new Error("没有找到此设备上的模型连接。");
      const remaining = current.filter((record) => record.id !== providerId);
      if (removed.enabled && remaining.length) remaining[0] = { ...remaining[0], enabled: true };
      state.providers = remaining;
    });
    return { providers: await listLocalProviders(store), restarting: false } satisfies DesktopProviderSaveResult;
  }
  if (path === `${ROOT}/activate` && method === "POST") {
    const providerId = id(object(body).id);
    await store.update((state) => {
      const current = state.providers || [];
      if (!current.some((record) => record.id === providerId)) throw new Error("没有找到此设备上的模型连接。");
      state.providers = current.map((record) => ({ ...record, enabled: record.id === providerId }));
    });
    return { providers: await listLocalProviders(store), restarting: false } satisfies DesktopProviderSaveResult;
  }
  if ((path === `${ROOT}/models` || path === `${ROOT}/test-text`) && method === "POST") {
    const draft = normalizeDraft(body, path.endsWith("/test-text"));
    const state = await store.getState();
    const provider = resolveDraft(draft, state.providers || []);
    if (path.endsWith("/models")) {
      const models = await fetchDirectModels(provider, { beforeRequest, signal });
      // A model refresh cannot replace settings edited in another tab while the
      // network request was in flight. Unsaved drafts remain unsaved.
      if ((state.providers || []).some((record) => record.id === draft.id && record.type === draft.type && record.baseUrl === draft.baseUrl && record.apiKey === provider.apiKey)) {
        await store.update((current) => {
          const record = current.providers?.find((item) => item.id === draft.id && item.type === draft.type && item.baseUrl === draft.baseUrl && item.apiKey === provider.apiKey);
          if (record) record.modelCatalog = [...models];
        }, { expectedRevision: state.revision });
      }
      return { models };
    }
    const start = Date.now();
    const output = await directText({ provider, systemPrompt: "只验证文字连接，不生成图片。", userPrompt: "只回复：连接成功", beforeRequest, signal, timeoutMs: 60_000, maxTokens: 40 });
    return { ok: true, latencyMs: Date.now() - start, message: "浏览器直连成功", model: output.model } satisfies DesktopProviderTestResult;
  }
  throw new Error("不支持此模型连接操作；不会转发到服务器。");
}
