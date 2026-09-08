"use client";

import { useState, useCallback, useEffect } from "react";
import AppNavigation, { type TabId } from "@/components/AppNavigation";
import GeneratePanel from "@/components/GeneratePanel";
import ResultsPanel from "@/components/ResultsPanel";
import HistoryPanel from "@/components/HistoryPanel";
import FavoritesPanel from "@/components/FavoritesPanel";
import SettingsPanel from "@/components/SettingsPanel";
import LoginPage from "@/components/LoginPage";
import SplashScreen from "@/components/SplashScreen";
import { ToastProvider } from "@/components/Toast";
import { getDeviceId, getLicenseCode } from "@/utils";
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
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [showSplash, setShowSplash] = useState(true);

  // 应用启动时检查授权状态
  useEffect(() => {
    const checkAuth = async () => {
      const savedLicense = getLicenseCode();
      if (!savedLicense) {
        setIsCheckingAuth(false);
        return;
      }

      try {
        const deviceId = getDeviceId();
        const response = await fetch("/api/license/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ licenseCode: savedLicense, deviceId }),
        });
        const data = await response.json();
        setIsAuthorized(data.valid && data.thisDeviceBound);
      } catch {
        setIsAuthorized(false);
      } finally {
        setIsCheckingAuth(false);
      }
    };

    checkAuth();
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

  // 第一步：显示启动页
  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  // 正在检查授权状态，显示加载动画
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="inline-block w-8 h-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80 mb-3" />
          <p className="text-sm text-white/50 tracking-wider">正在验证授权...</p>
        </div>
      </div>
    );
  }

  // 第二步：未授权，显示登录页
  if (!isAuthorized) {
    return (
      <ToastProvider>
        <LoginPage onAuthorized={() => setIsAuthorized(true)} />
      </ToastProvider>
    );
  }

  // 第三步：已授权，显示主界面
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
