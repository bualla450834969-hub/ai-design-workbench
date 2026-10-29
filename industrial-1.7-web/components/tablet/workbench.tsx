"use client";

import { useEffect, useMemo, useState } from "react";
import { getAgent } from "@/lib/agents/catalog";
import { projectResultDisplayEntries } from "@/lib/project-results";
import { localJson, localSend } from "@/lib/tablet-client";
import type { Asset, GenerationJob, Message, Project, Resolution } from "@/types/domain";
import { WORKFLOWS, workflowById, type WorkflowSpec } from "./workflows";

type Tab = "workbench" | "results" | "history" | "favorites";

const COUNTS = [1, 2, 4, 6, 10];

function assetUrl(asset: Asset) {
  return asset.url || "";
}

export function Workbench({ initialProject, onEditModel, onLoggedOut }: {
  initialProject: Project;
  onEditModel: () => void;
  onLoggedOut: () => void;
}) {
  const [projects, setProjects] = useState<Project[]>([initialProject]);
  const [project, setProject] = useState(initialProject);
  const [workflow, setWorkflow] = useState<WorkflowSpec>(WORKFLOWS[0]);
  const [tab, setTab] = useState<Tab>("workbench");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState(getAgent(WORKFLOWS[0].id).starterPrompts[0] || "");
  const [count, setCount] = useState(1);
  const [resolution, setResolution] = useState<Resolution>("1K");
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("未命名项目");
  const [error, setError] = useState("");
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [modelLabel, setModelLabel] = useState("连接模型");
  const [busy, setBusy] = useState(false);

  const agent = getAgent(workflow.id);
  const mode = workflow.generationMode;
  const activeWorkflow = mode === "local" && workflow.id !== "free-chat" ? workflowById("local-retouch") : workflow;
  const products = assets.filter((asset) => asset.role === "structure" || (asset.role === "result" && asset.origin !== "generated"));
  const references = assets.filter((asset) => asset.role === "style" || asset.role === "scene");
  const results = useMemo(() => projectResultDisplayEntries(assets), [assets]);
  const favorites = results.filter((entry) => entry.asset.favorite);

  async function refreshProjects(selectId = project.id) {
    const listed = await localJson<{ projects: Project[] }>("/api/projects");
    setProjects(listed.projects);
    const next = listed.projects.find((item) => item.id === selectId) || listed.projects[0];
    if (next) setProject(next);
    return next;
  }

  async function loadProject(id: string) {
    const [detail, conversation, jobs] = await Promise.all([
      localJson<{ project: Project }>(`/api/projects/${id}`),
      localJson<{ messages: Message[]; assets: Asset[] }>(`/api/conversations?projectId=${encodeURIComponent(id)}`),
      localJson<{ jobs: GenerationJob[] }>(`/api/generation-jobs?projectId=${encodeURIComponent(id)}`),
    ]);
    setProject(detail.project);
    setAssets(conversation.assets);
    setMessages(conversation.messages);
    const running = jobs.jobs.find((item) => item.status === "queued" || item.status === "running");
    setJob(running || jobs.jobs[0] || null);
    const stored = window.sessionStorage.getItem(`idai-workflow:${id}`);
    if (stored) setWorkflow(workflowById(stored));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [listed, providers] = await Promise.all([
          localJson<{ projects: Project[] }>("/api/projects"),
          localJson<{ providers: DesktopProvider[] }>("/api/web/providers"),
        ]);
        if (cancelled) return;
        setProjects(listed.projects);
        const active = providers.providers.find((item) => item.enabled);
        if (active) setModelLabel(`${active.textModel} · ${active.imageModel}`);
        await loadProject(initialProject.id);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "工作台加载失败");
      }
    })();
    return () => { cancelled = true; };
    // Initial project only. Later switches call loadProject directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProject.id]);

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "running")) return;
    const timer = window.setInterval(() => {
      void localJson<{ jobs: GenerationJob[] }>(`/api/generation-jobs?projectId=${encodeURIComponent(project.id)}`).then(async (payload) => {
        const current = payload.jobs.find((item) => item.id === job.id) || payload.jobs[0];
        if (!current) return;
        setJob(current);
        if (current.status !== "queued" && current.status !== "running") {
          const conversation = await localJson<{ messages: Message[]; assets: Asset[] }>(`/api/conversations?projectId=${encodeURIComponent(project.id)}`);
          setAssets(conversation.assets);
          setMessages(conversation.messages);
          if (current.status === "failed") setError(current.error || "生成失败");
          if (current.status === "succeeded") setTab("results");
        }
      }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "读取任务失败"));
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job, project.id]);

  function chooseWorkflow(next: WorkflowSpec) {
    setWorkflow(next);
    setTab("workbench");
    window.sessionStorage.setItem(`idai-workflow:${project.id}`, next.id);
    const starter = getAgent(next.id).starterPrompts[0];
    setPrompt((current) => {
      const previous = getAgent(workflow.id).starterPrompts[0];
      return !current.trim() || current === previous ? starter || current : current;
    });
    setError("");
  }

  async function upload(files: FileList | null, role: "structure" | "style" | "scene") {
    if (!files?.length) return;
    setError("");
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("file", file);
        form.set("projectId", project.id);
        form.set("role", role);
        await localJson<{ asset: Asset }>("/api/assets/upload", { method: "POST", body: form });
      }
      await loadProject(project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "素材上传失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeAsset(asset: Asset) {
    setError("");
    try {
      await localJson(`/api/assets/${asset.id}`, { method: "DELETE" });
      await loadProject(project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除图片失败");
    }
  }

  async function toggleFavorite(asset: Asset) {
    await localJson(`/api/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: !asset.favorite }),
    });
    await loadProject(project.id);
  }

  async function generate() {
    const content = prompt.trim();
    if (!content) {
      setError("请先写下设计要求");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const selected = mode === "local"
        ? assets.filter((asset) => asset.role === "structure").slice(0, 1)
        : assets.filter((asset) => asset.role === "structure" || asset.role === "style" || asset.role === "scene");
      const assetIds = selected.map((asset) => asset.id).slice(0, 9);
      const spec = activeWorkflow;
      const settings: Record<string, string | number | boolean> = {
        generationMode: workflow.id === "free-chat" ? "text" : mode,
        workflowKind: spec.workflowKind,
        outputCount: count,
        [spec.countKey]: count,
        resolution,
        aspectRatio: "auto",
        boardItems: 1,
        reconstructionRatio: mode === "local" ? 40 : 70,
        designDirection: "造型焕新",
      };
      const path = workflow.id === "free-chat" ? "/api/free-chat" : "/api/messages";
      const body = workflow.id === "free-chat"
        ? { projectId: project.id, content, assetIds, resolution, aspectRatio: "auto", boardItems: 1, idempotencyKey: crypto.randomUUID() }
        : { projectId: project.id, content, agentId: spec.id, assetIds, settings, idempotencyKey: crypto.randomUUID() };
      const created = await localSend<{ job: GenerationJob }>(path, body);
      setJob(created.job);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "生成失败");
    } finally {
      setBusy(false);
    }
  }

  async function createProject() {
    setError("");
    try {
      const created = await localSend<{ project: Project }>("/api/projects", { name: draftName.trim() || "未命名项目", description: "" });
      setCreating(false);
      await refreshProjects(created.project.id);
      await loadProject(created.project.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建项目失败");
    }
  }

  async function logout() {
    await localJson("/api/auth/logout", { method: "POST" });
    onLoggedOut();
  }

  const running = job && (job.status === "queued" || job.status === "running");

  return (
    <div className="ida-app">
      <aside className="ida-side">
        <div className="ida-brand ida-brand-compact">
          <b>ID</b>
          <span><strong>工业设计智能体</strong><small>INDUSTRIAL AI</small></span>
        </div>
        <button className="ida-new" type="button" onClick={() => setCreating(true)}>+ 新建项目</button>
        {creating ? (
          <form className="ida-new-form" onSubmit={(event) => { event.preventDefault(); void createProject(); }}>
            <input value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label="新项目名称" />
            <button type="submit">创建</button>
          </form>
        ) : null}
        <div className="ida-side-label">项目</div>
        <div className="ida-project-list">
          {projects.map((item) => (
            <button key={item.id} type="button" className={item.id === project.id ? "active" : ""} onClick={() => void loadProject(item.id).then(() => setProjects((current) => current))}>
              <strong>{item.name}</strong>
              <small>本地项目</small>
            </button>
          ))}
        </div>
        <div className="ida-side-label">工作流</div>
        <nav className="ida-flows">
          {WORKFLOWS.map((item) => (
            <button key={item.id} type="button" className={workflow.id === item.id ? "active" : ""} onClick={() => chooseWorkflow(item)}>{item.label}</button>
          ))}
        </nav>
        <div className="ida-side-foot">
          <span className="ida-avatar">{(project.name || "项").slice(0, 1)}</span>
          <button type="button" onClick={() => void logout()}>退出</button>
        </div>
      </aside>
      <section className="ida-main">
        <header className="ida-main-bar">
          <div>
            <h1>{project.name}</h1>
            <p>{agent.description}</p>
          </div>
          <div className="ida-tabs" role="tablist">
            {(["workbench", "results", "history", "favorites"] as Tab[]).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
                {{ workbench: "工作台", results: "结果", history: "历史", favorites: "收藏" }[item]}
              </button>
            ))}
          </div>
          <button className="ida-model" type="button" onClick={onEditModel}>{modelLabel}</button>
        </header>
        {error ? <div className="ida-inline-error" role="alert">{error}</div> : null}
        {running ? <div className="ida-progress" role="status">{job?.stageLabel || "正在生成"} · {job?.progress || 0}%</div> : null}
        {tab === "workbench" ? (
          <div className="ida-workspace">
            <p className="ida-lead">{agent.greeting}</p>
            {workflow.id === "free-chat" ? null : (
              <>
                <section className="ida-panel">
                  <header><h2>产品图片</h2><small>最多 4 张。建议包含正面、侧面、细节</small></header>
                  <label className="ida-drop">
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(event) => void upload(event.target.files, "structure")} />
                    <b>+</b><span>上传</span>
                  </label>
                  <div className="ida-thumbs">
                    {products.map((asset) => (
                      <figure key={asset.id}>
                        {assetUrl(asset) ? <img src={assetUrl(asset)} alt={asset.name} /> : <span>{asset.name}</span>}
                        <figcaption>{asset.name}</figcaption>
                        <button type="button" onClick={() => void removeAsset(asset)}>移除</button>
                      </figure>
                    ))}
                  </div>
                </section>
                <section className="ida-panel ida-optional">
                  <header>
                    <h2>局部改款（可选）</h2>
                    <label className="ida-switch"><input type="checkbox" checked={workflow.id === "local-retouch"} onChange={(event) => { if (event.target.checked) chooseWorkflow(workflowById("local-retouch")); else chooseWorkflow(workflowById("appearance-variants")); }} /><span>{workflow.id === "local-retouch" ? "开启" : "关闭"}</span></label>
                  </header>
                  <p>请先上传产品图片后再使用。只修改指定局部，其他区域保持一致。</p>
                </section>
                <section className="ida-panel">
                  <header><h2>设计参考图（可选）</h2><small>{workflow.id === "render-studio" ? "场景参考" : "风格、材质或构图参考"}</small></header>
                  <label className="ida-drop ida-drop-short">
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(event) => void upload(event.target.files, workflow.id === "render-studio" ? "scene" : "style")} />
                    <span>添加参考</span>
                  </label>
                  <div className="ida-thumbs">
                    {references.map((asset) => (
                      <figure key={asset.id}>
                        {assetUrl(asset) ? <img src={assetUrl(asset)} alt={asset.name} /> : <span>{asset.name}</span>}
                        <button type="button" onClick={() => void removeAsset(asset)}>移除</button>
                      </figure>
                    ))}
                  </div>
                </section>
              </>
            )}
            <section className="ida-panel">
              <header><h2>{workflow.id === "free-chat" ? "自由对话" : "设计要求"}</h2></header>
              {workflow.id === "free-chat" ? (
                <label className="ida-drop ida-drop-short">
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden onChange={(event) => void upload(event.target.files, "structure")} />
                  <span>添加图片</span>
                </label>
              ) : null}
              <div className="ida-starters">
                {agent.starterPrompts.map((item) => <button key={item} type="button" onClick={() => setPrompt(item)}>{item}</button>)}
              </div>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={agent.inputHint} />
              <div className="ida-controls">
                <label>生成数量<select value={count} onChange={(event) => setCount(Number(event.target.value))}>{COUNTS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label>分辨率<select value={resolution} onChange={(event) => setResolution(event.target.value as Resolution)}><option>1K</option><option>2K</option><option>4K</option></select></label>
                <button className="ida-primary ida-generate" type="button" disabled={busy || Boolean(running)} onClick={() => void generate()}>
                  <span>{running ? "正在提交…" : workflow.id === "free-chat" ? "发送" : "生成方案"}</span><b>→</b>
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {tab === "results" || tab === "favorites" ? (
          <div className="ida-results">
            {(tab === "favorites" ? favorites : results).length === 0 ? <p className="ida-empty">{tab === "favorites" ? "本项目还没有收藏方案" : "本项目还没有生成方案"}</p> : null}
            <div className="ida-result-grid">
              {(tab === "favorites" ? favorites : results).map((entry) => (
                <article key={entry.asset.id}>
                  {assetUrl(entry.asset) ? <img src={assetUrl(entry.asset)} alt={entry.displayName} /> : <p>{entry.displayName}</p>}
                  <footer>
                    <strong>{entry.displayName}</strong>
                    <button type="button" onClick={() => void toggleFavorite(entry.asset)}>{entry.asset.favorite ? "已收藏" : "收藏"}</button>
                    {assetUrl(entry.asset) ? <a href={assetUrl(entry.asset)} download={entry.displayName}>下载</a> : null}
                  </footer>
                </article>
              ))}
            </div>
          </div>
        ) : null}
        {tab === "history" ? (
          <div className="ida-history">
            {messages.length === 0 ? <p className="ida-empty">还没有对话或生成记录</p> : null}
            {messages.map((message) => (
              <article key={message.id} className={message.role}>
                <header>{message.role === "user" ? "你" : "设计助手"} · {new Date(message.createdAt).toLocaleString("zh-CN")}</header>
                <p>{message.content}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
