"use client";

import { useState } from "react";

type TabId = "generate" | "results" | "history" | "favorites" | "settings";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "generate", label: "生成", icon: "✦" },
  { id: "results", label: "结果", icon: "▢" },
  { id: "history", label: "历史", icon: "◷" },
  { id: "favorites", label: "收藏", icon: "★" },
  { id: "settings", label: "设置", icon: "⚙" },
];

/**
 * 底部 Tab 导航（移动端）/ 侧边栏（桌面端）
 * 移动优先：默认底部 Tab，xl 断点以上转为左侧边栏
 */
export default function AppNavigation({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  return (
    <>
      {/* 移动端：底部 Tab 栏 - 毛玻璃 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe xl:hidden">
        <div className="mx-3 mb-3 rounded-2xl bg-white/[0.06] backdrop-blur-2xl border border-white/10 shadow-lg">
          <div className="flex items-center justify-around px-2 py-1.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 rounded-xl transition-all duration-200 ${
                  activeTab === tab.id
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:text-white/80"
                }`}
              >
                <span className="text-lg">{tab.icon}</span>
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* 桌面端：左侧边栏 - 毛玻璃 */}
      <aside className="hidden xl:flex xl:w-56 xl:flex-col xl:fixed xl:left-4 xl:top-4 xl:bottom-4 xl:rounded-2xl xl:bg-white/[0.06] xl:backdrop-blur-2xl xl:border xl:border-white/10 xl:shadow-xl xl:p-5 xl:z-40">
        <div className="mb-8 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white text-lg border border-white/10">
              ✦
            </div>
            <div>
              <h1 className="text-base font-bold text-white">AI 设计工作台</h1>
              <p className="text-xs text-white/50 mt-0.5">产品外观重构</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-white/10 text-white font-medium"
                  : "text-white/60 hover:bg-white/5 hover:text-white/80"
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

export type { TabId };
