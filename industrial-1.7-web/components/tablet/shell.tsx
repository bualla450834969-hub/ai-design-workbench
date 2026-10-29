"use client";

import { useEffect, useState } from "react";
import { readyModelProvider } from "@/lib/provider-onboarding";
import { localJson } from "@/lib/tablet-client";
import type { Project } from "@/types/domain";
import { ActivateStep, ModelStep, ProjectStep } from "./onboarding";
import { Workbench } from "./workbench";

type Phase = "loading" | "activate" | "model" | "project" | "workbench";

export function TabletApp() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [project, setProject] = useState<Project | null>(null);
  const [notice, setNotice] = useState("");

  async function enterWorkspace() {
    const listed = await localJson<{ projects: Project[] }>("/api/projects");
    const first = listed.projects[0];
    if (!first) {
      setProject(null);
      setPhase("project");
      return;
    }
    setProject(first);
    setPhase("workbench");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await fetch("/api/web/auth/status", { cache: "no-store", credentials: "same-origin" });
        if (!status.ok) {
          if (!cancelled) setPhase("activate");
          return;
        }
        const providers = await localJson<{ providers: DesktopProvider[] }>("/api/web/providers");
        if (cancelled) return;
        if (!readyModelProvider(providers.providers)) {
          setPhase("model");
          return;
        }
        await enterWorkspace();
      } catch (cause) {
        if (!cancelled) {
          setNotice(cause instanceof Error ? cause.message : "工作台加载失败");
          setPhase("activate");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (phase === "loading") {
    return <div className="ida-loading">正在读取本机工作台…</div>;
  }
  if (phase === "activate") {
    return (
      <>
        {notice ? <div className="ida-banner" role="status">{notice}</div> : null}
        <ActivateStep onActivated={() => { setNotice(""); setPhase("model"); }} />
      </>
    );
  }
  if (phase === "model") {
    return (
      <>
        {notice ? <div className="ida-banner" role="status">{notice}</div> : null}
        <ModelStep onReady={() => void enterWorkspace().catch((cause: unknown) => setNotice(cause instanceof Error ? cause.message : "读取项目失败"))} onBack={project ? () => setPhase("workbench") : undefined} />
      </>
    );
  }
  if (phase === "project" || !project) {
    return <ProjectStep onCreated={(created) => { setProject(created); setPhase("workbench"); }} />;
  }
  return (
    <Workbench
      initialProject={project}
      onEditModel={() => setPhase("model")}
      onLoggedOut={() => { setProject(null); setPhase("activate"); }}
    />
  );
}
