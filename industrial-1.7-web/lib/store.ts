import type { AgentId, Asset, GenerationJob, GenerationResult, Message, Project, ProjectCanvas, RecycledProject, UserSession } from "@/types/domain";
import { dataPath } from "@/lib/data-path";
import { cleanProjectFolderName, isSafeProjectFolderName, migrateLegacyProjectAssetFolders, migrateReservedProjectDirectory, moveProjectDirectory, projectDirectory, projectFilesRoot, PROJECT_RECYCLE_FOLDER, recycleProjectDirectory } from "@/lib/project-files";
import { assetFilePath, legacyAssetFilePath, legacyProjectAssetFilePath } from "@/lib/services/local-asset-files";
import fs from "node:fs";
import path from "node:path";
import { assertNoDesktopMaintenance } from "@/lib/services/desktop-maintenance";
import { assertWebDatabaseHealthy, isWebMode, loadWebStore, saveWebStore } from "@/lib/web-runtime-database";
import type { WebTaskPayload, WebTaskRecord } from "@/lib/web-runtime-task-types";
import type { WebProviderSnapshot } from "@/lib/web-providers";

interface StoredProject extends Project { userId: string }
interface RecycleRecord extends RecycledProject {
  /** Durable deletion intent: a failed cleanup may be retried, never restored. */
  cleanupPending?: boolean;
  userId: string;
  project: StoredProject;
  messages: Message[];
  assets: Asset[];
  jobs: GenerationJob[];
  idempotency: Array<[string, string]>;
}

const DEFAULT_PROJECT_NAME = "我的第一个设计项目";
const DEFAULT_PROJECT_DESCRIPTION = "从需求洞察开始建立产品方向";

class DemoStore {
  users = new Map<string, UserSession>();
  usersByPhone = new Map<string, string>();
  projects = new Map<string, StoredProject>();
  messages = new Map<string, Message[]>();
  assets = new Map<string, Asset[]>();
  jobs = new Map<string, GenerationJob>();
  idempotency = new Map<string, string>();
  otp = new Map<string, { code: string; expiresAt: number }>();
  private recycleBin = new Map<string, RecycleRecord>();
  private revision = 0;
  private projectReads = new Map<string, number>();
  private pendingPersist: ReturnType<typeof setTimeout> | null = null;
  private webTasks = new Map<string, WebTaskRecord>();

  constructor() {
    // Authorization-only Web builds must never hydrate or persist project data.
    if (process.env.WEB_MODE === "true" && process.env.WEB_LOCAL_MODE === "true") return;
    if (this.hydrate()) return;
    if (process.env.DESKTOP_MODE === "true") {
      this.persist();
      return;
    }
    if (process.env.NODE_ENV === "test") {
      const adminPhone = process.env.ADMIN_PHONE || "13800000000";
      const admin: UserSession = { id: "admin-demo", phone: adminPhone, name: "设计管理员", role: "admin" };
      this.users.set(admin.id, admin);
      this.usersByPhone.set(adminPhone, admin.id);
      this.seedStudent();
    }
    this.persist();
  }

  private dataPath() { return dataPath("store.json"); }

  private applyStoredData(data: Record<string, unknown>) {
    const entries = (key: string) => {
      const value = data[key];
      if (!Array.isArray(value)) throw new Error(`本地数据缺少 ${key}`);
      return value as Array<[string, unknown]>;
    };
    this.users = new Map(entries("users") as Array<[string, UserSession]>);
    this.usersByPhone = new Map(entries("usersByPhone") as Array<[string, string]>);
    this.projects = new Map(entries("projects") as Array<[string, StoredProject]>);
    this.messages = new Map(entries("messages") as Array<[string, Message[]]>);
    this.assets = new Map(entries("assets") as Array<[string, Asset[]]>);
    this.jobs = new Map(entries("jobs") as Array<[string, GenerationJob]>);
    this.idempotency = new Map(entries("idempotency") as Array<[string, string]>);
    this.recycleBin = new Map(Array.isArray(data.recycleBin) ? data.recycleBin as Array<[string, RecycleRecord]> : []);
    this.webTasks = new Map(Array.isArray(data.webTasks) ? data.webTasks as Array<[string, WebTaskRecord]> : []);
    this.revision = Number.isSafeInteger(data.revision) ? Number(data.revision) : 0;
    if (!isWebMode()) this.loadProjectStates();
    this.synchronizeAssetReferences();
  }

  private projectStatePath(projectId: string) {
    if (!/^[a-z0-9-]+$/i.test(projectId)) throw new Error("项目编号无效");
    return dataPath("project-state", `${projectId}.json`);
  }

  private loadProjectStates() {
    for (const project of this.projects.values()) {
      const target = this.projectStatePath(project.id);
      if (!fs.existsSync(target)) continue;
      let state: { baseRevision: number; projectId: string; userId: string; workspaceState?: Project["workspaceState"]; canvas?: ProjectCanvas; updatedAt?: string };
      try { state = JSON.parse(fs.readFileSync(target, "utf8")); }
      catch {
        try { state = JSON.parse(fs.readFileSync(`${target}.bak`, "utf8")); }
        catch { throw new Error(`项目草稿文件损坏，请保留原文件并联系技术支持：${target}`); }
      }
      if (state.baseRevision !== this.revision || state.projectId !== project.id || state.userId !== project.userId) continue;
      if (state.workspaceState) project.workspaceState = state.workspaceState;
      if (state.canvas) project.canvas = state.canvas;
      if (state.updatedAt) project.updatedAt = state.updatedAt;
    }
  }

  private writeAtomicJson(target: string, value: unknown) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
      if (fs.existsSync(target)) fs.copyFileSync(target, `${target}.bak`);
      fs.renameSync(temporary, target);
    } finally { fs.rmSync(temporary, { force: true }); }
  }

  private persistProjectState(project: StoredProject) {
    if (isWebMode()) { this.persist(); return; }
    if (process.env.NODE_ENV === "test") return;
    this.writeAtomicJson(this.projectStatePath(project.id), {
      baseRevision: this.revision, projectId: project.id, userId: project.userId,
      workspaceState: project.workspaceState, canvas: project.canvas, updatedAt: project.updatedAt,
    });
  }

  private synchronizeAssetReferences(projectId?: string) {
    const projects = projectId ? [projectId] : [...this.projects.keys()];
    for (const id of projects) {
      const canonical = new Map((this.assets.get(id) ?? []).map((asset) => [asset.id, asset]));
      const reconcile = (assets: Asset[]) => assets.map((asset) => canonical.get(asset.id) ?? asset);
      for (const message of this.messages.get(id) ?? []) {
        if (message.assets) message.assets = reconcile(message.assets);
        if (message.generation?.imageAssets) message.generation.imageAssets = reconcile(message.generation.imageAssets);
      }
      for (const job of this.jobs.values()) {
        if (job.projectId !== id) continue;
        if (job.inputAssets) job.inputAssets = reconcile(job.inputAssets);
        if (job.result?.imageAssets) job.result.imageAssets = reconcile(job.result.imageAssets);
      }
    }
  }

  private hydrate() {
    if (isWebMode()) {
      const data = loadWebStore();
      if (data) {
        this.applyStoredData(data);
        let changed = false;
        for (const job of this.jobs.values()) {
          const task = this.webTasks.get(job.id);
          // A durable claim is committed before any provider call. An interrupted
          // claim is never replayed, even if the provider might have completed.
          if ((job.status === "running" || job.status === "queued") && (task?.state !== "queued" || job.status === "running")) {
            job.status = "failed";
            job.progress = 100;
            job.error = "服务器重启中断了已开始的任务。为避免重复计费，未自动重试；请核对已有结果后手动重新提交。";
            job.stageLabel = job.error;
            job.recoveryAvailable = true;
            job.updatedAt = new Date().toISOString();
            if (task) { task.state = "done"; task.completedAt = job.updatedAt; }
            changed = true;
          }
        }
        if (this.ensureProjectFolders()) changed = true;
        if (changed) this.persist();
      }
      // An existing empty Web database must not seed demo accounts or read the
      // desktop JSON. Persist its empty revision once and keep namespaces apart.
      if (!data) this.persist();
      return true;
    }
    if (process.env.NODE_ENV === "test") return false;
    const target = this.dataPath();
    if (!fs.existsSync(target)) return false;
    let restoredFromBackup = false;
    try {
      this.applyStoredData(JSON.parse(fs.readFileSync(target, "utf8")) as Record<string, unknown>);
    } catch (primaryError) {
      const backup = `${target}.bak`;
      try {
        this.applyStoredData(JSON.parse(fs.readFileSync(backup, "utf8")) as Record<string, unknown>);
        fs.copyFileSync(backup, target);
        restoredFromBackup = true;
      } catch {
        const detail = primaryError instanceof Error ? primaryError.message : String(primaryError);
        throw new Error(`本地项目索引损坏，软件已停止写入以保护原始数据。请保留 ${target} 并联系技术支持恢复。原因：${detail}`);
      }
    }
    try {
      let recoveredJobs = false;
      for (const job of this.jobs.values()) {
        if (job.status === "queued" || job.status === "running") {
          recoveredJobs = true;
          job.status = "failed";
          job.progress = 100;
          job.error = "上一次生成因软件关闭而中断，可使用原参数重新生成。";
          job.stageLabel = job.error;
          job.recoveryAvailable = true;
          job.updatedAt = new Date().toISOString();
        }
      }
      const changedFolders = this.ensureProjectFolders();
      if (restoredFromBackup || changedFolders || recoveredJobs) this.persist();
      return this.users.size > 0;
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private persist() {
    if (isWebMode()) {
      this.pruneJobHistory();
      const nextRevision = this.revision + 1;
      saveWebStore({
        revision: nextRevision,
        users: [...this.users], usersByPhone: [...this.usersByPhone], projects: [...this.projects], messages: [...this.messages],
        assets: [...this.assets], jobs: [...this.jobs], idempotency: [...this.idempotency], recycleBin: [...this.recycleBin], webTasks: [...this.webTasks],
      }, this.revision);
      this.revision = nextRevision;
      return;
    }
    if (process.env.NODE_ENV === "test") return;
    this.pruneJobHistory();
    const target = this.dataPath();
    const nextRevision = this.revision + 1;
    this.writeAtomicJson(target, {
      revision: nextRevision,
      users: [...this.users], usersByPhone: [...this.usersByPhone], projects: [...this.projects], messages: [...this.messages],
      assets: [...this.assets], jobs: [...this.jobs], idempotency: [...this.idempotency], recycleBin: [...this.recycleBin],
    });
    this.revision = nextRevision;
    // The full snapshot now contains these drafts. Revision checks make leftover
    // files harmless even if a crash interrupts this optional cleanup.
    for (const project of this.projects.values()) {
      for (const filename of [this.projectStatePath(project.id), `${this.projectStatePath(project.id)}.bak`]) {
        try { fs.rmSync(filename, { force: true }); } catch { /* retry on next full commit */ }
      }
    }
  }

  private pruneJobHistory() {
    const terminal = [...this.jobs.values()]
      .filter((job) => ["succeeded", "failed", "cancelled"].includes(job.status))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const keep = new Set(terminal.slice(0, 300).map((job) => job.id));
    for (const job of terminal.slice(300)) this.jobs.delete(job.id);
    for (const id of this.webTasks.keys()) if (!this.jobs.has(id)) this.webTasks.delete(id);
    for (const [key, jobId] of this.idempotency) {
      if (!this.jobs.has(jobId) && !keep.has(jobId)) this.idempotency.delete(key);
    }
  }

  private persistSoon() {
    if (isWebMode()) { this.persist(); return; }
    if (process.env.NODE_ENV === "test" || this.pendingPersist) return;
    this.pendingPersist = setTimeout(() => {
      this.pendingPersist = null;
      this.persist();
    }, 1200);
  }

  private seedStudent() {
    const user: UserSession = { id: "student-demo", phone: "13900000000", name: "体验同学", role: "student" };
    this.users.set(user.id, user);
    this.usersByPhone.set(user.phone, user.id);
    const project: StoredProject = {
      id: "project-demo",
      userId: user.id,
      name: "桌面智能音响",
      folderName: "桌面智能音响",
      description: "面向年轻租房用户的亲和型桌面音响概念",
      updatedAt: new Date().toISOString(),
      activeAgentId: "appearance-variants",
    };
    this.projects.set(project.id, project);
    this.messages.set(project.id, [{
      id: "welcome-demo",
      projectId: project.id,
      role: "assistant",
      agentId: "appearance-variants",
      content: "项目资料已经准备好了。可以先批量生成外观方案，再选中满意结果继续改款、局部精修、做场景图或生成多角度。",
      createdAt: new Date().toISOString(),
    }]);
    this.assets.set(project.id, []);
  }

  loginDesktop(userName: string) {
    const cleanName = userName.trim().replace(/\s+/g, " ").slice(0, 24) || "本机用户";
    const id = "desktop-local-user";
    const phone = "desktop-local";
    const existing = this.users.get(id);
    const user: UserSession = existing
      ? { ...existing, name: cleanName, phone, role: "student" }
      : { id, phone, name: cleanName, role: "student" };
    this.users.set(id, user);
    this.usersByPhone.set(phone, id);
    this.persist();
    return this.users.get(id)!;
  }

  /** Web authentication owns password hashes; the project store retains only the
   * public session identity. Both names support the isolated Web auth adapter. */
  upsertUser(user: UserSession) {
    if (!isWebMode()) throw new Error("Web 账号同步仅在 WEB_MODE 启用");
    if (!user.id || !user.phone.startsWith("web:")) throw new Error("Web 账号格式无效");
    const existing = this.users.get(user.id);
    const publicUser: UserSession = { id: user.id, phone: user.phone, name: user.name, role: user.role };
    if (existing && JSON.stringify(existing) === JSON.stringify(publicUser)) return existing;
    this.users.set(user.id, publicUser);
    this.usersByPhone.set(user.phone, user.id);
    this.persist();
    return publicUser;
  }

  upsertWebUser(user: UserSession) { return this.upsertUser(user); }

  updateUserName(userId: string, name: string) {
    const user = this.users.get(userId);
    if (!user) throw new Error("用户不存在");
    const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!cleanName) throw new Error("用户名不能为空");
    user.name = cleanName;
    this.persist();
    return user;
  }

  requestOtp(phone: string) {
    const code = process.env.DEMO_OTP || "246810";
    this.otp.set(phone, { code, expiresAt: Date.now() + 5 * 60_000 });
    return code;
  }

  verifyOtp(phone: string, code: string) {
    if (process.env.DEMO_MODE !== "false" && code === (process.env.DEMO_OTP || "246810")) return true;
    const record = this.otp.get(phone);
    return Boolean(record && record.code === code && record.expiresAt > Date.now());
  }

  login(phone: string) {
    const existingId = this.usersByPhone.get(phone);
    if (existingId) return this.users.get(existingId)!;
    const user: UserSession = { id: crypto.randomUUID(), phone, name: `同学 ${phone.slice(-4)}`, role: "student" };
    this.users.set(user.id, user);
    this.usersByPhone.set(phone, user.id);
    this.persist();
    return user;
  }

  listProjects(userId: string) {
    return [...this.projects.values()].filter((project) => project.userId === userId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private allocateProjectFolder(name: string, excludeProjectId = "") {
    const base = cleanProjectFolderName(name);
    const current = excludeProjectId ? this.projects.get(excludeProjectId) : undefined;
    if (current?.folderName === base) return base;
    const used = new Set(
      [...this.projects.values()]
        .filter((project) => project.id !== excludeProjectId && project.folderName)
        .map((project) => project.folderName!.toLowerCase()),
    );
    let candidate = base;
    let index = 2;
    while (used.has(candidate.toLowerCase()) || fs.existsSync(projectDirectory(candidate))) {
      const suffix = ` (${index})`;
      candidate = `${base.slice(0, Math.max(1, 48 - suffix.length)).trim()}${suffix}`;
      index += 1;
    }
    return candidate;
  }

  private ensureProjectFolders() {
    let changed = false;
    const assigned = new Set<string>();
    for (const project of this.projects.values()) {
      let folderName = project.folderName;
      if (!folderName || !isSafeProjectFolderName(folderName) || assigned.has(folderName.toLowerCase())) {
        const previousFolder = folderName;
        folderName = this.allocateProjectFolder(project.name, project.id);
        const legacyDirectory = dataPath("projects", project.id);
        const nextDirectory = projectDirectory(folderName);
        fs.mkdirSync(path.dirname(nextDirectory), { recursive: true });
        if (previousFolder && migrateReservedProjectDirectory(previousFolder, folderName)) {
          // Reserved-name migration leaves older result archives in their own root.
        } else if (fs.existsSync(legacyDirectory) && legacyDirectory.toLowerCase() !== nextDirectory.toLowerCase() && !fs.existsSync(nextDirectory)) {
          fs.renameSync(legacyDirectory, nextDirectory);
        } else if (!fs.existsSync(nextDirectory)) {
          fs.mkdirSync(nextDirectory, { recursive: true });
        }
        project.folderName = folderName;
        changed = true;
      }
      assigned.add(folderName.toLowerCase());
      if (migrateLegacyProjectAssetFolders(folderName)) changed = true;
      for (const asset of this.assets.get(project.id) ?? []) {
        if (asset.projectFolder !== folderName) {
          asset.projectFolder = folderName;
          changed = true;
        }
      }
    }
    return changed;
  }

  createProject(userId: string, name: string, description = "") {
    assertNoDesktopMaintenance();
    const cleanName = name.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!cleanName) throw new Error("项目名称不能为空");
    const folderName = this.allocateProjectFolder(cleanName);
    const project: StoredProject = { id: crypto.randomUUID(), userId, name: cleanName, folderName, description, updatedAt: new Date().toISOString(), activeAgentId: "appearance-variants" };
    fs.mkdirSync(projectDirectory(folderName), { recursive: true });
    this.projects.set(project.id, project);
    this.messages.set(project.id, []);
    this.assets.set(project.id, []);
    this.persist();
    return project;
  }

  restoreDefaultProject(userId: string) {
    const existing = this.listProjects(userId).find((project) => project.name === DEFAULT_PROJECT_NAME);
    if (existing) return existing;
    return this.createProject(userId, DEFAULT_PROJECT_NAME, DEFAULT_PROJECT_DESCRIPTION);
  }

  updateProject(userId: string, projectId: string, update: { name?: string; description?: string; canvas?: ProjectCanvas; workspaceState?: Project["workspaceState"] }) {
    assertNoDesktopMaintenance();
    const project = this.assertProject(userId, projectId);
    const previousState = { workspaceState: project.workspaceState, canvas: project.canvas, updatedAt: project.updatedAt };
    if (update.name !== undefined) {
      if (this.projectReads.get(projectId)) throw new Error("项目正在导出，请等待导出完成后再重命名");
      const name = update.name.trim().replace(/\s+/g, " ").slice(0, 60);
      if (!name) throw new Error("项目名称不能为空");
      const currentFolder = project.folderName || project.id;
      const nextFolder = this.allocateProjectFolder(name, project.id);
      if (currentFolder !== nextFolder) {
        moveProjectDirectory(currentFolder, nextFolder);
        project.folderName = nextFolder;
        for (const asset of this.assets.get(project.id) ?? []) asset.projectFolder = nextFolder;
      }
      project.name = name;
    }
    if (update.description !== undefined) project.description = update.description.trim().slice(0, 300);
    if (update.canvas !== undefined) project.canvas = update.canvas;
    if (update.workspaceState !== undefined) project.workspaceState = { ...project.workspaceState, ...update.workspaceState };
    project.updatedAt = new Date().toISOString();
    this.synchronizeAssetReferences(projectId);
    if (update.name === undefined && update.description === undefined) {
      try { this.persistProjectState(project); }
      catch (error) { Object.assign(project, previousState); throw error; }
    } else this.persist();
    return project;
  }

  assertProject(userId: string, projectId: string) {
    const project = this.projects.get(projectId);
    if (!project || project.userId !== userId) throw new Error("项目不存在或无权访问");
    return project;
  }

  deleteProject(userId: string, projectId: string) {
    assertNoDesktopMaintenance();
    const project = this.assertProject(userId, projectId);
    if (!/^[a-z0-9-]+$/i.test(projectId)) throw new Error("项目编号无效");
    if (this.projectReads.get(projectId)) throw new Error("项目正在导出，请等待导出完成后再移入回收站");
    if ([...this.jobs.values()].some((job) => job.projectId === projectId && ["queued", "running"].includes(job.status))) throw new Error("项目仍有生成任务，请先停止或等待任务完成再移入回收站");
    // A complete recycle entry must carry images which older versions kept in
    // shared data/uploads or data/projects/<id>, as well as current project files.
    for (const asset of this.assets.get(projectId) ?? []) {
      const target = assetFilePath(asset);
      if (fs.existsSync(target)) continue;
      const legacy = [legacyProjectAssetFilePath(asset), legacyAssetFilePath(asset)].find((file) => fs.existsSync(file));
      if (legacy) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(legacy, target, fs.constants.COPYFILE_EXCL); }
    }
    const jobIds = new Set([...this.jobs.values()].filter((job) => job.projectId === projectId).map((job) => job.id));
    const record: RecycleRecord = structuredClone({
      id: crypto.randomUUID(), projectId, name: project.name, deletedAt: new Date().toISOString(), userId,
      assetCount: (this.assets.get(projectId) ?? []).length,
      resultCount: (this.assets.get(projectId) ?? []).filter((asset) => asset.origin === "generated" || asset.role === "result").length,
      project, messages: this.messages.get(projectId) ?? [], assets: this.assets.get(projectId) ?? [],
      jobs: [...this.jobs.values()].filter((job) => job.projectId === projectId),
      idempotency: [...this.idempotency].filter(([, jobId]) => jobIds.has(jobId)),
    });
    const source = projectDirectory(project.folderName || projectId);
    const recycled = path.join(recycleProjectDirectory(record.id), "project");
    fs.mkdirSync(path.dirname(recycled), { recursive: true });
    const moved = fs.existsSync(source);
    if (moved) fs.renameSync(source, recycled);
    this.recycleBin.set(record.id, record);
    this.projects.delete(projectId);
    this.messages.delete(projectId);
    this.assets.delete(projectId);
    for (const id of jobIds) this.jobs.delete(id);
    for (const [key, jobId] of this.idempotency) if (jobIds.has(jobId)) this.idempotency.delete(key);
    try { this.persist(); }
    catch (error) {
      this.restoreRecordMaps(record);
      this.recycleBin.delete(record.id);
      if (moved) fs.renameSync(recycled, source);
      throw error;
    }
    return project;
  }

  acquireProjectRead(userId: string, projectId: string) {
    this.assertProject(userId, projectId);
    this.projectReads.set(projectId, (this.projectReads.get(projectId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (this.projectReads.get(projectId) ?? 1) - 1;
      if (remaining > 0) this.projectReads.set(projectId, remaining); else this.projectReads.delete(projectId);
    };
  }

  private restoreRecordMaps(record: RecycleRecord) {
    this.projects.set(record.projectId, record.project);
    this.messages.set(record.projectId, record.messages);
    this.assets.set(record.projectId, record.assets);
    for (const job of record.jobs) this.jobs.set(job.id, job);
    for (const [key, id] of record.idempotency) this.idempotency.set(key, id);
  }

  listRecycledProjects(userId: string): RecycledProject[] {
    return [...this.recycleBin.values()].filter((record) => record.userId === userId)
      .sort((left, right) => right.deletedAt.localeCompare(left.deletedAt))
      .map(({ id, projectId, name, deletedAt, assetCount, resultCount }) => ({ id, projectId, name, deletedAt, assetCount, resultCount }));
  }

  recycleBinInfo(userId: string) {
    const bytes = (target: string): number => {
      if (!fs.existsSync(target)) return 0;
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) return 0;
      if (stat.isFile()) return stat.size;
      if (!stat.isDirectory()) return 0;
      return fs.readdirSync(target).reduce((total, child) => total + bytes(path.join(target, child)), 0);
    };
    const items = this.listRecycledProjects(userId).map((item) => ({
      ...item, byteSize: bytes(recycleProjectDirectory(item.id)),
      cleanupPending: this.recycleBin.get(item.id)?.cleanupPending === true,
    }));
    return { items, storage: {
      kind: process.env.DESKTOP_MODE === "true" ? "desktop" as const : "server" as const,
      directory: process.env.DESKTOP_MODE === "true" ? path.join(projectFilesRoot(), PROJECT_RECYCLE_FOLDER) : undefined,
      byteSize: items.reduce((total, item) => total + item.byteSize, 0),
    } };
  }

  restoreRecycledProject(userId: string, id: string) {
    assertNoDesktopMaintenance();
    const record = this.recycleBin.get(id);
    if (!record || record.userId !== userId) throw new Error("回收项目不存在或无权访问");
    if (record.cleanupPending) throw new Error("该项目已确认永久删除，文件清理尚未完成，请重试永久删除");
    if (this.projects.has(record.projectId)) throw new Error("项目已存在，无法重复还原");
    const restored = structuredClone(record);
    const folderName = this.allocateProjectFolder(restored.project.name);
    const source = path.join(recycleProjectDirectory(id), "project");
    const target = projectDirectory(folderName);
    // A missing local image must not turn into a successful but empty recovery.
    // Supplier URLs which were never saved locally retain their existing behavior.
    for (const asset of restored.assets) {
      if (!asset.url.startsWith("/api/assets/")) continue;
      const canonical = assetFilePath({ ...asset, projectFolder: restored.project.folderName || restored.projectId });
      const originalRoot = projectDirectory(restored.project.folderName || restored.projectId);
      const candidate = path.join(source, path.relative(originalRoot, canonical));
      const exists = [candidate, legacyProjectAssetFilePath(asset), legacyAssetFilePath(asset)].some((file) => {
        try { const stat = fs.lstatSync(file); return stat.isFile() && !stat.isSymbolicLink(); } catch { return false; }
      });
      if (!exists) throw new Error("回收站中的项目图片缺失，已停止恢复。请保留现有资料并从完整备份恢复");
    }
    if (fs.existsSync(source)) fs.renameSync(source, target);
    else fs.mkdirSync(target, { recursive: true });
    restored.project.folderName = folderName;
    restored.project.updatedAt = new Date().toISOString();
    for (const asset of restored.assets) asset.projectFolder = folderName;
    this.restoreRecordMaps(restored);
    this.recycleBin.delete(id);
    this.synchronizeAssetReferences(restored.projectId);
    try { this.persist(); }
    catch (error) {
      this.projects.delete(restored.projectId); this.messages.delete(restored.projectId); this.assets.delete(restored.projectId);
      for (const job of restored.jobs) this.jobs.delete(job.id);
      for (const [key] of restored.idempotency) this.idempotency.delete(key);
      this.recycleBin.set(id, record); fs.renameSync(target, source); throw error;
    }
    try { fs.rmdirSync(recycleProjectDirectory(id)); } catch { /* Never remove unexpected files from a restored entry. */ }
    return restored.project;
  }

  permanentlyDeleteRecycledProject(userId: string, id: string) {
    assertNoDesktopMaintenance();
    const record = this.recycleBin.get(id);
    if (!record || record.userId !== userId) throw new Error("回收项目不存在或无权访问");
    // Commit deletion intent BEFORE removing any bytes. This survives a crash or
    // failed final index write, and keeps partially cleaned entries retryable.
    if (!record.cleanupPending) {
      record.cleanupPending = true;
      try { this.persist(); }
      catch (error) { delete record.cleanupPending; throw error; }
    }
    // Only an individually validated UUID child may be removed, never the root.
    fs.rmSync(recycleProjectDirectory(id), { recursive: true, force: true });
    for (const asset of record.assets) {
      const shared = [...this.assets.values(), ...[...this.recycleBin.values()].filter((item) => item.id !== id).map((item) => item.assets)]
        .some((assets) => assets.some((item) => item.id === asset.id));
      if (!shared) {
        for (const legacy of [legacyProjectAssetFilePath(asset), legacyAssetFilePath(asset)]) fs.rmSync(legacy, { force: true });
      }
    }
    this.recycleBin.delete(id);
    try { this.persist(); }
    catch (error) { this.recycleBin.set(id, record); throw error; }
    return { id };
  }

  listMessages(userId: string, projectId: string) {
    this.assertProject(userId, projectId);
    this.synchronizeAssetReferences(projectId);
    return this.messages.get(projectId) ?? [];
  }

  addMessage(userId: string, message: Message) {
    const project = this.assertProject(userId, message.projectId);
    const list = this.messages.get(message.projectId) ?? [];
    list.push(message);
    this.messages.set(message.projectId, list);
    this.synchronizeAssetReferences(message.projectId);
    project.updatedAt = new Date().toISOString();
    if (message.role === "user" && !project.description.trim()) {
      project.description = message.content.replace(/\s+/g, " ").slice(0, 58);
    }
    if (message.agentId) project.activeAgentId = message.agentId;
    this.persist();
    return message;
  }

  listAssets(userId: string, projectId: string) {
    this.assertProject(userId, projectId);
    return [...(this.assets.get(projectId) ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  findAssetByHash(userId: string, projectId: string, sha256: string, role: Asset["role"]) {
    this.assertProject(userId, projectId);
    return (this.assets.get(projectId) ?? []).find((asset) => asset.sha256 === sha256 && asset.role === role);
  }

  addAsset(userId: string, asset: Asset) {
    this.assertProject(userId, asset.projectId);
    const list = this.assets.get(asset.projectId) ?? [];
    list.push(asset);
    this.assets.set(asset.projectId, list);
    this.persist();
    return asset;
  }

  /** Update storage metadata in place: recovery must not create a second result. */
  completeAssetLocalSave(userId: string, assetId: string, saved: Pick<Asset, "url" | "type" | "size" | "sha256" | "nativeWidth" | "nativeHeight" | "exportWidth" | "exportHeight" | "upscaled" | "remoteSourceUrl">) {
    assertNoDesktopMaintenance();
    const asset = [...this.assets.values()].flat().find((item) => item.id === assetId);
    if (!asset) throw new Error("素材不存在");
    this.assertProject(userId, asset.projectId);
    const oldUrl = asset.url;
    const wasUnsaved = Boolean(asset.localSaveError || !asset.url.startsWith("/api/assets/") || asset.size === 0);
    Object.assign(asset, saved);
    delete asset.localSaveError;
    const updated = new Set<GenerationResult>();
    const updateResult = (generation?: GenerationResult) => {
      if (!generation || updated.has(generation)) return;
      if (!generation.imageAssets?.some((item) => item.id === assetId) && !generation.imageUrls.includes(oldUrl)) return;
      updated.add(generation);
      generation.imageUrls = generation.imageUrls.map((url) => url === oldUrl ? asset.url : url);
      if (generation.imageAssets) {
        generation.imageAssets = generation.imageAssets.map((item) => item.id === assetId ? asset : item);
        generation.imageUrls = generation.imageAssets.map((item) => item.url);
      }
      const previousSaved = generation.savedCount ?? Math.max(0, generation.imageUrls.filter((url) => url.startsWith("/api/assets/")).length - (wasUnsaved ? 1 : 0));
      generation.savedCount = Math.min(generation.deliveredCount ?? generation.imageUrls.length, previousSaved + (wasUnsaved ? 1 : 0));
      const remaining = Math.max(0, (generation.deliveredCount ?? generation.imageUrls.length) - generation.savedCount);
      generation.note = generation.note?.replace(/(?:其中 )?\d+ 张本地保存失败，(?:当前显示依赖供应商临时链接，请及时下载。|供应商原始结果仍可查看)/g,
        remaining ? `其中 ${remaining} 张本地保存失败，供应商原始结果仍可查看` : "").trim() || undefined;
    };
    for (const message of this.messages.get(asset.projectId) ?? []) {
      updateResult(message.generation);
      if (message.generation && updated.has(message.generation)) {
        message.content = message.content.replace(/其中 \d+ 张已保存到本机(项目文件夹)?/g, `其中 ${message.generation.savedCount} 张已保存到本机$1`);
        if (message.generation.savedCount === (message.generation.deliveredCount ?? message.generation.imageUrls.length)) {
          message.content = message.content.replace("未保存的结果依赖供应商临时链接，请及时下载并检查保存失败提示。", "");
        }
      }
    }
    for (const job of this.jobs.values()) if (job.projectId === asset.projectId) updateResult(job.result);
    this.synchronizeAssetReferences(asset.projectId);
    this.persist();
    return asset;
  }

  patchAsset(userId: string, assetId: string, patch: { role?: Asset["role"]; tags?: string[]; favorite?: boolean; note?: string; annotationData?: string }) {
    assertNoDesktopMaintenance();
    const asset = [...this.assets.values()].flat().find((item) => item.id === assetId);
    if (!asset) throw new Error("素材不存在");
    this.assertProject(userId, asset.projectId);
    if (patch.role) {
      if (asset.role === "result" && patch.role !== "structure" && patch.role !== "style") {
        throw new Error("生成结果只能设为产品原图或设计参考图");
      }
      // 把生成结果复制到素材目录，后续才按产品原图/参考图读取。
      if (asset.role === "result" && (patch.role === "structure" || patch.role === "style")) {
        const oldPath = assetFilePath(asset);
        const newPath = assetFilePath({ ...asset, role: patch.role });
        if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
          fs.mkdirSync(path.dirname(newPath), { recursive: true });
          fs.copyFileSync(oldPath, newPath);
        }
      }
      asset.role = patch.role;
    }
    if (patch.tags) asset.tags = patch.tags;
    if (patch.favorite !== undefined) asset.favorite = patch.favorite;
    if (patch.note !== undefined) asset.note = patch.note.trim().slice(0, 240);
    if (patch.annotationData !== undefined) asset.annotationData = patch.annotationData.slice(0, 200_000);
    this.synchronizeAssetReferences(asset.projectId);
    this.persist();
    return asset;
  }

  /** @deprecated use patchAsset */
  updateAssetRole(userId: string, assetId: string, role: Exclude<Asset["role"], "result">) {
    return this.patchAsset(userId, assetId, { role });
  }

  deleteAsset(userId: string, assetId: string) {
    assertNoDesktopMaintenance();
    const asset = [...this.assets.values()].flat().find((item) => item.id === assetId);
    if (!asset) throw new Error("素材不存在");
    const project = this.assertProject(userId, asset.projectId);
    if (this.projectReads.get(asset.projectId)) throw new Error("项目正在导出，请等待导出完成后再删除素材");
    const list = this.assets.get(asset.projectId) ?? [];
    const next = list.filter((item) => item.id !== assetId);
    this.assets.set(asset.projectId, next);
    const candidatePaths = new Set([
      assetFilePath(asset),
      assetFilePath({ ...asset, role: "result" }),
      assetFilePath({ ...asset, role: "structure" }),
      assetFilePath({ ...asset, role: "style" }),
    ]);
    for (const target of candidatePaths) {
      try { fs.rmSync(target, { force: true }); }
      catch { /* metadata deletion should still succeed if a stale file is locked */ }
    }
    const removeResultReference = (generation?: GenerationResult) => {
      if (!generation) return;
      const removedIndexes = new Set<number>();
      if (generation.imageAssets) {
        generation.imageAssets.forEach((item, index) => { if (item.id === assetId) removedIndexes.add(index); });
        generation.imageAssets = generation.imageAssets.filter((item) => item.id !== assetId);
        generation.imageUrls = generation.imageAssets.map((item) => item.url);
      } else {
        generation.imageUrls.forEach((url, index) => { if (url === asset.url) removedIndexes.add(index); });
        generation.imageUrls = generation.imageUrls.filter((url) => url !== asset.url);
      }
      if (generation.variants) generation.variants = generation.variants.filter((variant, index) => variant.assetId ? variant.assetId !== assetId : !removedIndexes.has(index));
      // Counts, elapsed time and billing describe the original task, not the
      // number of images the user later chooses to keep. Never rewrite them.
    };
    for (const message of this.messages.get(asset.projectId) ?? []) {
      if (message.assets) message.assets = message.assets.filter((item) => item.id !== assetId);
      removeResultReference(message.generation);
    }
    for (const job of this.jobs.values()) {
      if (job.projectId !== asset.projectId) continue;
      job.inputAssets = job.inputAssets.filter((item) => item.id !== assetId);
      removeResultReference(job.result);
    }
    if (project.workspaceState?.selectedAssets) project.workspaceState.selectedAssets = project.workspaceState.selectedAssets.filter((id) => id !== assetId);
    if (project.workspaceState?.freeChatSelectedAssets) project.workspaceState.freeChatSelectedAssets = project.workspaceState.freeChatSelectedAssets.filter((id) => id !== assetId);
    if (project.canvas) project.canvas.items = project.canvas.items.filter((item) => item.assetId !== assetId);
    this.persist();
    return asset;
  }

  createJob(input: { userId: string; projectId: string; agentId: AgentId; prompt: string; assets: Asset[]; selectedAssetIds?: string[]; idempotencyKey: string; jobId?: string; webTask?: WebTaskPayload }) {
    assertNoDesktopMaintenance();
    this.assertProject(input.userId, input.projectId);
    const key = `${input.userId}:${input.idempotencyKey}`;
    const existingId = this.idempotency.get(key);
    if (existingId) return { job: this.jobs.get(existingId)!, created: false };
    const now = new Date().toISOString();
    const job: GenerationJob = {
      id: input.jobId || crypto.randomUUID(), userId: input.userId, projectId: input.projectId, agentId: input.agentId,
      status: "queued", progress: 0, stage: "queued", stageLabel: "等待开始", prompt: input.prompt, inputAssets: input.assets,
      ...(input.selectedAssetIds ? { selectedAssetIds: [...new Set(input.selectedAssetIds)] } : {}),
      createdAt: now, updatedAt: now, idempotencyKey: input.idempotencyKey,
    };
    if (input.webTask && (!isWebMode() || input.webTask.input.jobId !== job.id || input.webTask.input.userId !== input.userId || input.webTask.input.projectId !== input.projectId)) throw new Error("Web 任务归属无效");
    if (input.webTask && (typeof input.webTask.webLicenseBindingId !== "string" || !input.webTask.webLicenseBindingId.trim())) throw Object.assign(new Error("Web 任务缺少浏览器设备授权绑定"), { status: 403 });
    this.jobs.set(job.id, job);
    this.idempotency.set(key, job.id);
    if (input.webTask) {
      this.webTasks.set(job.id, { payload: structuredClone(input.webTask), state: "queued", createdAt: now });
    }
    this.persist();
    return { job, created: true };
  }

  updateJob(jobId: string, update: Partial<GenerationJob>) {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("任务不存在");
    Object.assign(job, update, { updatedAt: new Date().toISOString() });
    if (update.status && ["succeeded", "failed", "cancelled"].includes(update.status)) {
      if (this.pendingPersist) { clearTimeout(this.pendingPersist); this.pendingPersist = null; }
      this.persist();
    } else this.persistSoon();
    return job;
  }

  getJob(userId: string, jobId: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) throw new Error("任务不存在或无权访问");
    return job;
  }

  /** Only an owned result's original durable task may authorize its download. */
  getWebProviderSnapshotForAsset(userId: string, assetId: string): WebProviderSnapshot {
    return this.getWebTaskAuthorizationForAsset(userId, assetId).provider;
  }

  getWebTaskAuthorizationForAsset(userId: string, assetId: string): { provider: WebProviderSnapshot; webLicenseBindingId: string } {
    if (!isWebMode()) throw new Error("Web 模型记录仅在 WEB_MODE 启用");
    const asset = [...this.assets.values()].flat().find((item) => item.id === assetId);
    if (!asset) throw new Error("素材不存在");
    this.assertProject(userId, asset.projectId);
    const jobIds = new Set<string>();
    for (const job of this.jobs.values()) {
      if (job.userId === userId && job.projectId === asset.projectId && job.result?.imageAssets?.some((item) => item.id === assetId)) jobIds.add(job.id);
    }
    for (const message of this.messages.get(asset.projectId) || []) {
      if (message.generation?.imageAssets?.some((item) => item.id === assetId)) jobIds.add(message.generation.jobId);
    }
    for (const jobId of jobIds) {
      const task = this.webTasks.get(jobId)?.payload;
      if (task && task.input.userId === userId && task.input.projectId === asset.projectId && task.input.jobId === jobId) {
        if (typeof task.webLicenseBindingId !== "string" || !task.webLicenseBindingId.trim()) {
          throw Object.assign(new Error("这张历史图片缺少原设备授权绑定，请上传已有图片；不会自动重新生图。"), { status: 409 });
        }
        return { provider: structuredClone(task.provider), webLicenseBindingId: task.webLicenseBindingId };
      }
    }
    throw Object.assign(new Error("这张历史图片缺少原模型连接记录，无法安全重新下载；请上传已有图片，不会重新生图。"), { status: 409 });
  }

  claimNextWebTask() {
    if (!isWebMode()) throw new Error("Web 队列仅在 WEB_MODE 启用");
    for (const [id, task] of this.webTasks) {
      const job = this.jobs.get(id);
      if (task.state !== "queued" || job?.status !== "queued") continue;
      this.assertProject(job.userId, job.projectId);
      if (task.payload.input.userId !== job.userId || task.payload.input.projectId !== job.projectId || task.payload.input.jobId !== id) throw new Error("持久任务归属校验失败");
      task.state = "started";
      task.startedAt = new Date().toISOString();
      job.status = "running";
      job.stageLabel = "后台任务已开始";
      job.updatedAt = task.startedAt;
      this.persist();
      return structuredClone(task.payload);
    }
    return null;
  }

  completeWebTask(jobId: string) {
    const task = this.webTasks.get(jobId);
    if (!task) return;
    task.state = "done";
    task.completedAt = new Date().toISOString();
    this.persist();
  }
}

declare global { var __idaiStore: DemoStore | undefined }
const instance = globalThis.__idaiStore ?? new DemoStore();
// Fail closed on reads as well as writes after the dedicated DB connection or
// commit has failed. Never silently serve an uncommitted in-memory mutation.
export const store = isWebMode() ? new Proxy(instance, {
  get(target, property) {
    assertWebDatabaseHealthy();
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  },
}) : instance;
if (process.env.NODE_ENV !== "production" || isWebMode()) globalThis.__idaiStore = instance;
