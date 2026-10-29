import fs from "node:fs";
import path from "node:path";
import { createRequire, stripTypeScriptTypes } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { createLatestSaveQueue, flushLatestSnapshot } from "@/lib/client-operations";
import { readApiJson } from "@/lib/client-response";
import { createProjectDeletionController } from "@/lib/project-deletion";
import { defaultProjectWorkspaceState } from "@/lib/project-workspace-state";
import { isModelProviderReady } from "@/lib/provider-onboarding";

const source = fs.readFileSync(path.resolve("components/workspace-app.tsx"), "utf8");
const parser = createRequire(import.meta.url)("next/dist/compiled/babel/bundle").parser();
const ast = parser.parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
const workspace = ast.program.body.find((node: any) => node.type === "FunctionDeclaration" && node.id.name === "WorkspaceContent");

// Exercise the actual handlers without mounting Electron, accessing disk data or calling a provider.
function handler(name: string, scope: Record<string, any>, owner = workspace) {
  let code = "";
  for (const statement of owner.body.body) {
    if (statement.type === "FunctionDeclaration" && statement.id.name === name) code = source.slice(statement.start, statement.end);
    if (statement.type === "VariableDeclaration") for (const declaration of statement.declarations) {
      if (declaration.id.name === name && declaration.init?.type === "CallExpression") {
        const callback = declaration.init.arguments[0];
        code = `const ${name} = ${source.slice(callback.start, callback.end)};`;
      }
    }
  }
  if (!code) throw new Error(`Missing workspace handler: ${name}`);
  const javascript = stripTypeScriptTypes(code);
  return new Function("scope", `with (scope) { ${javascript}; return ${name}; }`)(scope) as (...args: any[]) => Promise<void>;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(ids = ["p1", "p2", "p3"]) {
  const projects = ids.map((id) => ({ id, name: id }));
  const stored = new Map(projects.map((project) => [project.id, project]));
  const events: string[] = [];
  let deleteError = "", saveError = "";
  let saveGate: Promise<void> | null = null;
  const scope: Record<string, any> = {
    projects, projectId: ids[0] || "", projectsRef: { current: projects },
    activeProjectRef: { current: ids[0] || "" }, stateReadyRef: { current: Boolean(ids.length) },
    projectSelectionRef: { current: 0 }, requestRef: { current: 0 }, olderMessagesRequestRef: { current: 0 },
    workspaceSnapshotRef: { current: { ...defaultProjectWorkspaceState, input: "keep this draft" } },
    projectDraftsRef: { current: {} }, projectDeletionRef: { current: createProjectDeletionController() },
    retryJobsRef: { current: new Map() }, reusedRequestRef: { current: null },
    generationStartRef: { current: null }, shouldAutoScrollRef: { current: true },
    defaultProjectWorkspaceState, flushLatestSnapshot, readApiJson, isModelProviderReady,
    providerSetupPendingRef: { current: false },
    activeProvider: { id: "saved-provider", name: "Fixture model connection", type: "geekai", baseUrl: "https://geeknow.ai", textModel: "gemini-3.8-flash", imageModel: "gemini-3.1-flash-image-preview", enabled: true, hasApiKey: true },
    confirmAction: vi.fn(async () => true),
    readRestoreState: () => ({ projectId: ids[0] }), clearRestoreState: vi.fn(),
    setError: (error: string) => { scope.error = error; },
    setProjects: (next: any) => { scope.projects = typeof next === "function" ? next(scope.projects) : next; },
    setProjectId: (id: string) => { scope.projectId = id; },
    applyWorkspaceState: (state: any) => { scope.workspaceSnapshotRef.current = state || defaultProjectWorkspaceState; return scope.workspaceSnapshotRef.current; },
    loadConversation: vi.fn(async (id: string) => {
      if (!stored.has(id)) throw new Error("Project is missing");
      events.push(`load:${id}`); scope.stateReadyRef.current = true;
    }),
    fetch: vi.fn(async (_url: string, init: RequestInit = {}) => {
      const input = init.body ? JSON.parse(String(init.body)) : {};
      if (init.method === "DELETE") {
        events.push(`delete:${input.projectId}`);
        if (deleteError) return Response.json({ error: deleteError }, { status: 400 });
        stored.delete(input.projectId);
        return Response.json({ project: input.projectId });
      }
      if (init.method === "POST") {
        const project = { id: "created", name: input.name }; stored.set(project.id, project);
        return Response.json({ project });
      }
      return Response.json({ projects: [...stored.values()] });
    }),
  };
  for (const name of ["setProjectDeleting", "setProjectEdit", "setPromptUndoForProject", "setFreePromptUndoForProject", "setPersistedDrafts", "setPreparedPromptPlans", "setResultReadErrors", "setProjectJobs", "setMessages", "setAssets", "setHasOlderMessages", "setLoadingOlderMessages", "setProjectReading", "setProjectLoadError", "setDraftSaveError", "setRetryRequest", "setResultBrowserOpen", "setAssetLibraryOpen", "setPreviewAsset", "setPreviewAssets", "setLocalEditAsset", "setSidebarOpen", "setSlowJobWarning", "setCreateOpen"]) scope[name] = vi.fn();
  scope.saveQueueRef = { current: createLatestSaveQueue(async (id: string) => scope.projectDeletionRef.current.write(id, async () => {
    events.push(`save:${id}`);
    if (saveGate) { const gate = saveGate; saveGate = null; await gate; }
    if (saveError) throw new Error(saveError);
    if (!stored.has(id)) throw new Error("项目不存在或无权访问");
  })) };
  scope.saveProjectState = handler("saveProjectState", scope);
  scope.flushCurrentProjectState = handler("flushCurrentProjectState", scope);
  for (const name of ["activateProject", "selectProject", "deleteProject", "createProject", "reloadProjects"]) scope[name] = handler(name, scope);
  return { scope, stored, events, deleteFails: (message: string) => { deleteError = message; }, saveFails: (message: string) => { saveError = message; }, holdNextSave: (gate: Promise<void>) => { saveGate = gate; } };
}

describe("project deletion navigation", () => {
  it("keeps project creation blocked until a complete model connection is saved", async () => {
    const { scope, stored, events } = fixture([]);
    const connected = scope.activeProvider;
    for (const provider of [null, { ...connected, hasApiKey: false }, { ...connected, enabled: false }]) {
      scope.activeProvider = provider;
      await expect(scope.createProject("premature project")).rejects.toThrow("请先保存并启用模型连接");
      expect(stored.size).toBe(0); expect(events).toEqual([]);
    }
    scope.activeProvider = connected;
    await scope.createProject("ready project"); expect(stored.has("created")).toBe(true);
  });

  it("saves before deleting the selected project, selects another project and permits further navigation", async () => {
    const { scope, stored, events } = fixture();
    await scope.deleteProject(stored.get("p1"));
    expect(events).toEqual(["save:p1", "delete:p1", "load:p2"]);
    expect(scope.projectId).toBe("p2"); expect(scope.activeProjectRef.current).toBe("p2");
    expect(scope.projects.map((project: any) => project.id)).toEqual(["p2", "p3"]);
    await scope.selectProject("p3");
    expect(scope.projectId).toBe("p3"); expect(scope.error).toBe("");
    await scope.saveProjectState("p1", { input: "late autosave" });
    expect(events.filter((event) => event === "save:p1")).toHaveLength(1);
  });

  it("deletes an unselected project without changing the active project or its draft", async () => {
    const { scope, stored, events } = fixture();
    const draft = scope.workspaceSnapshotRef.current;
    await scope.deleteProject(stored.get("p2"));
    expect(events).toEqual(["delete:p2"]); expect(scope.projectId).toBe("p1");
    expect(scope.workspaceSnapshotRef.current).toBe(draft);
    expect(scope.stateReadyRef.current).toBe(true);
  });

  it("clears selection when deleting the last project and can create a new project without restarting", async () => {
    const { scope, stored, events } = fixture(["p1"]);
    await scope.deleteProject(stored.get("p1"));
    expect(scope.projects).toEqual([]); expect(scope.projectId).toBe("");
    expect(scope.activeProjectRef.current).toBe(""); expect(scope.stateReadyRef.current).toBe(false);
    expect(scope.clearRestoreState).toHaveBeenCalledOnce();
    await scope.createProject("new project");
    expect(scope.projectId).toBe("created"); expect(scope.stateReadyRef.current).toBe(true);
    expect(events).toEqual(["save:p1", "delete:p1", "save:created"]);
  });

  it("leaves the current project usable when deletion fails", async () => {
    const { scope, stored, deleteFails } = fixture();
    deleteFails("项目正在导出");
    await expect(scope.deleteProject(stored.get("p1"))).rejects.toThrow("项目正在导出");
    expect(scope.projects).toHaveLength(3); expect(scope.projectId).toBe("p1");
    expect(scope.projectDeletionRef.current.isBusy()).toBe(false);
    expect(scope.projectDeletionRef.current.isBlocked("p1")).toBe(false);
    await scope.selectProject("p2"); expect(scope.projectId).toBe("p2");
  });

  it("does not delete anything if saving the latest draft fails", async () => {
    const { scope, stored, events, saveFails } = fixture();
    saveFails("disk is full");
    await expect(scope.deleteProject(stored.get("p1"))).rejects.toThrow("disk is full");
    expect(events).toEqual(["save:p1"]); expect(stored.has("p1")).toBe(true);
    expect(scope.projectDeletionRef.current.isBusy()).toBe(false);
    saveFails(""); await scope.selectProject("p2"); expect(scope.projectId).toBe("p2");
  });

  it("ignores duplicate delete clicks while confirmation is pending", async () => {
    const { scope, stored, events } = fixture();
    const confirmation = deferred();
    scope.confirmAction.mockImplementation(async () => { await confirmation.promise; return true; });
    const first = scope.deleteProject(stored.get("p1"));
    await scope.deleteProject(stored.get("p1"));
    confirmation.resolve(); await first;
    expect(scope.confirmAction).toHaveBeenCalledOnce();
    expect(events.filter((event) => event.startsWith("delete:"))).toEqual(["delete:p1"]);
  });

  it("cancels a navigation waiting on the deleted project's save and drains that save before deleting", async () => {
    const { scope, stored, events, holdNextSave } = fixture();
    const saving = deferred(); holdNextSave(saving.promise);
    const navigation = scope.selectProject("p3");
    await vi.waitFor(() => expect(events).toEqual(["save:p1"]));
    const deletion = scope.deleteProject(stored.get("p1"));
    saving.resolve(); await Promise.all([navigation, deletion]);
    expect(events.indexOf("delete:p1")).toBeGreaterThan(events.lastIndexOf("save:p1"));
    expect(events).not.toContain("load:p3"); expect(scope.projectId).toBe("p2");
    await scope.selectProject("p3"); expect(scope.projectId).toBe("p3");
  });

  it("allows saving a project again after it is restored from the recycle bin", async () => {
    const { scope, stored, events } = fixture();
    const original = stored.get("p1")!;
    await scope.deleteProject(original);
    stored.set("p1", original); await scope.reloadProjects();
    await scope.selectProject("p1"); await scope.saveProjectState("p1", { input: "restored draft" });
    expect(scope.projectId).toBe("p1"); expect(events.at(-1)).toBe("save:p1");
  });
});

describe("project deletion write barrier", () => {
  it("waits for an unselected project's in-flight write and drops late queued writes", async () => {
    const controller = createProjectDeletionController(), saving = deferred(), events: string[] = [];
    const pending = controller.write("p2", async () => { events.push("write"); await saving.promise; });
    const deletion = controller.run("p2", { confirm: async () => true, prepare: async () => {}, remove: async () => { events.push("delete"); }, commit: () => { events.push("commit"); } });
    await vi.waitFor(() => expect(controller.isBlocked("p2")).toBe(true));
    await controller.write("p2", async () => { events.push("late write"); });
    expect(events).toEqual(["write"]); saving.resolve(); await Promise.all([pending, deletion]);
    expect(events).toEqual(["write", "delete", "commit"]);
  });

  it("releases the deletion lock after cancelling confirmation", async () => {
    const controller = createProjectDeletionController(), remove = vi.fn(async () => {});
    expect(await controller.run("p1", { confirm: async () => false, prepare: async () => {}, remove, commit: () => {} })).toBe(false);
    expect(remove).not.toHaveBeenCalled(); expect(controller.isBusy()).toBe(false);
    expect(controller.isBlocked("p1")).toBe(false);
  });
});

describe("project deletion dialog", () => {
  const form = ast.program.body.find((node: any) => node.type === "FunctionDeclaration" && node.id.name === "ProjectForm");

  it("locks repeated clicks synchronously and catches delete errors inside the dialog", async () => {
    const saving = deferred();
    const scope: Record<string, any> = {
      busyRef: { current: false },
      onDelete: vi.fn(async () => { await saving.promise; throw new Error("项目正在导出"); }),
      setBusy: vi.fn(), setError: vi.fn(),
    };
    const remove = handler("remove", scope, form);
    const first = remove(); await remove();
    expect(scope.onDelete).toHaveBeenCalledOnce(); expect(scope.busyRef.current).toBe(true);
    saving.resolve(); await expect(first).resolves.toBeUndefined();
    expect(scope.setError).toHaveBeenLastCalledWith("项目正在导出");
    expect(scope.busyRef.current).toBe(false); expect(scope.setBusy).toHaveBeenLastCalledWith(false);
  });

  it("prevents save and delete from running together and permits retry after failure", async () => {
    const saving = deferred();
    const scope: Record<string, any> = {
      name: "project", busyRef: { current: false }, setBusy: vi.fn(), setError: vi.fn(),
      onSubmit: vi.fn(async () => { await saving.promise; throw new Error("save failed"); }),
      onDelete: vi.fn(async () => {}),
    };
    const submit = handler("submit", scope, form), remove = handler("remove", scope, form);
    const first = submit(); await remove();
    expect(scope.onDelete).not.toHaveBeenCalled(); saving.resolve(); await first;
    expect(scope.setError).toHaveBeenLastCalledWith("save failed");
    await remove(); expect(scope.onDelete).toHaveBeenCalledOnce();
  });
});
