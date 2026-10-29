export const WEB_WORKSPACE_ZOOM_KEY = "idai-web-interface-zoom";
export const WORKSPACE_ZOOM_MIN = 80;
export const WORKSPACE_ZOOM_MAX = 160;
export const WORKSPACE_ZOOM_STEP = 5;

type ZoomStorage = Pick<Storage, "getItem" | "setItem">;
type ZoomBrowser = Pick<Window, "innerHeight" | "visualViewport" | "addEventListener" | "removeEventListener">;

export function normalizeWorkspaceZoom(value: unknown): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(number)) return 100;
  return Math.max(WORKSPACE_ZOOM_MIN, Math.min(WORKSPACE_ZOOM_MAX, Math.round(number / WORKSPACE_ZOOM_STEP) * WORKSPACE_ZOOM_STEP));
}

export function readWebWorkspaceZoom(storage?: Pick<Storage, "getItem">): number {
  try { return normalizeWorkspaceZoom(storage?.getItem(WEB_WORKSPACE_ZOOM_KEY)); }
  catch { return 100; }
}

/** All measurements are viewport CSS pixels, before the app's CSS zoom. */
export function workspaceViewportHeight(layoutHeight: number, visual?: Pick<VisualViewport, "height" | "scale"> | null): number {
  const layout = Number.isFinite(layoutHeight) && layoutHeight > 0 ? layoutHeight : 1;
  // Pinch changes the visual viewport, not the app layout. Never turn it into
  // a keyboard resize or make the page reflow underneath the user's fingers.
  if (visual && Math.abs(visual.scale - 1) < 0.01 && Number.isFinite(visual.height) && visual.height > 0) return Math.min(layout, visual.height);
  return layout;
}

/**
 * Browser-only UI zoom. Electron keeps its existing webContents zoom and key.
 * No key, wheel or pointer handlers: native browser zoom and image gestures keep
 * their default behavior. The host shell must use --workspace-viewport-height.
 */
export function createWebWorkspaceZoom(root: HTMLElement, browser: ZoomBrowser, storage?: ZoomStorage) {
  const previousZoom = root.style.getPropertyValue("zoom");
  const properties = ["--workspace-interface-scale", "--workspace-overlay-scale", "--workspace-viewport-height", "--workspace-unscaled-viewport-height"];
  const previous = properties.map((property) => root.style.getPropertyValue(property));
  let percent = readWebWorkspaceZoom(storage);
  let height = workspaceViewportHeight(browser.innerHeight, browser.visualViewport);
  let disposed = false;
  const apply = () => {
    const factor = percent / 100;
    root.style.setProperty("zoom", String(factor));
    root.style.setProperty("--workspace-interface-scale", String(factor));
    root.style.setProperty("--workspace-overlay-scale", String(1 / factor));
    // Unlike percentage widths, viewport-unit lengths are multiplied by CSS
    // zoom. Compensate fixed shell heights so 160% does not hide the composer.
    root.style.setProperty("--workspace-viewport-height", `${Math.round(height / factor * 1000) / 1000}px`);
    root.style.setProperty("--workspace-unscaled-viewport-height", `${Math.round(height * 1000) / 1000}px`);
  };
  const resize = () => {
    if (disposed) return;
    const visual = browser.visualViewport;
    if (visual && Math.abs(visual.scale - 1) >= 0.01) return;
    height = workspaceViewportHeight(browser.innerHeight, visual);
    apply();
  };
  const visual = browser.visualViewport;
  browser.addEventListener("resize", resize);
  visual?.addEventListener("resize", resize);
  apply();
  return {
    get: () => percent,
    set(value: unknown) {
      if (disposed) return percent;
      percent = normalizeWorkspaceZoom(value);
      apply();
      try { storage?.setItem(WEB_WORKSPACE_ZOOM_KEY, String(percent)); } catch { /* Private mode can deny persistence; zoom still works. */ }
      return percent;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      browser.removeEventListener("resize", resize);
      visual?.removeEventListener("resize", resize);
      if (previousZoom) root.style.setProperty("zoom", previousZoom); else root.style.removeProperty("zoom");
      properties.forEach((property, index) => { if (previous[index]) root.style.setProperty(property, previous[index]); else root.style.removeProperty(property); });
    },
  };
}
