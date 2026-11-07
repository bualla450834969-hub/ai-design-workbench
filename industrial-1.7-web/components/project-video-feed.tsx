"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Film, LoaderCircle, RefreshCw } from "lucide-react";
import { appPath } from "@/lib/app-path";
import { fetchWithTimeout } from "@/lib/client-operations";
import { readApiJson } from "@/lib/client-response";
import { userFacingError } from "@/lib/user-facing-error";
import { videoJobErrorMessage } from "@/lib/video-error";
import type { VideoJob } from "@/lib/video-types";
import styles from "./project-video-feed.module.css";

const statusLabels: Record<VideoJob["status"], string> = {
  submitting: "正在提交", queued: "排队中", running: "生成中", saving: "正在保存视频",
  succeeded: "已完成", failed: "生成失败", "needs-review": "需要核对任务",
};

type FeedState = { projectId: string; jobs: VideoJob[]; error: string };
type ProjectVideoFeedProps = {
  projectId: string;
  refreshKey?: number;
  submittedJob?: VideoJob;
  onOpenSource?: (sourceAssetId: string) => void;
  onContentChange?: () => void;
  enabled?: boolean;
};

function pending(job: VideoJob) {
  return ["submitting", "queued", "running", "saving"].includes(job.status);
}

function mergeJobs(projectId: string, previous: VideoJob[], incoming: VideoJob[]) {
  const jobs = new Map<string, VideoJob>();
  for (const job of [...previous, ...incoming]) {
    if (job.projectId !== projectId) continue;
    const existing = jobs.get(job.id);
    if (!existing || (Date.parse(job.updatedAt) || 0) >= (Date.parse(existing.updatedAt) || 0)) jobs.set(job.id, job);
  }
  return [...jobs.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

function visualSignature(state: FeedState) {
  // Polling can change updatedAt without changing the visible card. Do not make
  // the parent scroll again for those updates or interrupt video playback.
  return JSON.stringify([state.projectId, state.error, state.jobs.map((job) => [job.id, job.sourceName, job.providerName, job.duration, job.purpose, job.status, job.url, job.error, job.warning])]);
}

function title(job: VideoJob) {
  return job.purpose === "scene" ? "使用场景展示"
    : job.purpose === "introduction" ? "产品介绍（历史视频）"
      : job.motion && job.motion !== "orbit-360" ? "产品展示（历史视频）" : "360°产品展示";
}

/** Read-only project video history, displayed beside the conversation results. */
export function useProjectVideoFeed({ projectId, refreshKey = 0, submittedJob, onContentChange, enabled = true }: ProjectVideoFeedProps) {
  const [state, setState] = useState<FeedState>(() => ({ projectId, jobs: mergeJobs(projectId, [], submittedJob ? [submittedJob] : []), error: "" }));
  const stateRef = useRef(state);
  const contentChangeRef = useRef(onContentChange);
  const refreshRef = useRef<() => void>(() => {});
  const recoverRef = useRef<(id: string) => void>(() => {});
  contentChangeRef.current = onContentChange;

  useEffect(() => {
    if (!enabled || !projectId) return;
    let active = true;
    let running = false;
    let queuedListRead = false;
    const controller = new AbortController();
    let jobs = mergeJobs(projectId, stateRef.current.projectId === projectId ? stateRef.current.jobs : [], submittedJob ? [submittedJob] : []);

    function publish(error = "") {
      if (!active) return;
      const next = { projectId, jobs, error };
      const previous = stateRef.current;
      stateRef.current = next;
      setState(next);
      if (visualSignature(previous) !== visualSignature(next)) contentChangeRef.current?.();
    }

    async function refresh(list: boolean) {
      if (!active) return;
      if (running) { queuedListRead ||= list; return; }
      if (!list && !jobs.some(pending)) return;
      running = true;
      try {
        if (list) {
          const response = await fetchWithTimeout(`/api/video-jobs?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store", signal: controller.signal });
          const data = await readApiJson<{ jobs: VideoJob[] }>(response, "读取项目视频失败");
          if (!active) return;
          jobs = mergeJobs(projectId, jobs, data.jobs);
          publish();
        } else {
          const results = await Promise.allSettled(jobs.filter(pending).map(async (job) => {
            const response = await fetchWithTimeout(`/api/video-jobs/${encodeURIComponent(job.id)}`, { cache: "no-store", signal: controller.signal });
            return (await readApiJson<{ job: VideoJob }>(response, "读取视频进度失败")).job;
          }));
          if (!active) return;
          const updates = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
          jobs = mergeJobs(projectId, jobs, updates);
          const failure = results.find((result) => result.status === "rejected");
          publish(failure?.status === "rejected" ? userFacingError(failure.reason, "暂时无法读取视频进度，请稍后刷新。") : "");
        }
      } catch (reason) {
        if (active) publish(userFacingError(reason, "暂时无法读取项目视频，请稍后刷新。"));
      } finally {
        running = false;
        if (active && queuedListRead) { queuedListRead = false; void refresh(true); }
      }
    }

    publish();
    void refresh(true);
    const pollTimer = window.setInterval(() => void refresh(false), 5000);
    const listTimer = window.setInterval(() => void refresh(true), 30_000);
    const onFocus = () => void refresh(true);
    refreshRef.current = onFocus;
    recoverRef.current = (id) => {
      const job = jobs.find((item) => item.id === id);
      if (!job?.supplierTaskId) { void refresh(true); return; }
      void (async () => {
        try {
          const response = await fetchWithTimeout(`/api/video-jobs/${encodeURIComponent(id)}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
            body: JSON.stringify({ action: job.canRetrySave ? "retry-save" : "refresh" }),
          }, 165_000);
          const data = await readApiJson<{ job: VideoJob }>(response, "恢复视频任务失败");
          if (!active) return;
          jobs = mergeJobs(projectId, jobs, [data.job]); publish();
        } catch (reason) { if (active) publish(userFacingError(reason, "恢复视频任务失败")); }
      })();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(pollTimer);
      window.clearInterval(listTimer);
      window.removeEventListener("focus", onFocus);
      if (refreshRef.current === onFocus) refreshRef.current = () => {};
      recoverRef.current = () => {};
    };
  }, [projectId, refreshKey, submittedJob, enabled]);

  const jobs = mergeJobs(projectId, state.projectId === projectId ? state.jobs : [], submittedJob ? [submittedJob] : []);
  const error = state.projectId === projectId ? state.error : "";
  return { jobs: enabled ? jobs : [], error: enabled ? error : "", refresh: () => refreshRef.current(), refreshJob: (id: string) => recoverRef.current(id) };
}

export function ProjectVideoCard({ job, onOpenSource, onRefresh }: { job: VideoJob; onOpenSource?: (id: string) => void; onRefresh?: () => void }) {
  return <article className={styles.card} data-video-job-id={job.id}>
    <div className={styles.title}><strong><Film size={15} /> {title(job)} · {job.duration} 秒</strong><span className={styles.status} role="status">{pending(job) && <LoaderCircle size={13} className={styles.spin} />}{job.canRetrySave ? "视频已生成，待保存" : statusLabels[job.status]}{onRefresh && <button type="button" className={styles.refresh} onClick={onRefresh} title="刷新视频进度" aria-label="刷新视频进度"><RefreshCw size={13} /></button>}</span></div>
    <div className={styles.source}><span title={job.sourceName}>原图：{job.sourceName}</span>{onOpenSource && <button type="button" onClick={() => onOpenSource(job.sourceAssetId)}>查看原图</button>}</div>
    {job.providerName && <p className={styles.hint}>生成供应商：{job.providerName}</p>}
    {job.status === "submitting" && <p className={styles.hint}>正在上传、校验原图并提交视频任务。</p>}
    {["queued", "running", "saving"].includes(job.status) && <p className={styles.hint}>视频进度会在这里自动更新，完成后可直接播放。</p>}
    {job.warning && <p className={styles.error} role="status">{job.warning}</p>}
    {job.error && <p className={styles.error}>{videoJobErrorMessage(job.error)}</p>}
    {job.canRetrySave && onRefresh && <button type="button" className={styles.download} onClick={onRefresh}><RefreshCw size={15} />重新保存已有视频</button>}
    {job.url && <><video className={styles.video} controls playsInline preload="metadata" src={appPath(job.url)} aria-label={title(job) + "，原图" + job.sourceName} /><a className={styles.download} href={appPath(job.url)} download><Download size={15} />下载视频 MP4</a></>}
  </article>;
}

/** Also retained for callers that only need a video history panel. */
export function ProjectVideoFeed(props: ProjectVideoFeedProps) {
  const { jobs, error, refresh, refreshJob } = useProjectVideoFeed(props);
  if (!jobs.length && !error) return null;
  return <section className={styles.feed} aria-label="项目视频">
    <header className={styles.header}><h3><Film size={17} /> 项目视频</h3><button type="button" onClick={refresh}><RefreshCw size={14} />刷新进度</button></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {jobs.map((job) => <ProjectVideoCard key={job.id} job={job} onOpenSource={props.onOpenSource} onRefresh={() => refreshJob(job.id)} />)}
  </section>;
}
