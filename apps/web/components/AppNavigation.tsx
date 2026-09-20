"use client";

import { useState, useEffect, useRef } from "react";

// 六边形渐变玻璃特效 Logo 组件
function HexagonLogoEffect() {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const p = "sb";
    const rgMains = [1, 2, 3, 4].map((i) => document.getElementById(`${p}Main${i}`));
    const rgSubs = [1, 2, 3, 4].map((i) => document.getElementById(`${p}Sub${i}`));
    const glassPaths = Array.from(svg.querySelectorAll("path.sb-glass"));
    if (glassPaths.length === 0) return;

    const vb = svg.viewBox.baseVal;
    const vbX = vb.x, vbY = vb.y, vbW = vb.width, vbH = vb.height;
    let t = Math.random() * Math.PI * 2;

    const blocks: Array<{
      fx: number; fy: number; fx2: number; fy2: number; phase: number;
      breathSpeed: number; breathPhase: number; hueSpeed: number; huePhase: number;
      cx: number; cy: number; mode: string; targetCx: number; targetCy: number;
    }> = [];
    for (let bi = 0; bi < 4; bi++) {
      blocks.push({
        fx: 0.3 + Math.random() * 0.5,
        fy: 0.25 + Math.random() * 0.4,
        fx2: 0.1 + Math.random() * 0.2,
        fy2: 0.15 + Math.random() * 0.25,
        phase: Math.random() * Math.PI * 2,
        breathSpeed: 0.012 + Math.random() * 0.004,
        breathPhase: bi * Math.PI / 2,
        hueSpeed: 0.4 + Math.random() * 0.3,
        huePhase: Math.random() * 360,
        cx: 50, cy: 50, mode: "auto", targetCx: 50, targetCy: 50,
      });
    }

    function mouseToSvgPercent(e: MouseEvent) {
      const pt = svg!.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const ctm = svg!.getScreenCTM();
      if (!ctm) return { x: 50, y: 50 };
      const svgPt = pt.matrixTransform(ctm.inverse());
      return { x: ((svgPt.x - vbX) / vbW) * 100, y: ((svgPt.y - vbY) / vbH) * 100 };
    }

    glassPaths.forEach((path, idx) => {
      path.addEventListener("mouseenter", (e) => {
        blocks[idx].mode = "follow";
        const pp = mouseToSvgPercent(e as MouseEvent);
        blocks[idx].targetCx = pp.x;
        blocks[idx].targetCy = pp.y;
      });
      path.addEventListener("mousemove", (e) => {
        if (blocks[idx].mode === "follow") {
          const pp = mouseToSvgPercent(e as MouseEvent);
          blocks[idx].targetCx = pp.x;
          blocks[idx].targetCy = pp.y;
        }
      });
      path.addEventListener("mouseleave", () => {
        blocks[idx].mode = "auto";
      });
    });

    let rafId: number;
    function animate() {
      t += 0.012;
      for (let ai = 0; ai < 4; ai++) {
        const b = blocks[ai];
        const breath = 0.5 + 0.5 * Math.sin(t * b.breathSpeed * 60 + b.breathPhase);
        const mainR = (40 + breath * 48).toFixed(1) + "%";
        const subR = (25 + breath * 35).toFixed(1) + "%";
        const glowOpacity = (0.03 + breath * 0.85).toFixed(2);

        if (b.mode === "auto") {
          b.targetCx = 50 + Math.sin(t * b.fx + b.phase) * 20 + Math.sin(t * b.fx2 + b.phase * 2) * 8;
          b.targetCy = 50 + Math.cos(t * b.fy + b.phase * 1.5) * 18 + Math.cos(t * b.fy2 + b.phase) * 6;
          b.cx += (b.targetCx - b.cx) * 0.04;
          b.cy += (b.targetCy - b.cy) * 0.04;
        } else {
          b.cx += (b.targetCx - b.cx) * 0.15;
          b.cy += (b.targetCy - b.cy) * 0.15;
        }

        if (rgMains[ai]) {
          rgMains[ai]!.setAttribute("cx", b.cx.toFixed(2) + "%");
          rgMains[ai]!.setAttribute("cy", b.cy.toFixed(2) + "%");
          rgMains[ai]!.setAttribute("r", mainR);
        }
        if (rgSubs[ai]) {
          rgSubs[ai]!.setAttribute("cx", (b.cx + 5).toFixed(2) + "%");
          rgSubs[ai]!.setAttribute("cy", (b.cy - 3).toFixed(2) + "%");
          rgSubs[ai]!.setAttribute("r", subR);
        }

        const mainPath = svg!.querySelector(`.${p}m-${ai + 1}`);
        const subPath = svg!.querySelector(`.${p}s-${ai + 1}`);
        if (mainPath) (mainPath as SVGElement).style.opacity = glowOpacity;
        if (subPath) (subPath as SVGElement).style.opacity = (parseFloat(glowOpacity) * 0.8).toFixed(2);

        const hue = (t * b.hueSpeed * 60 + b.huePhase) % 360;
        if (mainPath) mainPath.setAttribute("filter", `hue-rotate(${hue.toFixed(0)}deg) url(#${p}BlurM)`);
        if (subPath) subPath.setAttribute("filter", `hue-rotate(${hue.toFixed(0)}deg) url(#${p}BlurS)`);
      }
      rafId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <svg ref={svgRef} viewBox="212.9 89.4 403.6 287.9" width="80" height="80" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {[1, 2, 3, 4].map((i) => (
          <g key={i}>
            <radialGradient id={`sbMain${i}`} cx="50%" cy="50%" r="75%">
              <stop offset="0%" stopColor="#409cff" stopOpacity="0.45" />
              <stop offset="35%" stopColor="#af52de" stopOpacity="0.28" />
              <stop offset="65%" stopColor="#af52de" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#af52de" stopOpacity="0" />
            </radialGradient>
            <radialGradient id={`sbSub${i}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ff64aa" stopOpacity="0.26" />
              <stop offset="40%" stopColor="#64d2ff" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#64d2ff" stopOpacity="0" />
            </radialGradient>
          </g>
        ))}
        <filter id="sbBlurM" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <filter id="sbBlurS" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      {/* 主光晕层 */}
      <path className="sbm-1" d="M243.31,288.55h42.82c4.49,0,8.71-2.18,11.31-5.84l115.29-162.35c3.26-4.59-0.02-10.95-5.65-10.95h-45.96c-6.74,0-13.06,3.26-16.96,8.76L234.83,272.12C229.94,279.01,234.86,288.55,243.31,288.55z" fill="url(#sbMain1)" opacity="0.5" filter="url(#sbBlurM)" />
      <path className="sbm-2" d="M398.58,357.28h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92c-3.24-4.59,0.04-10.93,5.67-10.93h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92C407.49,350.94,404.2,357.28,398.58,357.28z" fill="url(#sbMain2)" opacity="0.5" filter="url(#sbBlurM)" />
      <path className="sbm-3" d="M586.1,178.14h-42.82c-4.49,0-8.71,2.18-11.31,5.84L416.67,346.33c-3.26,4.59,0.02,10.95,5.65,10.95h45.96c6.74,0,13.06-3.26,16.96-8.76l109.33-153.95C599.47,187.68,594.55,178.14,586.1,178.14z" fill="url(#sbMain3)" opacity="0.5" filter="url(#sbBlurM)" />
      <path className="sbm-4" d="M430.83,109.41h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92c3.24,4.59-0.04,10.93-5.67,10.93h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92C421.93,115.75,425.21,109.41,430.83,109.41z" fill="url(#sbMain4)" opacity="0.5" filter="url(#sbBlurM)" />
      {/* 次光晕层 */}
      <path className="sbs-1" d="M243.31,288.55h42.82c4.49,0,8.71-2.18,11.31-5.84l115.29-162.35c3.26-4.59-0.02-10.95-5.65-10.95h-45.96c-6.74,0-13.06,3.26-16.96,8.76L234.83,272.12C229.94,279.01,234.86,288.55,243.31,288.55z" fill="url(#sbSub1)" opacity="0.4" filter="url(#sbBlurS)" />
      <path className="sbs-2" d="M398.58,357.28h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92c-3.24-4.59,0.04-10.93,5.67-10.93h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92C407.49,350.94,404.2,357.28,398.58,357.28z" fill="url(#sbSub2)" opacity="0.4" filter="url(#sbBlurS)" />
      <path className="sbs-3" d="M586.1,178.14h-42.82c-4.49,0-8.71,2.18-11.31,5.84L416.67,346.33c-3.26,4.59,0.02,10.95,5.65,10.95h45.96c6.74,0,13.06-3.26,16.96-8.76l109.33-153.95C599.47,187.68,594.55,178.14,586.1,178.14z" fill="url(#sbSub3)" opacity="0.4" filter="url(#sbBlurS)" />
      <path className="sbs-4" d="M430.83,109.41h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92c3.24,4.59-0.04,10.93-5.67,10.93h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92C421.93,115.75,425.21,109.41,430.83,109.41z" fill="url(#sbSub4)" opacity="0.4" filter="url(#sbBlurS)" />
      {/* 玻璃路径（可见形状+鼠标事件） */}
      <path className="sb-glass" d="M243.31,288.55h42.82c4.49,0,8.71-2.18,11.31-5.84l115.29-162.35c3.26-4.59-0.02-10.95-5.65-10.95h-45.96c-6.74,0-13.06,3.26-16.96,8.76L234.83,272.12C229.94,279.01,234.86,288.55,243.31,288.55z" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      <path className="sb-glass" d="M398.58,357.28h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92c-3.24-4.59,0.04-10.93,5.67-10.93h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92C407.49,350.94,404.2,357.28,398.58,357.28z" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      <path className="sb-glass" d="M586.1,178.14h-42.82c-4.49,0-8.71,2.18-11.31,5.84L416.67,346.33c-3.26,4.59,0.02,10.95,5.65,10.95h45.96c6.74,0,13.06-3.26,16.96-8.76l109.33-153.95C599.47,187.68,594.55,178.14,586.1,178.14z" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      <path className="sb-glass" d="M430.83,109.41h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92c3.24,4.59-0.04,10.93-5.67,10.93h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92C421.93,115.75,425.21,109.41,430.83,109.41z" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
    </svg>
  );
}

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "generate", label: "生成", icon: "✦" },
  { id: "results", label: "结果", icon: "▢" },
  { id: "history", label: "历史", icon: "◷" },
  { id: "favorites", label: "收藏", icon: "★" },
  { id: "settings", label: "设置", icon: "⚙" },
];

type TabId = "generate" | "results" | "history" | "favorites" | "settings";

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
            {/* Slide 1: 六边形渐变玻璃特效 Logo */}
            <div
              className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ${
                brandSlide === 0
                  ? "opacity-100 scale-100"
                  : "opacity-0 scale-90 pointer-events-none"
              }`}
            >
              <HexagonLogoEffect />
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
