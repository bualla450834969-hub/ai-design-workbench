import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectResultsPanel, projectResultDisplayEntries, projectResultMatchesSearch, type ProjectResultsPanelProps } from "@/components/project-results-panel";
import { projectResultAssets, projectResultPreviewAssets, resultPixelLabels, resultThumbnailUrl } from "@/lib/project-results";
import type { Asset } from "@/types/domain";

function asset(id: string, overrides: Partial<Asset> = {}): Asset {
  return { id, projectId: "project-a", name: `${id}.png`, type: "image/png", size: 2048, role: "result", origin: "generated", url: `/api/assets/${id}`, createdAt: "2026-10-10T02:00:00.000Z", ...overrides };
}

function panel(overrides: Partial<ProjectResultsPanelProps> = {}) {
  const props: ProjectResultsPanelProps = {
    assets: [], onPreview: vi.fn(), onPatch: vi.fn().mockResolvedValue(undefined), onSixView: vi.fn(),
    open: true, favoritesOnly: false, onClose: vi.fn(), ...overrides,
  };
  return renderToStaticMarkup(createElement(ProjectResultsPanel, props));
}

describe("project-level result records", () => {
  it("includes generated results converted to original/reference roles and excludes user inputs", () => {
    const older = asset("older", { role: "structure", createdAt: "2026-10-09T02:00:00.000Z" });
    const favorite = asset("newer", { role: "style", favorite: true });
    expect(projectResultAssets([older, favorite, asset("input", { origin: "user", role: "structure" }), older]).map((item) => item.id)).toEqual(["newer", "older"]);
    expect(projectResultAssets([asset("legacy", { origin: undefined })])).toHaveLength(1);
  });

  it("previews earlier project results alongside the current chat batch without other projects or input images", () => {
    const earlier = asset("earlier", { createdAt: "2026-10-08T02:00:00.000Z" });
    const pending = asset("pending", { createdAt: "2026-10-09T02:00:00.000Z", localSaveError: "正在保存" });
    const latest = asset("latest", { note: "已保存", createdAt: "2026-10-10T02:00:00.000Z" });
    const staleLatest = { ...latest, note: "旧备注" };
    const list = projectResultPreviewAssets(
      [earlier, latest, asset("other-project", { projectId: "project-b", createdAt: "2026-10-11T02:00:00.000Z" }), asset("source", { origin: "user", role: "structure" })],
      [pending, staleLatest],
      "project-a",
    );
    expect(list.map((item) => item.id)).toEqual(["earlier", "pending", "latest"]);
    expect(list[2].note).toBe("已保存");
  });

  it("distinguishes native pixels, enlarged exports, historical unknowns, and unsaved results", () => {
    expect(resultPixelLabels(asset("upscaled", { nativeWidth: 640, nativeHeight: 480, exportWidth: 2048, exportHeight: 1536, upscaled: true }))).toEqual({ native: "原生 640 × 480", exported: "放大导出 2048 × 1536" });
    expect(resultPixelLabels(asset("old"))).toEqual({ native: "原生 未记录", exported: "导出 未记录" });
    expect(resultPixelLabels(asset("unsaved", { localSaveError: "磁盘空间不足" })).exported).toBe("未保存本机");
    expect(resultThumbnailUrl("/api/assets/a?v=1")).toBe("/api/assets/a?v=1&thumbnail=1");
    expect(resultThumbnailUrl("https://example.com/a.png")).toBe("https://example.com/a.png");
  });

  it("assigns stable chronological display names without changing stored file names", () => {
    const older = asset("older", { name: "方案001.jpg", type: "image/jpeg", createdAt: "2026-10-08T02:00:00.000Z" });
    const middle = asset("middle", { name: "方案001.webp", type: "image/webp", createdAt: "2026-10-09T02:00:00.000Z" });
    const latest = asset("latest", { name: "方案001.jpg", type: "image/jpeg", createdAt: "2026-10-10T02:00:00.000Z" });
    const entries = projectResultDisplayEntries([middle, latest, older]);
    expect(entries.map(({ asset: item, displayName }) => [item.id, displayName])).toEqual([
      ["latest", "方案 003.jpg"],
      ["middle", "方案 002.webp"],
      ["older", "方案 001.jpg"],
    ]);
    expect(entries.map(({ asset: item }) => item.name)).toEqual(["方案001.jpg", "方案001.webp", "方案001.jpg"]);
    expect(projectResultMatchesSearch(entries[0], "方案 003")).toBe(true);
    expect(projectResultMatchesSearch(entries[0], "方案001.jpg")).toBe(true);
  });

  it("breaks equal-time ties by ID and uses verified MIME extensions for recovered results", () => {
    const entries = projectResultDisplayEntries([
      asset("b", { name: "重复.png", type: "image/jpeg", role: "structure" }),
      asset("a", { name: "重复.png", type: "image/jpeg" }),
      asset("input", { origin: "user", role: "structure", createdAt: "2025-01-01T00:00:00.000Z" }),
    ]);
    expect(Object.fromEntries(entries.map((entry) => [entry.asset.id, entry.displayName]))).toEqual({ b: "方案 002.jpg", a: "方案 001.jpg" });
  });
});

describe("project results panel", () => {
  it("offers a non-generating restore action for failed saves, including pending feedback", () => {
    const unsaved = asset("unsaved", { localSaveError: "网络连接失败" });
    expect(panel({ assets: [unsaved], onRestore: vi.fn() })).toContain("重新保存");
    const pending = panel({ assets: [unsaved], onRestore: vi.fn(), restoringIds: [unsaved.id] });
    expect(pending).toContain("保存中…");
    expect(pending).toContain('disabled=""');
    expect(panel({ assets: [unsaved] })).not.toMatch(/>重新保存<\/button>/);
    expect(panel({ assets: [asset("saved")], onRestore: vi.fn() })).not.toContain("重新保存");
  });

  it("renders only project favorites rather than only one generation batch", () => {
    const markup = panel({ favoritesOnly: true, assets: [asset("batch-one", { favorite: true }), asset("batch-two", { favorite: true, note: "按键调整" }), asset("not-favorite")] });
    expect(markup).toContain("项目收藏");
    expect(markup).toContain("方案 001.png");
    expect(markup).toContain("方案 002.png");
    expect(markup).toContain("按键调整");
    expect(markup).toContain('maxLength="240"');
    expect(markup).not.toContain("方案 003.png");
  });

  it("shows repeated legacy file names as distinct chronological方案 numbers", () => {
    const markup = panel({ assets: [
      asset("middle", { name: "方案001.jpg", type: "image/jpeg", createdAt: "2026-10-09T02:00:00.000Z" }),
      asset("latest", { name: "方案001.jpg", type: "image/jpeg", createdAt: "2026-10-10T02:00:00.000Z" }),
      asset("older", { name: "方案001.jpg", type: "image/jpeg", createdAt: "2026-10-08T02:00:00.000Z" }),
    ] });
    expect(markup.indexOf(">方案 003.jpg<")).toBeLessThan(markup.indexOf(">方案 002.jpg<"));
    expect(markup.indexOf(">方案 002.jpg<")).toBeLessThan(markup.indexOf(">方案 001.jpg<"));
    expect(markup).toContain('title="方案 003.jpg"');
    expect(markup).toContain('aria-label="放大预览 方案 003.jpg"');
    expect(markup).toContain('alt="方案 003.jpg"');
    expect(markup).toContain('aria-label="收藏 方案 003.jpg"');
  });

  it("keeps folder access and offers explicit single, all and selected downloads", () => {
    const markup = panel({ assets: [asset("a")], onOpenResultsDirectory: vi.fn(), onExport: vi.fn() });
    expect(markup).toContain("打开成果文件夹");
    expect(markup).not.toContain("加入对比");
    expect(markup).not.toContain("跨批次");
    expect(markup).toContain("导出全部 ZIP");
    expect(markup).toContain("导出已选 ZIP");
    expect(markup).toContain("导出收藏 ZIP");
    expect(markup).toContain("下载图片");
    expect(markup).toContain('aria-label="选择 方案 001.png"');
    expect(markup).toContain('type="checkbox"');
  });

  it("keeps all export choices available in favorites and disables unavailable choices", () => {
    const favoriteMarkup = panel({ favoritesOnly: true, assets: [asset("favorite", { favorite: true })], onExport: vi.fn() });
    expect(favoriteMarkup).toContain("导出收藏 ZIP");
    expect(favoriteMarkup).toContain("导出全部 ZIP");
    expect(favoriteMarkup).toContain("导出已选 ZIP");
    const emptyMarkup = panel({ favoritesOnly: true, onExport: vi.fn() });
    expect(emptyMarkup).toContain("导出收藏 ZIP");
    expect(emptyMarkup).toContain('disabled=""');
    expect(emptyMarkup).toContain("本项目还没有收藏方案");
  });

  it("explains server storage and the browser download fallback for Web users", () => {
    const markup = panel({ assets: [asset("unsaved", { localSaveError: "网络错误" })], downloadUserId: "user-a", onRestore: vi.fn() });
    expect(markup).toContain("尚未保存到服务器项目");
    expect(markup).toContain("项目原件仍保存在服务器");
    expect(markup).toContain("存储到文件");
    expect(markup).not.toContain("尚未保存本机");
    const desktop = panel({ assets: [asset("unsaved", { localSaveError: "磁盘错误" })] });
    expect(desktop).toContain("尚未保存本机");
    expect(desktop).not.toContain("项目原件仍保存在服务器");
  });

  it("does not render a hidden browser when closed", () => {
    expect(panel({ open: false, assets: [asset("a")] })).toBe("");
  });
});
