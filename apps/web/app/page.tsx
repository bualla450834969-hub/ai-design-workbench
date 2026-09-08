"use client";

import { useState, useCallback } from "react";
import AppNavigation, { type TabId } from "@/components/AppNavigation";
import GeneratePanel from "@/components/GeneratePanel";
import ResultsPanel from "@/components/ResultsPanel";
import HistoryPanel from "@/components/HistoryPanel";
import FavoritesPanel from "@/components/FavoritesPanel";
import SettingsPanel from "@/components/SettingsPanel";
import { ToastProvider } from "@/components/Toast";
import type { ResultCard, GenerationState, PendingGenerateConfig, BatchResultGroup } from "@/types";

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
  const [batchResults, setBatchResults] = useState<BatchResultGroup[]>([]);

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

  return (
    <ToastProvider>
    <div className="min-h-screen bg-gray-50">
      <AppNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="pb-20 xl:pl-56">
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-lg xl:hidden">
          <div className="flex h-14 items-center justify-center px-4">
            <h1 className="text-base font-semibold text-gray-900">
              {activeTab === "generate" && "新建生成"}
              {activeTab === "results" && "生成结果"}
              {activeTab === "history" && "历史记录"}
              {activeTab === "favorites" && "我的收藏"}
              {activeTab === "settings" && "设置"}
            </h1>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-4 py-6 xl:max-w-5xl xl:py-8">
          {activeTab === "generate" && (
            <GeneratePanel
              generation={generation}
              setGeneration={setGeneration}
              onComplete={handleGenerationComplete}
              onBatchComplete={handleBatchComplete}
              pendingConfig={pendingConfig}
              onConfigApplied={() => setPendingConfig(null)}
            />
          )}
          {activeTab === "results" && (
            <ResultsPanel
              cards={generation.cards}
              batchGroups={batchResults}
              isGenerating={generation.isGenerating}
              context={generation.context}
            />
          )}
          {activeTab === "history" && (
            <HistoryPanel
              onReuseConfig={(config) => {
                setPendingConfig(config);
                setActiveTab("generate");
              }}
            />
          )}
          {activeTab === "favorites" && <FavoritesPanel />}
          {activeTab === "settings" && <SettingsPanel />}
        </div>
      </main>
    </div>
    </ToastProvider>
  );
}
