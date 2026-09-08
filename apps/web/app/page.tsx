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
    <div className="min-h-screen">
      <AppNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      <main className="pb-24 xl:pl-72">
        {/* 移动端顶部 Header - 毛玻璃 */}
        <header className="sticky top-0 z-40 xl:hidden">
          <div className="mx-3 mt-3 rounded-2xl bg-white/[0.06] backdrop-blur-2xl border border-white/10 shadow-md">
            <div className="flex h-12 items-center justify-center px-4">
              <h1 className="text-base font-semibold text-white">
                {activeTab === "generate" && "新建生成"}
                {activeTab === "results" && "生成结果"}
                {activeTab === "history" && "历史记录"}
                {activeTab === "favorites" && "我的收藏"}
                {activeTab === "settings" && "设置"}
              </h1>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-4 py-5 xl:max-w-5xl xl:py-8 xl:pr-8">
          {activeTab === "generate" && (
            <div className="animate-fade-in-up">
              <GeneratePanel
                generation={generation}
                setGeneration={setGeneration}
                onComplete={handleGenerationComplete}
                onBatchComplete={handleBatchComplete}
                pendingConfig={pendingConfig}
                onConfigApplied={() => setPendingConfig(null)}
              />
            </div>
          )}
          {activeTab === "results" && (
            <div className="animate-fade-in-up">
              <ResultsPanel
                cards={generation.cards}
                batchGroups={batchResults}
                isGenerating={generation.isGenerating}
                context={generation.context}
              />
            </div>
          )}
          {activeTab === "history" && (
            <div className="animate-fade-in-up">
              <HistoryPanel
                onReuseConfig={(config) => {
                  setPendingConfig(config);
                  setActiveTab("generate");
                }}
              />
            </div>
          )}
          {activeTab === "favorites" && (
            <div className="animate-fade-in-up">
              <FavoritesPanel />
            </div>
          )}
          {activeTab === "settings" && (
            <div className="animate-fade-in-up">
              <SettingsPanel />
            </div>
          )}
        </div>
      </main>
    </div>
    </ToastProvider>
  );
}
