import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoJob } from "@/lib/video-types";

const h = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as { deps: unknown[]; cleanup?: () => void }[], queued: [] as (() => void)[],
  stateIndex: 0, refIndex: 0, effectIndex: 0, fetch: vi.fn(),
  timers: new Map<number, { callback: () => void; delay: number }>(), events: new Map<string, () => void>(), timerId: 0,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) { const index = h.stateIndex++; if (index >= h.states.length) h.states[index] = typeof initial === "function" ? initial() : initial; return [h.states[index], (next: unknown) => { h.states[index] = typeof next === "function" ? next(h.states[index]) : next; }]; },
  useRef(initial: unknown) { const index = h.refIndex++; return h.refs[index] ?? (h.refs[index] = { current: initial }); },
  useEffect(callback: () => (() => void) | void, deps: unknown[]) { const index = h.effectIndex++; const old = h.effects[index]; if (old && deps.length === old.deps.length && deps.every((value, i) => Object.is(value, old.deps[i]))) return; h.effects[index] = { deps }; h.queued.push(() => { old?.cleanup?.(); const cleanup = callback(); if (cleanup) h.effects[index].cleanup = cleanup; }); },
}));
vi.mock("@/lib/client-operations", () => ({ fetchWithTimeout: h.fetch }));
import { ProjectVideoFeed } from "@/components/project-video-feed";

type ElementNode = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;
function elements(node: ReactNode): ElementNode[] { if (Array.isArray(node)) return node.flatMap(elements); if (!isValidElement(node)) return []; const element = node as ElementNode; if (typeof element.type === "function") return elements((element.type as (props: unknown) => ReactNode)(element.props)); return [element, ...elements(element.props.children)]; }
const props: Parameters<typeof ProjectVideoFeed>[0] = { projectId: "project-1" };
let listedJobs: VideoJob[];
let polledJobs: Record<string, VideoJob>;
function job(id: string, patch: Partial<VideoJob> = {}): VideoJob {
  return { id, projectId: "project-1", sourceAssetId: `source-${id}`, sourceName: `产品${id}.jpg`, duration: 10, motion: "orbit-360", model: "vidu-q2-pro-reference-720p", status: "queued", createdAt: "2026-11-04T01:00:00Z", updatedAt: "2026-11-04T01:00:00Z", ...patch };
}
function render() {
  h.stateIndex = 0; h.refIndex = 0; h.effectIndex = 0;
  const root = ProjectVideoFeed(props);
  h.queued.splice(0).forEach((run) => run());
  return { root, tree: elements(root), markup: renderToStaticMarkup(root) };
}
async function settle() { for (let i = 0; i < 12; i++) { render(); await Promise.resolve(); await Promise.resolve(); } return render(); }
function poll() { [...h.timers.values()].filter((timer) => timer.delay === 5000).forEach((timer) => timer.callback()); }
function click(text: string) { const button = render().tree.find((item) => item.type === "button" && renderToStaticMarkup(item).includes(text)); expect(button).toBeDefined(); (button!.props.onClick as () => void)(); }

beforeEach(() => {
  vi.clearAllMocks(); h.states = []; h.refs = []; h.effects = []; h.queued = []; h.timers.clear(); h.events.clear(); h.timerId = 0;
  props.projectId = "project-1"; props.refreshKey = 0; props.submittedJob = undefined; props.onContentChange = vi.fn(); props.onOpenSource = vi.fn();
  listedJobs = []; polledJobs = {};
  h.fetch.mockImplementation(async (url: string) => url.includes("?projectId=") ? Response.json({ jobs: listedJobs }) : Response.json({ job: polledJobs[url.split("/").at(-1)!] }));
  vi.stubGlobal("window", {
    setInterval: vi.fn((callback: () => void, delay: number) => { const id = ++h.timerId; h.timers.set(id, { callback, delay }); return id; }),
    clearInterval: vi.fn((id: number) => h.timers.delete(id)),
    addEventListener: vi.fn((name: string, callback: () => void) => h.events.set(name, callback)),
    removeEventListener: vi.fn((name: string, callback: () => void) => { if (h.events.get(name) === callback) h.events.delete(name); }),
  });
});
afterEach(() => { h.effects.forEach((effect) => effect.cleanup?.()); vi.unstubAllGlobals(); });

describe("inline project video feed", () => {
  it("keeps a paused download out of automatic polling and recovers it only on an explicit save action", async () => {
    listedJobs = [job("paused", { status: "needs-review", supplierTaskId: "existing", failureStage: "download", canRetrySave: true })];
    let view = await settle();
    expect(view.markup).toContain("视频已生成，待保存");
    const reads = h.fetch.mock.calls.length;
    for (let i = 0; i < 5; i++) { poll(); await settle(); }
    expect(h.fetch).toHaveBeenCalledTimes(reads);
    polledJobs.paused = job("paused", { status: "succeeded", url: "/api/video-jobs/paused/file", updatedAt: "2026-11-04T04:00:00Z" });
    click("重新保存已有视频"); view = await settle();
    const recovery = h.fetch.mock.calls.filter((call) => call[1]?.method === "POST");
    expect(recovery).toHaveLength(1);
    expect(recovery[0][0]).toBe("/api/video-jobs/paused");
    expect(JSON.parse(recovery[0][1].body)).toEqual({ action: "retry-save" });
    expect(view.markup).toContain("已完成");
    expect(view.tree.some((item) => item.type === "video")).toBe(true);
  });
  it("does not render an empty history box or make paid requests", async () => {
    const view = await settle();
    expect(view.root).toBeNull();
    expect(h.fetch).toHaveBeenCalledOnce();
    poll(); await settle();
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(h.fetch.mock.calls.every((call) => !call[1]?.method || call[1].method === "GET")).toBe(true);
  });

  it("shows chronologically ordered videos with source identity and keeps old introduction files playable", async () => {
    listedJobs = [
      job("new", { purpose: "scene", providerName: "AIHubMix", status: "succeeded", createdAt: "2026-11-04T03:00:00Z", url: "/api/video-jobs/new/file" }),
      job("old", { purpose: "introduction", status: "succeeded", url: "/api/video-jobs/old/file", warning: "该历史视频没有音轨。" }),
      job("old-motion", { motion: "push-in", createdAt: "2026-11-04T02:00:00Z" }),
      job("other-project", { projectId: "project-2" }),
    ];
    const view = await settle();
    const cards = view.tree.filter((item) => item.type === "article");
    expect(cards.map((item) => item.props["data-video-job-id"])).toEqual(["old", "old-motion", "new"]);
    expect(view.markup).toContain("产品介绍（历史视频）"); expect(view.markup).toContain("使用场景展示");
    expect(view.markup).toContain("产品展示（历史视频）");
    expect(view.markup).toContain("原图：产品old.jpg"); expect(view.markup).toContain("该历史视频没有音轨");
    expect(view.markup).toContain("生成供应商：AIHubMix");
    expect(view.markup).not.toContain("other-project");
    expect(view.tree.filter((item) => item.type === "video").map((item) => item.props.src)).toEqual(["/api/video-jobs/old/file", "/api/video-jobs/new/file"]);
    expect(view.tree.filter((item) => item.type === "a").every((item) => item.props.download === true)).toBe(true);
    const sourceButton = elements(cards[0]).find((item) => item.type === "button" && item.props.children === "查看原图")!;
    (sourceButton.props.onClick as () => void)();
    expect(props.onOpenSource).toHaveBeenCalledWith("source-old");
  });

  it("renders a submitted task immediately and polls it into inline playback without regressing to an older list", async () => {
    props.submittedJob = job("live", { updatedAt: "2026-11-04T02:00:00Z" });
    listedJobs = [job("live")];
    expect(render().markup).toContain("排队中");
    await settle();
    polledJobs.live = job("live", { status: "succeeded", updatedAt: "2026-11-04T02:01:00Z", url: "/api/video-jobs/live/file" });
    poll(); const view = await settle();
    expect(view.markup).toContain("已完成"); expect(view.tree.some((item) => item.type === "video")).toBe(true);
    click("刷新进度"); const afterOldList = await settle();
    expect(afterOldList.markup).toContain("已完成"); expect(afterOldList.markup).not.toContain("排队中");
    expect(h.fetch.mock.calls.some((call) => call[0] === "/api/video-jobs/live")).toBe(true);
    expect(h.fetch.mock.calls.every((call) => !call[1]?.method || call[1].method === "GET")).toBe(true);
  });

  it("does not ask the parent to scroll for timestamp-only polling updates", async () => {
    listedJobs = [job("live")]; await settle();
    const callsBefore = vi.mocked(props.onContentChange!).mock.calls.length;
    polledJobs.live = job("live", { updatedAt: "2026-11-04T02:00:00Z" });
    poll(); await settle();
    expect(props.onContentChange).toHaveBeenCalledTimes(callsBefore);
    polledJobs.live = job("live", { status: "saving", updatedAt: "2026-11-04T02:01:00Z" });
    poll(); await settle();
    expect(props.onContentChange).toHaveBeenCalledTimes(callsBefore + 1);
  });

  it("ignores a delayed response and submitted task from another project and aborts old reads", async () => {
    let finishOld!: (value: Response) => void;
    h.fetch.mockImplementation((url: string) => url.endsWith("project-1") ? new Promise<Response>((resolve) => { finishOld = resolve; }) : Promise.resolve(Response.json({ jobs: [job("project-two", { projectId: "project-2" })] })));
    props.submittedJob = job("old-seed");
    render();
    const oldSignal = h.fetch.mock.calls[0][1].signal as AbortSignal;
    props.projectId = "project-2";
    const nextProject = await settle();
    expect(oldSignal.aborted).toBe(true);
    expect(nextProject.markup).toContain("产品project-two.jpg"); expect(nextProject.markup).not.toContain("old-seed");
    finishOld(Response.json({ jobs: [job("leaked-old-result")] }));
    const view = await settle();
    expect(view.markup).toContain("产品project-two.jpg"); expect(view.markup).not.toContain("leaked-old-result");
    expect(view.markup).not.toContain("old-seed");
    expect(h.timers.size).toBe(2); expect(h.events.size).toBe(1);
  });

  it("shows a Chinese read failure and refreshes read-only on retry and window focus", async () => {
    h.fetch.mockRejectedValueOnce(new Error("network failed"));
    let view = await settle();
    expect(view.tree.some((item) => item.props.role === "alert")).toBe(true);
    expect(view.markup).toMatch(/[\u3400-\u9fff]/); expect(view.markup).not.toContain("network failed");
    listedJobs = [job("retried", { status: "needs-review", error: "请先核对供应商任务和账单。" })];
    click("刷新进度"); view = await settle();
    expect(view.markup).toContain("需要核对任务"); expect(view.markup).toContain("核对供应商任务和账单");
    const calls = h.fetch.mock.calls.length;
    poll(); await settle(); expect(h.fetch).toHaveBeenCalledTimes(calls);
    h.events.get("focus")?.(); await settle(); expect(h.fetch).toHaveBeenCalledTimes(calls + 1);
  });
});
