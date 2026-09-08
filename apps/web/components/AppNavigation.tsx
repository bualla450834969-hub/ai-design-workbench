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
      {/* 移动端：底部 Tab 栏 - 玻璃拟态 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe xl:hidden">
        <div className="mx-3 mb-3 rounded-2xl bg-white/80 backdrop-blur-xl border border-white/50 shadow-lg">
          <div className="flex items-center justify-around px-2 py-1.5">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 rounded-xl transition-all duration-300 ${
                  activeTab === tab.id
                    ? "text-white"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {activeTab === tab.id && (
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 shadow-md" />
                )}
                <span className={`relative text-lg ${activeTab === tab.id ? "drop-shadow-sm" : ""}`}>
                  {tab.icon}
                </span>
                <span className="relative text-xs font-medium">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* 桌面端：左侧边栏 - 玻璃拟态 */}
      <aside className="hidden xl:flex xl:w-60 xl:flex-col xl:fixed xl:left-4 xl:top-4 xl:bottom-4 xl:rounded-2xl xl:bg-white/80 xl:backdrop-blur-xl xl:border xl:border-white/50 xl:shadow-xl xl:p-5 xl:z-40">
        <div className="mb-8 px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-pink-500 flex items-center justify-center text-white text-lg shadow-lg">
              ✦
            </div>
            <div>
              <h1 className="text-base font-bold bg-gradient-to-r from-indigo-600 to-pink-600 bg-clip-text text-transparent">
                AI 设计工作台
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">产品外观重构</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm transition-all duration-300 overflow-hidden ${
                activeTab === tab.id
                  ? "text-white font-medium shadow-md"
                  : "text-gray-600 hover:bg-white/60"
              }`}
            >
              {activeTab === tab.id && (
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-pink-500" />
              )}
              <span className={`relative text-base ${activeTab === tab.id ? "drop-shadow-sm" : ""}`}>
                {tab.icon}
              </span>
              <span className="relative">{tab.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-auto pt-4">
          <div className="rounded-xl bg-gradient-to-br from-indigo-50 to-pink-50 p-3 border border-indigo-100">
            <p className="text-xs text-gray-600 font-medium">💡 小提示</p>
            <p className="text-xs text-gray-500 mt-1">上传清晰的产品图，生成效果更好</p>
          </div>
        </div>
      </aside>
    </>
  );
}

export type { TabId };
