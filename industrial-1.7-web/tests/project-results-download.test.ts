import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserDownloadResult, PreparedBrowserDownload } from "@/lib/browser-downloads";

const h = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as { deps: unknown[]; cleanup?: () => void }[], queued: [] as (() => void)[], stateIndex: 0, refIndex: 0, effectIndex: 0,
  local: true, save: vi.fn(), export: vi.fn(), exportBrowser: vi.fn(), download: vi.fn(), fetch: vi.fn(), restore: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) { const index = h.stateIndex++; if (index >= h.states.length) h.states[index] = typeof initial === "function" ? initial() : initial; return [h.states[index], (next: unknown) => { h.states[index] = typeof next === "function" ? next(h.states[index]) : next; }]; },
  useRef(initial: unknown) { const index = h.refIndex++; return h.refs[index] ?? (h.refs[index] = { current: initial }); },
  useMemo(callback: () => unknown) { return callback(); }, useId() { return "results-test"; },
  useEffect(callback: () => (() => void) | void, deps: unknown[]) { const index = h.effectIndex++; if (h.effects[index] && deps.every((value, i) => Object.is(value, h.effects[index].deps[i]))) return; const old = h.effects[index]; h.effects[index] = { deps }; h.queued.push(() => { old?.cleanup?.(); const cleanup = callback(); if (cleanup) h.effects[index].cleanup = cleanup; }); },
}));
vi.mock("@/lib/browser-local-mode", () => ({ isBrowserLocalMode: () => h.local }));
vi.mock("@/lib/browser-downloads", () => ({
  savePreparedBrowserDownload: h.save, exportProjectToBrowser: h.exportBrowser, restoreBrowserDownloadDirectory: h.restore,
  browserDownloadMessage: (result: BrowserDownloadResult) => result.mode === "directory" ? `已保存到下载文件夹：${result.filename}` : "已交给浏览器下载，请在下载列表确认。",
  supportsBrowserDownloadDirectory: () => false, chooseBrowserDownloadDirectory: vi.fn(), downloadProjectAsset: vi.fn(), forgetBrowserDownloadDirectory: vi.fn(),
}));
vi.mock("@/lib/client-operations", () => ({ downloadBlob: h.download, fetchWithTimeout: h.fetch }));
import { ProjectResultsPanel, type ProjectResultsPanelProps } from "@/components/project-results-panel";
import { exportProject } from "@/components/beta-tools";

type Element = ReactElement<{ children?: ReactNode; [key: string]: unknown }>;
function elements(node: ReactNode): Element[] { if (Array.isArray(node)) return node.flatMap(elements); if (!isValidElement(node)) return []; const element = node as Element; return [element, ...elements(element.props.children)]; }
let props: ProjectResultsPanelProps;
const prepared = (): PreparedBrowserDownload => ({ mode: "prepared", filename: "项目-方案归档.zip", blob: new Blob(["fixture ZIP"], { type: "application/zip" }) });
function render() {
  const pass = () => { h.stateIndex = 0; h.refIndex = 0; h.effectIndex = 0; return ProjectResultsPanel(props); };
  let root = pass(); if (h.queued.length) { h.queued.splice(0).forEach((run) => run()); root = pass(); }
  const tree = elements(root);
  return { markup: renderToStaticMarkup(root), button: (label: string) => tree.find((item) => item.type === "button" && renderToStaticMarkup(item).includes(label)) };
}
function click(label: string) { const button = render().button(label); expect(button).toBeDefined(); (button!.props.onClick as () => void)(); }
beforeEach(() => {
  vi.clearAllMocks(); h.states = []; h.refs = []; h.effects = []; h.queued = []; h.local = true;
  h.restore.mockResolvedValue(null); h.export.mockResolvedValue(prepared()); h.exportBrowser.mockResolvedValue(prepared()); h.save.mockImplementation((result: PreparedBrowserDownload) => ({ mode: "download", filename: result.filename }));
  vi.stubGlobal("window", { desktopAPI: undefined }); vi.stubGlobal("document", { activeElement: null }); vi.stubGlobal("HTMLElement", class {});
  props = { projectId: "p1", downloadUserId: "user-a", assets: [{ id: "a1", projectId: "p1", name: "方案.png", role: "result", origin: "generated", type: "image/png", size: 3, url: "blob:fixture", favorite: true, createdAt: "2026-10-19" }], onPreview: vi.fn(), onPatch: vi.fn(), onSixView: vi.fn(), onExport: h.export, open: true, favoritesOnly: false, onClose: vi.fn() };
});
afterEach(() => { h.effects.forEach((effect) => effect.cleanup?.()); vi.unstubAllGlobals(); });

describe("prepared project ZIP download", () => {
  it("waits for a fresh explicit download click after ZIP preparation and prevents duplicate preparation", async () => {
    let finish!: (value: PreparedBrowserDownload) => void;
    h.export.mockReturnValue(new Promise<PreparedBrowserDownload>((resolve) => { finish = resolve; }));
    click("导出全部 ZIP"); click("导出全部 ZIP"); expect(h.export).toHaveBeenCalledOnce(); expect(h.save).not.toHaveBeenCalled(); expect(render().markup).toContain("正在本机准备图片包");
    const value = prepared(); finish(value); await vi.waitFor(() => expect(render().button("下载已准备图片包")).toBeDefined());
    expect(render().markup).toContain("尚未下载"); expect(h.save).not.toHaveBeenCalled();
    click("下载已准备图片包"); expect(h.save).toHaveBeenCalledOnce(); expect(h.save).toHaveBeenCalledWith(value); expect(render().markup).toContain("下载列表确认");
  });

  it("clears a prepared Blob on panel close, project changes including empty projects, or account change", async () => {
    click("导出全部 ZIP"); await vi.waitFor(() => expect(render().button("下载已准备图片包")).toBeDefined());
    props.open = false; expect(render().markup).toBe(""); props.open = true; expect(render().button("下载已准备图片包")).toBeUndefined();
    click("导出全部 ZIP"); await vi.waitFor(() => expect(render().button("下载已准备图片包")).toBeDefined());
    props.projectId = "empty-project"; props.assets = []; expect(render().button("下载已准备图片包")).toBeUndefined();
    props.projectId = "p1"; props.assets = [{ id: "a1", projectId: "p1", name: "a.png", role: "result", type: "image/png", size: 3, url: "blob:fixture", createdAt: "2026-10-19" }]; click("导出全部 ZIP"); await vi.waitFor(() => expect(render().button("下载已准备图片包")).toBeDefined());
    props.downloadUserId = "user-b"; expect(render().button("下载已准备图片包")).toBeUndefined(); expect(h.save).not.toHaveBeenCalled();
  });

  it.each(["close", "project"])("ignores a late preparation result after %s", async (change) => {
    let finish!: (value: PreparedBrowserDownload) => void; h.export.mockReturnValue(new Promise<PreparedBrowserDownload>((resolve) => { finish = resolve; }));
    click("导出全部 ZIP");
    if (change === "close") props.open = false; else { props.projectId = "p2"; props.assets = []; }
    render(); finish(prepared()); await Promise.resolve(); await Promise.resolve();
    props.open = true; expect(render().button("下载已准备图片包")).toBeUndefined(); expect(render().markup).not.toContain("尚未下载"); expect(h.save).not.toHaveBeenCalled();
  });

  it("preserves the prepared ZIP for retry if the browser download click fails", async () => {
    click("导出全部 ZIP"); await vi.waitFor(() => expect(render().button("下载已准备图片包")).toBeDefined());
    h.save.mockImplementationOnce(() => { throw new Error("系统暂未接受下载，请再点一次"); }); click("下载已准备图片包");
    expect(render().markup).toContain("请再点一次"); expect(render().button("下载已准备图片包")).toBeDefined(); click("下载已准备图片包"); expect(h.save).toHaveBeenCalledTimes(2); expect(render().markup).toContain("下载列表确认");
  });

  it("keeps selected/favorite export options and local-only image/size explanations", async () => {
    expect(render().markup).toContain("ZIP 仅包含图片，单次最多 500 张、合计 512 MiB"); expect(render().markup).not.toContain("ZIP 包含图片和方案参数");
    click("仅选当前筛选"); click("导出已选 ZIP"); await vi.waitFor(() => expect(h.export).toHaveBeenCalledWith(["a1"]));
    await vi.waitFor(() => expect(render().button("下载已准备图片包")).toBeDefined()); click("导出收藏 ZIP"); await vi.waitFor(() => expect(h.export).toHaveBeenCalledWith(undefined, true));
  });

  it("preserves existing directory, desktop and former-server export feedback", async () => {
    h.local = false; expect(render().markup).toContain("ZIP 包含图片和方案参数"); expect(render().markup).not.toContain("512 MiB");
    h.export.mockResolvedValueOnce({ mode: "directory", filename: "server.zip", directoryName: "Files" }); click("导出全部 ZIP"); await vi.waitFor(() => expect(render().markup).toContain("已保存到下载文件夹")); expect(render().button("下载已准备图片包")).toBeUndefined();
    h.export.mockResolvedValueOnce(undefined); click("导出全部 ZIP"); await vi.waitFor(() => expect(render().markup).toContain("已发起导出")); expect(h.save).not.toHaveBeenCalled();
  });

  it("returns prepared browser export results through beta-tools without starting a download", async () => {
    const result = prepared(); h.exportBrowser.mockResolvedValueOnce(result);
    expect(await exportProject("p1", "Project", ["a1"], true, "user-a")).toBe(result);
    expect(h.exportBrowser).toHaveBeenCalledWith("p1", "Project", ["a1"], true, "user-a"); expect(h.download).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
  });

  it("keeps desktop export's existing Blob download behavior", async () => {
    vi.stubGlobal("window", { desktopAPI: {} }); h.fetch.mockResolvedValue(new Response(new Blob(["ZIP"], { type: "application/zip" })));
    expect(await exportProject("p1", "Project", ["a1"])).toBeUndefined(); expect(h.download).toHaveBeenCalledOnce(); expect(h.exportBrowser).not.toHaveBeenCalled();
  });
});
