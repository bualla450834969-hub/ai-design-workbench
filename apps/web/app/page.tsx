"use client";

import { useState } from "react";
import AppNavigation, { type TabId } from "@/components/AppNavigation";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabId>("generate");

  return (
    <div className="min-h-screen bg-gray-50">
      <AppNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {/* 主内容区：移动端底部留出 Tab 高度，桌面端左侧留出边栏宽度 */}
      <main className="pb-20 xl:pl-56">
        {/* 移动端顶部栏 */}
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-lg xl:hidden">
          <div className="flex h-14 items-center justify-center px-4">
            <h1 className="text-base font-semibold text-gray-900">
              {activeTab === "generate" && "新建生成"}
              {activeTab === "results" && "生成结果"}
              {activeTab === "history" && "历史记录"}
              {activeTab === "settings" && "设置"}
            </h1>
          </div>
        </header>

        <div className="mx-auto max-w-3xl px-4 py-6 xl:max-w-5xl xl:py-8">
          {activeTab === "generate" && <GeneratePanel />}
          {activeTab === "results" && <ResultsPanel />}
          {activeTab === "history" && <HistoryPanel />}
          {activeTab === "settings" && <SettingsPanel />}
        </div>
      </main>
    </div>
  );
}

/* ---------- 生成面板 ---------- */
function GeneratePanel() {
  const [productName, setProductName] = useState("");
  const [variation, setVariation] = useState(65);
  const [count, setCount] = useState(2);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    setIsGenerating(true);
    // TODO: 调用核心层 API
    setTimeout(() => setIsGenerating(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* 产品图片上传 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">产品图片</h2>
        <div className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 text-gray-400">
          <div className="text-center">
            <div className="text-3xl mb-1">+</div>
            <p className="text-xs">点击上传产品图（最多5张）</p>
          </div>
        </div>
      </section>

      {/* 基础设置 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-900">基础设置</h2>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
            产品名称
          </label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="例如：桌面风扇"
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div>
          <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-gray-600">
            <span>重构比例</span>
            <span className="text-brand-600 font-semibold">{variation}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={variation}
            onChange={(e) => setVariation(Number(e.target.value))}
            className="w-full accent-brand-600"
          />
          <div className="mt-1 flex justify-between text-[10px] text-gray-400">
            <span>保守改款</span>
            <span>造型突破</span>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
            生成数量
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                  count === n
                    ? "bg-brand-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 设计方向 */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">设计方向</h2>
        <div className="grid grid-cols-2 gap-2">
          {["造型突破改款", "功能重构款", "未来概念款", "高端升级款"].map(
            (dir) => (
              <button
                key={dir}
                className="rounded-lg border border-gray-200 px-3 py-2.5 text-left text-xs text-gray-700 hover:border-brand-400 hover:bg-brand-50"
              >
                {dir}
              </button>
            )
          )}
        </div>
      </section>

      {/* 生成按钮 */}
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full rounded-xl bg-brand-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all active:scale-[0.98] disabled:opacity-60"
      >
        {isGenerating ? "生成中..." : "开始生成"}
      </button>
    </div>
  );
}

/* ---------- 结果面板 ---------- */
function ResultsPanel() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 text-5xl text-gray-300">▢</div>
      <h3 className="text-sm font-medium text-gray-600">暂无生成结果</h3>
      <p className="mt-1 text-xs text-gray-400">完成生成后结果将显示在这里</p>
    </div>
  );
}

/* ---------- 历史面板 ---------- */
function HistoryPanel() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 text-5xl text-gray-300">◷</div>
      <h3 className="text-sm font-medium text-gray-600">暂无历史记录</h3>
      <p className="mt-1 text-xs text-gray-400">生成记录将保存在本地</p>
    </div>
  );
}

/* ---------- 设置面板 ---------- */
function SettingsPanel() {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">AI 供应商</h2>
        <div className="space-y-3">
          {[
            { name: "GeekAI (默认)", desc: "推荐，支持 Gemini 画图" },
            { name: "API易", desc: "OpenAI 兼容接口" },
            { name: "AIHubMix", desc: "多模型聚合" },
            { name: "自定义", desc: "任意 OpenAI 兼容接口" },
          ].map((p) => (
            <button
              key={p.name}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-3 text-left hover:border-brand-400"
            >
              <div>
                <div className="text-sm font-medium text-gray-800">{p.name}</div>
                <div className="text-xs text-gray-500">{p.desc}</div>
              </div>
              <span className="text-gray-400">›</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">关于</h2>
        <div className="space-y-2 text-xs text-gray-500">
          <p>核心引擎版本：v1.0.0</p>
          <p>基于 AI-Design-Pro 学习源码重构</p>
          <p>移动优先 · 响应式布局</p>
        </div>
      </section>
    </div>
  );
}
