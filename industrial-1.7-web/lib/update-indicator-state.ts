export type UpdateIndicatorState = "disabled" | "idle" | "checking" | "downloading" | "ready" | "installing" | "available" | "current" | "error";

type DownloadProgress = { phase?: string; version?: string; percent?: number | null; downloadedBytes?: number; totalBytes?: number; message?: string };
type AutomaticUpdate = DownloadProgress | null | undefined;
type UpdateProgress = DownloadProgress | null | undefined;
type UpdateResult = { available?: boolean; currentVersion?: string; latest?: { version?: string } | null } | null | undefined;

export function updateDownloadPercent(progress: DownloadProgress | null | undefined): number | null {
  const percent = typeof progress?.percent === "number" && Number.isFinite(progress.percent) ? progress.percent
    : typeof progress?.totalBytes === "number" && progress.totalBytes > 0 && Number.isFinite(progress.totalBytes) && typeof progress.downloadedBytes === "number" && Number.isFinite(progress.downloadedBytes)
      ? progress.downloadedBytes / progress.totalBytes * 100 : null;
  return percent === null ? null : Math.max(0, Math.min(100, percent));
}

export type UpdateIndicator = { state: UpdateIndicatorState; tooltip: string; busy: boolean; percent?: number | null; source?: "automatic" | "manual"; version?: string };

export function resolveUpdateIndicator(input: {
  disabled?: boolean;
  disabledReason?: string;
  currentVersion?: string;
  checkBusy?: boolean;
  checkError?: string;
  result?: UpdateResult;
  automaticUpdate?: AutomaticUpdate;
  progress?: UpdateProgress;
}): UpdateIndicator {
  if (input.disabled) return { state: "disabled", tooltip: input.disabledReason || "当前版本未启用在线更新", busy: false };

  const progress = input.progress;
  const automatic = input.automaticUpdate;
  if (["launching", "installer-started"].includes(progress?.phase || "")) {
    return { state: "installing", tooltip: progress?.message || `正在安装更新 ${progress?.version || ""}`.trim(), busy: true, percent: 100, source: "manual", version: progress?.version };
  }
  // A verified background cache supersedes old manual errors or progress for
  // that version; a new manual download for another version still wins.
  if (automatic?.phase === "ready" && (!progress?.version || progress.version === automatic.version || !["backing-up", "starting", "fallback", "downloading", "verifying"].includes(progress.phase || ""))) {
    return { state: "ready", tooltip: `更新 ${automatic.version || ""} 已下载完成，点击安装`.trim(), busy: false, percent: 100, source: "automatic", version: automatic.version };
  }
  if (progress?.phase === "ready") return { state: "ready", tooltip: `更新 ${progress.version || ""} 已下载完成，点击安装`.trim(), busy: false, percent: 100, source: "manual", version: progress.version };
  if (["backing-up", "starting", "fallback", "downloading", "verifying"].includes(progress?.phase || "")) {
    const percent = updateDownloadPercent(progress);
    const label = progress?.phase === "verifying" ? "下载完成，正在校验更新" : progress?.phase === "backing-up" ? "正在备份项目与设置" : `正在下载更新${percent === null ? "" : ` ${Math.round(percent)}%`}`;
    return { state: "downloading", tooltip: `${label}${progress?.version ? ` · ${progress.version}` : ""}`, busy: true, percent, source: "manual", version: progress?.version };
  }
  if (automatic?.phase === "downloading") {
    const percent = updateDownloadPercent(automatic);
    return { state: "downloading", tooltip: `正在后台下载更新${percent === null ? "" : ` ${Math.round(percent)}%`}${automatic.version ? ` · ${automatic.version}` : ""}`, busy: true, percent, source: "automatic", version: automatic.version };
  }
  if (progress?.phase === "checking" || input.checkBusy) return { state: "checking", tooltip: "正在检查更新…", busy: true };
  if (automatic?.phase === "checking") return { state: "checking", tooltip: automatic.message || "正在后台检查更新…", busy: true };
  if (progress?.phase === "error") return { state: "error", tooltip: `更新失败：${progress.message || "请点击重试"}`, busy: false };
  if (input.checkError) return { state: "error", tooltip: `检查更新失败：${input.checkError}；点击重试`, busy: false };
  if (automatic?.phase === "error") return { state: "error", tooltip: automatic.message || "后台更新失败；点击重试", busy: false };
  if (automatic?.phase === "waiting") return { state: "idle", tooltip: "正在执行任务，稍后自动检查更新", busy: false };
  if (automatic?.phase === "paused") return { state: "idle", tooltip: automatic.message || "自动更新已暂停，可在设置中恢复", busy: false };

  if (input.result?.available) return { state: "available", tooltip: `有可用更新 ${input.result.latest?.version || ""}，点击下载`.trim(), busy: false };
  if (input.result) return { state: "current", tooltip: `当前已是最新版本 ${input.currentVersion || input.result.currentVersion || ""}`.trim(), busy: false };
  if (automatic?.phase === "idle") {
    if (/手动确认|手动安装/.test(automatic.message || "")) return { state: "available", tooltip: "有可用更新，点击下载", busy: false };
    return { state: "current", tooltip: `当前没有可用更新 · 当前版本 ${input.currentVersion || ""}`.trim(), busy: false };
  }
  return { state: "idle", tooltip: `检查更新 · 当前版本 ${input.currentVersion || ""}`.trim(), busy: false };
}
