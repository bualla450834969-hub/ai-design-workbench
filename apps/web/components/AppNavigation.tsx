"use client";

import { useState } from "react";

type TabId = "generate" | "results" | "history" | "settings";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "generate", label: "生成", icon: "✦" },
  { id: "results", label: "结果", icon: "▢" },
  { id: "history", label: "历史", icon: "◷" },
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
      {/* 移动端：底部 Tab 栏 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur-lg pb-safe xl:hidden">
        <div className="flex items-center justify-around">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs transition-colors ${
                activeTab === tab.id
                  ? "text-brand-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* 桌面端：左侧边栏 */}
      <aside className="hidden xl:flex xl:w-56 xl:flex-col xl:fixed xl:left-0 xl:top-0 xl:bottom-0 xl:border-r xl:border-gray-200 xl:bg-white xl:p-4">
        <div className="mb-8 px-2">
          <h1 className="text-lg font-bold text-gray-900">AI 设计工作台</h1>
          <p className="text-xs text-gray-500 mt-1">产品外观重构</p>
        </div>
        <div className="flex flex-col gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                activeTab === tab.id
                  ? "bg-brand-50 text-brand-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
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
