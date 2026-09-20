"use client";

import { useState, useEffect } from "react";

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
  // 品牌区轮播：logo 和文字交替显示
  const [brandSlide, setBrandSlide] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setBrandSlide((prev) => (prev + 1) % 2);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

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
        <div className="mb-8 px-2 h-24 flex items-center justify-center">
          {/* 品牌区轮播 */}
          <div className="relative w-full h-full">
            {/* Slide 1: Logo */}
            <div
              className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ${
                brandSlide === 0
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-90 pointer-events-none"
              }`}
            >
              <img src="/logo.svg" alt="璃火矩创" className="w-16 h-16 object-contain" />
            </div>
            {/* Slide 2: 文字 */}
            <div
              className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-700 ${
                brandSlide === 1
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-90 pointer-events-none"
              }`}
            >
              <h1 className="text-xl font-bold text-white tracking-widest">璃火矩创</h1>
              <p className="text-xs text-white/50 mt-1 tracking-[0.3em]">工业设计AI</p>
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
