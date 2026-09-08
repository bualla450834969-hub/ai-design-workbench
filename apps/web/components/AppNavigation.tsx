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
      <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe lg:hidden">
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
      <aside className="hidden lg:flex lg:w-56 lg:flex-col lg:fixed lg:left-4 lg:top-4 lg:bottom-4 lg:rounded-2xl lg:bg-white/[0.06] lg:backdrop-blur-2xl lg:border lg:border-white/10 lg:shadow-xl lg:p-5 lg:z-40">
        <div className="mb-8 px-2">
          <div className="flex items-center gap-3">
            {/* 六边形全息 logo */}
            <div className="relative w-10 h-7 shrink-0">
              <svg viewBox="0 0 369.53 247.87" className="w-full h-full">
                <defs>
                  <linearGradient id="sidebar-holo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                    <stop offset="25%" stopColor="rgba(180,210,255,0.9)" />
                    <stop offset="50%" stopColor="rgba(255,180,210,0.85)" />
                    <stop offset="75%" stopColor="rgba(180,255,210,0.9)" />
                    <stop offset="100%" stopColor="rgba(210,180,255,0.95)" />
                  </linearGradient>
                  <linearGradient id="sidebar-rainbow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ff6b6b" stopOpacity="0.6" />
                    <stop offset="20%" stopColor="#ffd93d" stopOpacity="0.6" />
                    <stop offset="40%" stopColor="#6bcb77" stopOpacity="0.6" />
                    <stop offset="60%" stopColor="#4d96ff" stopOpacity="0.6" />
                    <stop offset="80%" stopColor="#9b59b6" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="#ff6b6b" stopOpacity="0.6" />
                  </linearGradient>
                  <clipPath id="sidebar-hex-clip">
                    <g transform="translate(-229.94 -109.41)">
                      <path d="M243.31,288.55h42.82c4.49,0,8.71-2.18,11.31-5.84l115.29-162.35c3.26-4.59-0.02-10.95-5.65-10.95h-45.96c-6.74,0-13.06,3.26-16.96,8.76L234.83,272.12C229.94,279.01,234.86,288.55,243.31,288.55z" />
                      <path d="M398.58,357.28h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92c-3.24-4.59,0.04-10.93,5.67-10.93h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92C407.49,350.94,404.2,357.28,398.58,357.28z" />
                      <path d="M586.1,178.14h-42.82c-4.49,0-8.71,2.18-11.31,5.84L416.67,346.33c-3.26,4.59,0.02,10.95,5.65,10.95h45.96c6.74,0,13.06-3.26,16.96-8.76l109.33-153.95C599.47,187.68,594.55,178.14,586.1,178.14z" />
                      <path d="M430.83,109.41h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92c3.24,4.59-0.04,10.93-5.67,10.93h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92C421.93,115.75,425.21,109.41,430.83,109.41z" />
                    </g>
                  </clipPath>
                </defs>
                <g clipPath="url(#sidebar-hex-clip)">
                  <rect width="369.53" height="247.87" fill="url(#sidebar-holo-grad)" />
                  <rect width="369.53" height="247.87" fill="url(#sidebar-rainbow-grad)" className="animate-holographic-spin" style={{ transformOrigin: 'center' }} />
                </g>
                <g transform="translate(-229.94 -109.41)" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
                  <path d="M243.31,288.55h42.82c4.49,0,8.71-2.18,11.31-5.84l115.29-162.35c3.26-4.59-0.02-10.95-5.65-10.95h-45.96c-6.74,0-13.06,3.26-16.96,8.76L234.83,272.12C229.94,279.01,234.86,288.55,243.31,288.55z" />
                  <path d="M398.58,357.28h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92c-3.24-4.59,0.04-10.93,5.67-10.93h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92C407.49,350.94,404.2,357.28,398.58,357.28z" />
                  <path d="M586.1,178.14h-42.82c-4.49,0-8.71,2.18-11.31,5.84L416.67,346.33c-3.26,4.59,0.02,10.95,5.65,10.95h45.96c6.74,0,13.06-3.26,16.96-8.76l109.33-153.95C599.47,187.68,594.55,178.14,586.1,178.14z" />
                  <path d="M430.83,109.41h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92c3.24,4.59-0.04,10.93-5.67,10.93h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92C421.93,115.75,425.21,109.41,430.83,109.41z" />
                </g>
              </svg>
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="text-base font-bold text-white leading-tight">AI 设计工作台</h1>
              <p className="text-xs text-white/50 mt-0.5 leading-tight">产品外观重构</p>
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
              <span className="text-base w-5 text-center leading-none">{tab.icon}</span>
              <span className="leading-none">{tab.label}</span>
            </button>
          ))}
        </div>
      </aside>
    </>
  );
}

export type { TabId };
