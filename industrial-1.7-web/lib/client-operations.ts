import type { GenerationResult, Project, ProjectWorkspaceState } from "@/types/domain";
import { normalizeProjectWorkspaceState } from "@/lib/project-workspace-state";
import { appPath } from "@/lib/app-path";

/** Browser requests are bounded; a timeout never retries a paid operation. */
export function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = /(?:prompt-enhance|free-chat\/enhance|assets\/upload)/.test(String(input)) ? 180_000 : 45_000) {
  const controller = new AbortController();
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("请求超时，请查看任务状态后重试", "TimeoutError")), timeoutMs);
  const resolved = typeof input === "string" ? appPath(input) : input;
  const operation = process.env.NEXT_PUBLIC_WEB_LOCAL_MODE === "true" && typeof window !== "undefined" && !window.desktopAPI
    ? import("@/lib/browser-local-api").then(({ browserLocalFetch }) => browserLocalFetch(resolved, { ...init, signal: controller.signal }))
    : globalThis.fetch(resolved, { ...init, signal: controller.signal });
  return operation.finally(() => {
    clearTimeout(timer); init.signal?.removeEventListener("abort", abort);
  });
}

export type SavePhase = "saving" | "saved" | "error";
export function createLatestSaveQueue<T extends object>(write: (id: string, patch: Partial<T>) => Promise<void>, status: (id: string, phase: SavePhase) => void = () => {}) {
  const entries = new Map<string, { pending: Partial<T> | null; running: boolean; waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> }>();
  const drain = async (id: string) => {
    const entry = entries.get(id)!;
    if (entry.running) return;
    entry.running = true;
    while (entry.pending) {
      const patch = entry.pending;
      const waiters = entry.waiters.splice(0);
      entry.pending = null;
      status(id, "saving");
      try { await write(id, patch); for (const waiter of waiters) waiter.resolve(); status(id, entry.pending ? "saving" : "saved"); }
      catch (error) { for (const waiter of waiters) waiter.reject(error); status(id, "error"); }
    }
    entry.running = false;
    if (!entry.pending) entries.delete(id);
  };
  return {
    save(id: string, patch: Partial<T>): Promise<void> {
      let entry = entries.get(id);
      if (!entry) { entry = { pending: null, running: false, waiters: [] }; entries.set(id, entry); }
      entry.pending = { ...(entry.pending || {}), ...patch };
      const result = new Promise<void>((resolve, reject) => entry!.waiters.push({ resolve, reject }));
      void drain(id);
      return result;
    },
  };
}

export function sameProviderRequest(left: { id: string; type: string; baseUrl: string; apiKey?: string }, right: { id: string; type: string; baseUrl: string; apiKey?: string }) {
  return left.id === right.id && left.type === right.type && left.baseUrl === right.baseUrl && left.apiKey === right.apiKey;
}

/** Only an existing project's missing draft is empty; failed/malformed reads must not enable autosave. */
export function resolveProjectDraft(data: { project?: Pick<Project, "id" | "workspaceState"> }, expectedProjectId: string): ProjectWorkspaceState | null {
  if (!data.project || data.project.id !== expectedProjectId) throw new Error("项目状态读取不完整，当前草稿保持不变，请重新读取。");
  const state = data.project.workspaceState;
  if (state === undefined || state === null) return null;
  if (typeof state !== "object" || Array.isArray(state)) throw new Error("项目草稿格式异常，当前草稿保持不变，请重新读取。");
  return state;
}

/** Delayed reads cannot update another project or supersede a newer request. */
export function isCurrentProjectRequest(targetProjectId: string, activeProjectId: string, requestId?: number, latestRequestId?: number) {
  return targetProjectId === activeProjectId && (requestId === undefined || latestRequestId === undefined || requestId === latestRequestId);
}

/** Finish the newest edit made while a previous save was awaiting the service. */
export async function flushLatestSnapshot<T extends object>(readLatest: () => T | null, write: (snapshot: T) => Promise<void>) {
  while (true) {
    const latest = readLatest();
    if (!latest) return;
    const snapshot = structuredClone(latest);
    await write(snapshot);
    const afterSave = readLatest();
    if (!afterSave || JSON.stringify(afterSave) === JSON.stringify(snapshot)) return;
  }
}

export function parameterStateFromRequest(current: ProjectWorkspaceState, request: NonNullable<GenerationResult["requestSnapshot"]>, selectedAssets: string[]) {
  const settings = request.settings || {};
  const local = request.agentId === "local-retouch" || settings.generationMode === "local";
  const workflowKind = (local ? ["shape", "cmf", "decal"] : ["shape", "view", "cmf", "decal", "scene", "packaging", "detail"]).includes(String(settings.workflowKind)) ? settings.workflowKind as NonNullable<ProjectWorkspaceState["workflowKind"]> : "shape";
  const directionKeys = { shape: "appearance-variants", view: "multi-view", cmf: "cmf-colorways", decal: "detail-view", scene: "render-studio", packaging: "appearance-variants:packaging", detail: "appearance-variants:detail" };
  const directionKey = local ? `local-retouch:${workflowKind}` : directionKeys[workflowKind];
  return normalizeProjectWorkspaceState({ ...current, workspaceMode: "parameter", selectedAssets, input: request.content,
    agentId: local ? "local-retouch" : "appearance-variants", workflowKind,
    generationMode: ["source", "reference", "text", "local"].includes(String(settings.generationMode)) ? settings.generationMode as NonNullable<ProjectWorkspaceState["generationMode"]> : current.generationMode,
    specifiedAngle: settings.designDirection === "指定角度" ? String(settings.freeChatViews || "") : "",
    showDimensions: settings.showDimensions !== false,
    outputCount: Number(settings.outputCount) || 1, boardItems: Number(settings.boardItems) || 1, reconstructionRatio: Number(settings.reconstructionRatio) || 0,
    resolution: (settings.resolution || "1K") as "1K" | "2K" | "4K", aspectRatio: (settings.aspectRatio || "auto") as NonNullable<ProjectWorkspaceState["aspectRatio"]>,
    designDirections: { ...current.designDirections, [directionKey]: String(settings.designDirection || "自动判断") },
  });
}

export async function loadDurablePresets<P>(read: () => Promise<{ presets: P[]; initialized: boolean }>, write: (presets: P[]) => Promise<{ presets: P[]; initialized: boolean }>, legacy: P[]) {
  const archive = await read();
  if (!Array.isArray(archive.presets)) throw new Error("本机预设文件格式异常，未替换当前列表。");
  // An intentionally empty saved archive must not resurrect a deleted old preset.
  if (archive.initialized || !legacy.length) return archive;
  return write(legacy);
}

export type MaintenanceSnapshot = { busy: boolean; message?: string; revision?: number };
export function newestMaintenance(current: MaintenanceSnapshot | null, incoming: MaintenanceSnapshot) {
  return current && (current.revision || 0) > (incoming.revision || 0) ? current : incoming;
}

/** Missing server records remain visible as unknown; they are never silently cancelled. */
export function reconcileTaskRecords<T extends { id: string; status: string; projectId?: string; connectionLost?: boolean }>(current: Record<string, T>, incoming: T[], projectId?: string): Record<string, T & { connectionLost?: boolean }> {
  const next: Record<string, T & { connectionLost?: boolean }> = { ...current }, known = new Set(incoming.map((job) => job.id));
  for (const job of incoming) next[job.id] = { ...current[job.id], ...job, connectionLost: false };
  for (const job of Object.values(current)) {
    if ((!projectId || job.projectId === projectId) && !known.has(job.id) && ["queued", "running"].includes(job.status)) next[job.id] = { ...job, connectionLost: true };
  }
  return next;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
