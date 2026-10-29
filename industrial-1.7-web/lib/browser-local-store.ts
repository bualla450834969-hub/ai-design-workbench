import { APP_BASE_PATH } from "@/lib/app-path";
import type { Asset, GenerationJob, Message, Project } from "@/types/domain";

const DATABASE = "idai-browser-workspace";
const DATABASE_VERSION = 1;
const META = "workspaces";
const BLOBS = "asset-blobs";

export type BrowserStorageErrorCode = "UNAVAILABLE" | "QUOTA" | "BLOCKED" | "CORRUPT" | "CONFLICT" | "INVALID" | "ABORTED" | "CLOSED";
export class BrowserStorageError extends Error {
  constructor(public readonly code: BrowserStorageErrorCode, message: string, options?: ErrorOptions) { super(message, options); this.name = "BrowserStorageError"; }
}

export interface BrowserRecycledProject {
  id: string;
  deletedAt: string;
  project: Project;
  assets: Asset[];
  messages: Message[];
  jobs: GenerationJob[];
}

/** Saved only by an explicit user action. Never include providers in a project
 * backup, diagnostics or a remote request except that provider's own API call. */
export type BrowserLocalProvider = DesktopProvider & { apiKey: string };

export interface BrowserWorkspaceState {
  schemaVersion: 1;
  revision: number;
  profileName: string;
  projects: Project[];
  assets: Asset[];
  messages: Message[];
  jobs: GenerationJob[];
  recycleBin: BrowserRecycledProject[];
  providers?: BrowserLocalProvider[];
}

/** Stage Blob changes in the same transaction as the metadata mutation. */
export interface BrowserWorkspaceBlobChanges {
  putBlob(assetId: string, blob: Blob): void;
  deleteBlob(assetId: string): void;
}

export interface BrowserWorkspaceStore {
  readonly userId: string;
  readonly partition: string;
  getState(): Promise<BrowserWorkspaceState>;
  /** Mutators must be synchronous and use the latest database state. The result
   * resolves only after the metadata and all staged Blobs have committed. */
  update<T>(mutator: (draft: BrowserWorkspaceState, blobs: BrowserWorkspaceBlobChanges) => T, options?: { expectedRevision?: number }): Promise<T>;
  /** An asset must already exist; create new metadata + Blob atomically using update. */
  putBlob(assetId: string, blob: Blob): Promise<void>;
  getBlob(assetId: string, projectId?: string): Promise<Blob | undefined>;
  deleteBlob(assetId: string): Promise<void>;
  /** Only call in response to an explicit user action. Opening never requests it. */
  requestPersistence(): Promise<boolean>;
  close(): void;
}

function storageError(error: unknown): BrowserStorageError {
  if (error instanceof BrowserStorageError) return error;
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "QuotaExceededError") return new BrowserStorageError("QUOTA", "浏览器存储空间不足，本次修改未保存。请先导出备份并释放空间后重试。", { cause: error });
  if (name === "SecurityError" || name === "InvalidStateError" || name === "NotAllowedError") return new BrowserStorageError("UNAVAILABLE", "浏览器本地存储不可用。请检查站点存储权限或无痕模式后重试；数据未改存到服务器。", { cause: error });
  return new BrowserStorageError("ABORTED", "浏览器本地保存未完成，本次修改未提交。请保留当前内容后重试。", { cause: error });
}

function invalid(message: string): never { throw new BrowserStorageError("INVALID", message); }
function identifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 512) invalid(`${label}无效，未保存本次修改。`);
}
function emptyState(): BrowserWorkspaceState {
  return { schemaVersion: 1, revision: 0, profileName: "", projects: [], assets: [], messages: [], jobs: [], recycleBin: [], providers: [] };
}

function checkProviders(providers: BrowserLocalProvider[] | undefined) {
  if (providers === undefined) return;
  if (!Array.isArray(providers)) invalid("本地供应商列表格式无效。");
  const ids = new Set<string>();
  const statuses = new Set(["verified", "untested", "incompatible", "failed"]);
  const checkVerifications = (records: unknown) => {
    if (!records || typeof records !== "object" || Array.isArray(records)) invalid("本地供应商模型状态格式无效。");
    for (const value of Object.values(records)) {
      if (!value || typeof value !== "object" || !statuses.has(value.status) || (value.lastTestedAt !== undefined && typeof value.lastTestedAt !== "string") || (value.reason !== undefined && typeof value.reason !== "string")) invalid("本地供应商模型状态格式无效。");
    }
  };
  for (const provider of providers) {
    if (!provider || typeof provider !== "object") invalid("本地供应商格式无效。");
    identifier(provider.id, "供应商编号");
    if (ids.has(provider.id)) invalid("供应商编号重复，未保存本次修改。");
    ids.add(provider.id);
    if (!["geekai", "apiyi", "aihubmix", "openai-compatible"].includes(provider.type) || [provider.name, provider.baseUrl, provider.textModel, provider.imageModel, provider.workspaceId, provider.apiKey, provider.keyHint].some((value) => typeof value !== "string") || typeof provider.enabled !== "boolean" || typeof provider.hasApiKey !== "boolean" || !Array.isArray(provider.modelCatalog) || provider.modelCatalog.some((value) => typeof value !== "string")) invalid("本地供应商格式无效。");
    checkVerifications(provider.modelVerifications);
    checkVerifications(provider.imageModelStatuses);
  }
}

function stateAssets(state: BrowserWorkspaceState) { return [...state.assets, ...state.recycleBin.flatMap((record) => record.assets)]; }
function checkState(state: BrowserWorkspaceState, userId: string) {
  if (!state || state.schemaVersion !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 || typeof state.profileName !== "string") invalid("本地工作区格式无效。");
  for (const key of ["projects", "assets", "messages", "jobs", "recycleBin"] as const) if (!Array.isArray(state[key])) invalid("本地工作区列表格式无效。");
  checkProviders(state.providers);
  const projectIds = new Set<string>();
  const assetIds = new Set<string>();
  const messageIds = new Set<string>();
  const jobIds = new Set<string>();
  const add = (value: unknown, ids: Set<string>, label: string) => { identifier(value, label); if (ids.has(value)) invalid(`${label}重复，未保存本次修改。`); ids.add(value); };
  const checkProject = (project: Project) => { if (!project || typeof project.name !== "string") invalid("项目格式无效。"); add(project.id, projectIds, "项目编号"); };
  const checkAssets = (assets: Asset[], projects: Set<string>) => {
    for (const asset of assets) {
      if (!asset || !projects.has(asset.projectId) || typeof asset.name !== "string" || typeof asset.url !== "string" || typeof asset.type !== "string" || !Number.isFinite(asset.size) || asset.size < 0) invalid("素材不属于此项目或素材格式无效。");
      add(asset.id, assetIds, "素材编号");
    }
  };
  const checkEmbeddedAssets = (assets: Asset[] | undefined, projectId: string) => {
    if (assets === undefined) return;
    if (!Array.isArray(assets) || assets.some((asset) => !asset || asset.projectId !== projectId)) invalid("消息或任务包含其他项目的素材。");
  };
  const checkMessages = (messages: Message[], projects: Set<string>) => {
    for (const message of messages) {
      if (!message || !projects.has(message.projectId) || typeof message.content !== "string") invalid("消息不属于此项目或消息格式无效。");
      add(message.id, messageIds, "消息编号");
      checkEmbeddedAssets(message.assets, message.projectId);
      checkEmbeddedAssets(message.generation?.imageAssets, message.projectId);
    }
  };
  const checkJobs = (jobs: GenerationJob[], projects: Set<string>) => {
    for (const job of jobs) {
      if (!job || job.userId !== userId || !projects.has(job.projectId)) invalid("任务不属于当前用户或项目。");
      add(job.id, jobIds, "任务编号");
      checkEmbeddedAssets(job.inputAssets, job.projectId);
      checkEmbeddedAssets(job.result?.imageAssets, job.projectId);
    }
  };
  state.projects.forEach(checkProject);
  const activeProjects = new Set(projectIds);
  checkAssets(state.assets, activeProjects); checkMessages(state.messages, activeProjects); checkJobs(state.jobs, activeProjects);
  const recycleIds = new Set<string>();
  for (const record of state.recycleBin) {
    if (!record || typeof record.deletedAt !== "string" || !Array.isArray(record.assets) || !Array.isArray(record.messages) || !Array.isArray(record.jobs)) invalid("回收站记录格式无效。");
    add(record.id, recycleIds, "回收记录编号"); checkProject(record.project);
    const project = new Set([record.project.id]);
    checkAssets(record.assets, project); checkMessages(record.messages, project); checkJobs(record.jobs, project);
  }
}

function serialize(state: BrowserWorkspaceState, userId: string): string {
  checkState(state, userId);
  // Metadata is JSON, not a store for Blob/File, callbacks, class instances or
  // cyclic graphs. Optional undefined fields retain normal JSON semantics.
  const ancestors = new Set<object>();
  const visit = (value: unknown) => {
    if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number") { if (!Number.isFinite(value)) invalid("本地工作区包含无效数字。"); return; }
    if (typeof value !== "object") invalid("本地工作区只能保存 JSON 元数据。");
    if (ancestors.has(value)) invalid("本地工作区包含循环引用。");
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) invalid("图片文件必须通过 Blob 存储接口保存。");
    ancestors.add(value); Object.values(value).forEach(visit); ancestors.delete(value);
  };
  visit(state);
  return JSON.stringify(state);
}

function decode(value: unknown, userId: string): BrowserWorkspaceState {
  if (value === undefined) return emptyState();
  try {
    if (typeof value !== "string") throw new Error("Invalid metadata record");
    const state = JSON.parse(value) as BrowserWorkspaceState;
    checkState(state, userId);
    state.providers ??= [];
    return state;
  } catch (cause) { throw new BrowserStorageError("CORRUPT", "本地工作区数据无法读取。原数据已保留，请先导出备份或联系支持；不会自动清空。", { cause }); }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    let settled = false;
    const fail = (error: unknown) => { if (!settled) { settled = true; clearTimeout(timeout); reject(storageError(error)); } };
    const timeout = setTimeout(() => fail(new BrowserStorageError("UNAVAILABLE", "浏览器本地数据库打开超时，请关闭其他标签页后重试。")), 15_000);
    try {
      if (typeof indexedDB === "undefined") throw new BrowserStorageError("UNAVAILABLE", "当前浏览器未提供 IndexedDB，无法可靠保存项目。请使用允许站点存储的现代浏览器。");
      request = indexedDB.open(DATABASE, DATABASE_VERSION);
    } catch (error) { fail(error); return; }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(META)) database.createObjectStore(META);
      if (!database.objectStoreNames.contains(BLOBS)) database.createObjectStore(BLOBS);
    };
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new BrowserStorageError("BLOCKED", "其他标签页正在使用旧版本地数据库，请关闭相关标签页后重试。"));
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      settled = true; clearTimeout(timeout); resolve(request.result);
    };
  });
}

/** All state and bytes stay in this origin's IndexedDB. No network requests. */
export async function openBrowserWorkspace(userId: string): Promise<BrowserWorkspaceStore> {
  identifier(userId, "用户编号");
  const partition = JSON.stringify([APP_BASE_PATH, userId]);
  const database = await openDatabase();
  let closed = false;
  const close = () => { closed = true; database.close(); };
  database.onversionchange = close;
  const transaction = <T>(mode: IDBTransactionMode, operation: (tx: IDBTransaction, result: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> => new Promise((resolve, reject) => {
    if (closed) { reject(new BrowserStorageError("CLOSED", "本地工作区已关闭，请重新打开。")); return; }
    let tx: IDBTransaction;
    try { tx = database.transaction([META, BLOBS], mode); } catch (error) { reject(storageError(error)); return; }
    let output: T;
    let failure: unknown;
    let done = false;
    const timeout = setTimeout(() => fail(new BrowserStorageError("ABORTED", "浏览器本地保存超时，本次修改未确认完成，请保留当前内容后重试。")), 30_000);
    const fail = (error: unknown) => {
      if (done) return;
      failure = error;
      try { tx.abort(); } catch { done = true; clearTimeout(timeout); reject(storageError(error)); }
    };
    tx.oncomplete = () => { if (!done) { done = true; clearTimeout(timeout); if (failure) reject(storageError(failure)); else resolve(output); } };
    tx.onabort = () => { if (!done) { done = true; clearTimeout(timeout); reject(storageError(failure || tx.error)); } };
    // Let IndexedDB abort on request errors. Reject only after rollback has ended.
    tx.onerror = () => { failure ||= tx.error; };
    try { operation(tx, (value) => { output = value; }, fail); } catch (error) { fail(error); }
  });
  const update: BrowserWorkspaceStore["update"] = (mutator, options) => transaction("readwrite", (tx, result, fail) => {
    const meta = tx.objectStore(META);
    const request = meta.get(partition);
    request.onsuccess = () => {
      try {
        const state = decode(request.result, userId);
        const revision = state.revision;
        if (options?.expectedRevision !== undefined && options.expectedRevision !== revision) throw new BrowserStorageError("CONFLICT", "此项目已在其他标签页更新，请刷新后再保存，避免覆盖新内容。");
        const previousAssets = new Map(stateAssets(state).map((asset) => [asset.id, asset.projectId]));
        const puts = new Map<string, Blob>();
        const deletes = new Set<string>();
        let accepting = true;
        const changes: BrowserWorkspaceBlobChanges = {
          putBlob(assetId, blob) {
            if (!accepting) invalid("Blob 修改只能在同步保存回调内进行。");
            identifier(assetId, "素材编号");
            if (!(blob instanceof Blob)) invalid("素材内容必须是 Blob 或 File。");
            puts.set(assetId, blob); deletes.delete(assetId);
          },
          deleteBlob(assetId) { if (!accepting) invalid("Blob 修改只能在同步保存回调内进行。"); identifier(assetId, "素材编号"); puts.delete(assetId); deletes.add(assetId); },
        };
        let value: ReturnType<typeof mutator>;
        try { value = mutator(state, changes); } finally { accepting = false; }
        if (value && typeof value === "object" && "then" in value && typeof value.then === "function") {
          void Promise.resolve(value).catch(() => undefined);
          invalid("本地保存回调必须同步；请先完成网络或文件读取，再提交一次原子保存。");
        }
        if (!Number.isSafeInteger(revision + 1)) invalid("本地工作区版本号已超出支持范围。");
        state.revision = revision + 1;
        const json = serialize(state, userId);
        const assets = new Map(stateAssets(state).map((asset) => [asset.id, asset.projectId]));
        for (const [id, projectId] of previousAssets) {
          if (!assets.has(id)) deletes.add(id);
          else if (assets.get(id) !== projectId) invalid("不能把已有素材编号移到其他项目，请创建新的素材副本。");
        }
        for (const id of puts.keys()) if (!assets.has(id)) invalid("请在同一次保存中先建立素材元数据，再保存图片内容。");
        const blobs = tx.objectStore(BLOBS);
        meta.put(json, partition);
        for (const id of deletes) blobs.delete([partition, id]);
        for (const [id, blob] of puts) blobs.put({ projectId: assets.get(id), blob }, [partition, id]);
        result(value);
      } catch (error) { fail(error); }
    };
  });
  const store: BrowserWorkspaceStore = {
    userId, partition, close, update,
    getState: () => transaction("readonly", (tx, result, fail) => {
      const request = tx.objectStore(META).get(partition);
      request.onsuccess = () => { try { result(decode(request.result, userId)); } catch (error) { fail(error); } };
    }),
    putBlob: (assetId, blob) => update((_state, changes) => { changes.putBlob(assetId, blob); }),
    deleteBlob: (assetId) => update((_state, changes) => { changes.deleteBlob(assetId); }),
    getBlob: (assetId, projectId) => transaction("readonly", (tx, result, fail) => {
      try { identifier(assetId, "素材编号"); } catch (error) { fail(error); return; }
      const request = tx.objectStore(META).get(partition);
      request.onsuccess = () => {
        try {
          const asset = stateAssets(decode(request.result, userId)).find((item) => item.id === assetId);
          if (!asset) { result(undefined); return; }
          if (projectId !== undefined && asset.projectId !== projectId) invalid("素材不属于所请求的项目。");
          const blob = tx.objectStore(BLOBS).get([partition, assetId]);
          blob.onsuccess = () => {
            const record = blob.result as { projectId: string; blob: Blob } | undefined;
            if (record && (record.projectId !== asset.projectId || !(record.blob instanceof Blob))) { fail(new BrowserStorageError("CORRUPT", "本地图片内容与项目记录不一致，原数据已保留。")); return; }
            result(record?.blob);
          };
        } catch (error) { fail(error); }
      };
    }),
    async requestPersistence() {
      if (closed) throw new BrowserStorageError("CLOSED", "本地工作区已关闭，请重新打开。");
      if (typeof navigator === "undefined" || typeof navigator.storage?.persist !== "function") throw new BrowserStorageError("UNAVAILABLE", "当前浏览器不支持申请持久存储，请定期导出本地备份。");
      try { return await navigator.storage.persist(); } catch (error) { throw storageError(error); }
    },
  };
  // Reject inaccessible/corrupt workspaces at opening, not after the first edit.
  try { await store.getState(); } catch (error) { close(); throw error; }
  return store;
}
