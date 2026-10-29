import { appPath } from "@/lib/app-path";
import packageInfo from "@/package.json";

export const CURRENT_WEB_BUILD_REVISION = process.env.NEXT_PUBLIC_WEB_BUILD_REVISION || "development";
export type WebBuildInfo = { mode: "web"; version: string; buildRevision: string };
export type WebUpdateState = {
  currentRevision: string;
  latestRevision: string | null;
  version: string | null;
  latestVersion: string | null;
  checking: boolean;
  applying: boolean;
  available: boolean;
  error: string | null;
  checkedAt: string | null;
};
type Driver = { check: () => Promise<void>; apply: () => void };

/** Revision checks also work in browsers without Service Worker support. */
export function createWebUpdateClient(options: { currentRevision: string; currentVersion?: string; fetchBuild: () => Promise<WebBuildInfo>; reload: () => void; now?: () => string; timeoutMs?: number }) {
  let state: WebUpdateState = { currentRevision: options.currentRevision, latestRevision: null, version: options.currentVersion || packageInfo.version, latestVersion: null, checking: false, applying: false, available: false, error: null, checkedAt: null };
  let driver: Driver | null = null;
  let checking: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<WebUpdateState>) => { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setDriver(value: Driver) { driver = value; return () => { if (driver === value) driver = null; }; },
    noticeAvailable() { update({ available: true }); },
    setApplying(applying: boolean) { update({ applying }); },
    check() {
      if (checking) return checking;
      update({ checking: true, error: null });
      const currentDriver = driver;
      checking = (async () => {
        const buildCheck = options.fetchBuild().then((info) => {
          if (info.mode !== "web" || typeof info.version !== "string" || typeof info.buildRevision !== "string" || !/^[a-zA-Z0-9._-]{7,80}$/.test(info.buildRevision)) throw new Error("invalid build response");
          update({ latestRevision: info.buildRevision, latestVersion: info.version, available: state.available || (options.currentRevision !== "development" && info.buildRevision !== options.currentRevision) });
          return info;
        });
        // Browsers cannot abort registration.update(). Bound the UI wait while
        // allowing that harmless browser check to settle in the background.
        let timeout: ReturnType<typeof setTimeout> | undefined;
        let results: [PromiseSettledResult<WebBuildInfo>, PromiseSettledResult<void | undefined>];
        try {
          results = await Promise.race([
            Promise.allSettled([buildCheck, currentDriver?.check()]),
            new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error("update check timed out")), options.timeoutMs ?? 15_000); }),
          ]);
        } finally { clearTimeout(timeout); }
        const build = results[0];
        if (build.status !== "fulfilled") throw new Error("build unavailable");
        if (results[1].status === "rejected") throw new Error("worker update unavailable");
        update({ checkedAt: (options.now || (() => new Date().toISOString()))() });
      })().catch(() => { update({ error: "暂时无法检查更新，请确认网络后重试。" }); }).finally(() => { checking = null; update({ checking: false }); });
      return checking;
    },
    apply() {
      if (state.applying || !state.available) return;
      update({ applying: true, error: null });
      try { if (driver) driver.apply(); else options.reload(); }
      catch { update({ applying: false, error: "暂时无法刷新，请稍后重试。" }); }
    },
  };
}

async function fetchBuild(): Promise<WebBuildInfo> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(appPath("/api/web/build"), { cache: "no-store", credentials: "same-origin", signal: controller.signal });
    if (!response.ok) throw new Error("Build check failed");
    return await response.json() as WebBuildInfo;
  } finally { clearTimeout(timeout); }
}

export const webUpdates = createWebUpdateClient({ currentRevision: CURRENT_WEB_BUILD_REVISION, fetchBuild, reload: () => window.location.reload() });
export const INITIAL_WEB_UPDATE_STATE = webUpdates.getSnapshot();
