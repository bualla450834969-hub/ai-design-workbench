"use client";

import { useState, useCallback, useEffect, type ReactNode } from "react";
import type { TabId } from "@/components/AppNavigation";
import GeneratePanel from "@/components/GeneratePanel";
import ResultsPanel from "@/components/ResultsPanel";
import HistoryPanel from "@/components/HistoryPanel";
import FavoritesPanel from "@/components/FavoritesPanel";
import SettingsPanel from "@/components/SettingsPanel";
import TabletActivation from "@/components/tablet/TabletActivation";
import TabletModelStep from "@/components/tablet/TabletModelStep";
import TabletProjectStep from "@/components/tablet/TabletProjectStep";
import TabletShell from "@/components/tablet/TabletShell";
import TabletBrand from "@/components/tablet/TabletBrand";
import {
  clearTabletOnboarding,
  isTabletOnboarded,
  loadActiveProjectId,
  loadProjects,
  loadWorkflowId,
  saveWorkflowId,
  selectProject,
  type TabletProject,
} from "@/components/tablet/projects";
import { ToastProvider } from "@/components/Toast";
import { clearLicenseCode, getDeviceId, getLicenseCode } from "@/utils";
import type { ResultCard, GenerationState, PendingGenerateConfig, BatchResultGroup } from "@/types";

type Gate = "loading" | "activate" | "model" | "project" | "app";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabId>("generate");
  const [generation, setGeneration] = useState<GenerationState>({
    isGenerating: false,
    phase: "",
    message: "",
    percent: 0,
    completed: 0,
    total: 0,
    cards: [],
  });
  const [pendingConfig, setPendingConfig] = useState<PendingGenerateConfig>(null);
  const [pendingProductImage, setPendingProductImage] = useState<string | null>(null);
  const [batchResults, setBatchResults] = useState<BatchResultGroup[]>([]);
  const [gate, setGate] = useState<Gate>("loading");
  const [projects, setProjects] = useState<TabletProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState("");
  const [workflowId, setWorkflowId] = useState("appearance");

  useEffect(() => {
    const savedLicense = getLicenseCode();
    const savedProjects = loadProjects();
    setProjects(savedProjects);
    setActiveProjectId(loadActiveProjectId() || savedProjects[0]?.id || "");
    setWorkflowId(loadWorkflowId());

    if (!savedLicense) {
      setGate("activate");
      return;
    }

    let cancelled = false;
    fetch("/api/license/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseCode: savedLicense, deviceId: getDeviceId() }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (cancelled) return;
        if (!result.valid) {
          setGate("activate");
          return;
        }
        setGate(isTabletOnboarded() && savedProjects.length > 0 ? "app" : "model");
      })
      .catch(() => {
        if (!cancelled) setGate("activate");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerationComplete = useCallback((cards: ResultCard[]) => {
    setGeneration((prev) => ({ ...prev, isGenerating: false, cards }));
    setBatchResults([]);
    setActiveTab("results");
  }, []);

  const handleBatchComplete = useCallback((groups: BatchResultGroup[]) => {
    setGeneration((prev) => ({ ...prev, isGenerating: false }));
    setBatchResults(groups);
    setActiveTab("results");
  }, []);

  const handleUseAsOriginal = useCallback((imageUrl: string) => {
    setPendingProductImage(imageUrl);
    setActiveTab("generate");
  }, []);

  const activeProject = projects.find((project) => project.id === activeProjectId) || projects[0];

  let screen: ReactNode;
  if (gate === "loading") {
    screen = (
      <div className="tablet-loading">
        <TabletBrand splash />
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      </div>
    );
  } else if (gate === "activate") {
    screen = <TabletActivation onActivated={() => setGate("model")} />;
  } else if (gate === "model") {
    screen = <TabletModelStep onContinue={() => setGate("project")} onSkip={() => setGate("project")} />;
  } else if (gate === "project") {
    screen = (
      <TabletProjectStep
        onCreated={() => {
          const next = loadProjects();
          setProjects(next);
          setActiveProjectId(loadActiveProjectId() || next[0]?.id || "");
          setGate("app");
        }}
      />
    );
  } else {
    screen = (
      <TabletShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        workflowId={workflowId}
        onWorkflow={(id) => {
          setWorkflowId(id);
          saveWorkflowId(id);
        }}
        projects={projects}
        activeProjectId={activeProject?.id || ""}
        onProjectsChange={(next, activeId) => {
          setProjects(next);
          setActiveProjectId(activeId);
          selectProject(activeId);
        }}
        onOpenSettings={() => setActiveTab("settings")}
        onLogout={() => {
          clearLicenseCode();
          clearTabletOnboarding();
          setGate("activate");
        }}
      >
        <div className={activeTab === "generate" ? "animate-fade-in-up" : "hidden"}>
          <GeneratePanel
            generation={generation}
            setGeneration={setGeneration}
            onComplete={handleGenerationComplete}
            onBatchComplete={handleBatchComplete}
            pendingConfig={pendingConfig}
            onConfigApplied={() => setPendingConfig(null)}
            pendingProductImage={pendingProductImage}
            onProductImageApplied={() => setPendingProductImage(null)}
            workflowId={workflowId}
            projectId={activeProject?.id}
            projectName={activeProject?.name}
          />
        </div>
        <div className={activeTab === "results" ? "animate-fade-in-up" : "hidden"}>
          <ResultsPanel
            cards={generation.cards}
            batchGroups={batchResults}
            isGenerating={generation.isGenerating}
            context={generation.context}
            onUseAsOriginal={handleUseAsOriginal}
          />
        </div>
        <div className={activeTab === "history" ? "animate-fade-in-up" : "hidden"}>
          <HistoryPanel
            visible={activeTab === "history"}
            onReuseConfig={(config) => {
              setPendingConfig(config);
              setActiveTab("generate");
            }}
            onUseAsOriginal={handleUseAsOriginal}
          />
        </div>
        <div className={activeTab === "favorites" ? "animate-fade-in-up" : "hidden"}>
          <FavoritesPanel
            visible={activeTab === "favorites"}
            onUseAsOriginal={handleUseAsOriginal}
          />
        </div>
        <div className={activeTab === "settings" ? "animate-fade-in-up" : "hidden"}>
          <SettingsPanel />
        </div>
      </TabletShell>
    );
  }

  return (
    <ToastProvider>
      <div className="tablet-root">{screen}</div>
    </ToastProvider>
  );
}
