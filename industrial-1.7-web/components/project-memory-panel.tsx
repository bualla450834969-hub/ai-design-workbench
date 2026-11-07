"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "@/lib/client-operations";
import { readApiJson } from "@/lib/client-response";
import { userFacingError } from "@/lib/user-facing-error";
import type { Project } from "@/types/domain";
import { useConfirm } from "./confirm-dialog";
import styles from "./project-memory-panel.module.css";

export function ProjectMemoryPanel({ projectId, refreshKey, onUpdated }: {
  projectId: string;
  refreshKey: string;
  onUpdated: (memory: string) => void;
}) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hasNewer, setHasNewer] = useState(false);
  const dirtyRef = useRef(false);
  const projectRef = useRef(projectId);

  useEffect(() => {
    projectRef.current = projectId;
    dirtyRef.current = false;
    setDraft("");
    setSaved("");
    setError("");
    setNotice("");
    setHasNewer(false);
  }, [projectId]);

  useEffect(() => {
    let live = true;
    void fetchWithTimeout(`/api/projects/${encodeURIComponent(projectId)}`, { cache: "no-store" })
      .then((response) => readApiJson<{ project: Project }>(response, "读取项目记忆失败"))
      .then(({ project }) => {
        if (!live || projectRef.current !== projectId) return;
        const memory = project.freeChatMemory || "";
        setSaved(memory);
        if (dirtyRef.current) setHasNewer(true);
        else { setDraft(memory); setHasNewer(false); }
        onUpdated(memory);
      })
      .catch((reason) => { if (live) setError(userFacingError(reason, "读取项目记忆失败")); });
    return () => { live = false; };
  }, [projectId, refreshKey, onUpdated]);

  async function save(memory: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetchWithTimeout(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freeChatMemory: memory }),
      });
      const { project } = await readApiJson<{ project: Project }>(response, "保存项目记忆失败");
      const next = project.freeChatMemory || "";
      setSaved(next);
      setDraft(next);
      dirtyRef.current = false;
      setHasNewer(false);
      setNotice(next ? "项目记忆已保存。" : "项目记忆已清除。后续对话仍会参考最近消息。");
      onUpdated(next);
    } catch (reason) {
      setError(userFacingError(reason, "保存项目记忆失败"));
    } finally { setBusy(false); }
  }

  return <details className={styles.panel}>
    <summary><strong>项目记忆</strong><span>{saved ? "已保存关键设定，可随时修改" : "可记录需要长期遵守的设计要求"}</span></summary>
    <p>仅用于当前项目的自由对话。旧图片仍需在本轮明确添加；请勿在这里填写密钥。</p>
    <textarea aria-label="项目记忆内容" value={draft} maxLength={1800} rows={5} disabled={busy} placeholder="例如：产品是便携咖啡机；保留折叠手柄和双按钮；沿用已确认的银灰色方案。" onChange={(event) => {
      setDraft(event.target.value);
      dirtyRef.current = true;
      setNotice("");
    }} />
    <div className={styles.actions}>
      <small>{draft.length}/1800 字</small>
      {hasNewer && <button type="button" disabled={busy} onClick={() => { setDraft(saved); dirtyRef.current = false; setHasNewer(false); }}>载入最新记忆</button>}
      <button type="button" disabled={busy || !saved} onClick={async () => { if (await confirm("确定清除当前项目的长期记忆吗？已保存的对话记录仍保留。")) await save(""); }}>清除记忆</button>
      <button type="button" className={styles.primary} disabled={busy || draft === saved} onClick={() => void save(draft.trim())}>{busy ? "保存中…" : "保存记忆"}</button>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
  </details>;
}
