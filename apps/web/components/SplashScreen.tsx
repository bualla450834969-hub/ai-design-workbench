"use client";

import { useEffect, useRef, useState } from "react";

interface SplashScreenProps {
  onComplete: () => void;
}

// Logo 边界框（来自原始 841.89×595.28 viewBox）
const LOGO_BOX = { x: 229.94, y: 109.41, w: 369.53, h: 247.87 };

// Logo 填充蒙版 SVG data URL
const LOGO_MASK_FILL = `url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20369.53%20247.87%22%3E%3Cg%20transform%3D%22translate(-229.94%20-109.41)%22%3E%3Cpath%20d%3D%22M243.31%2C288.55h42.82c4.49%2C0%2C8.71-2.18%2C11.31-5.84l115.29-162.35c3.26-4.59-0.02-10.95-5.65-10.95h-45.96c-6.74%2C0-13.06%2C3.26-16.96%2C8.76L234.83%2C272.12C229.94%2C279.01%2C234.86%2C288.55%2C243.31%2C288.55z%22%20fill%3D%22white%22%2F%3E%3Cpath%20d%3D%22M398.58%2C357.28h-49.56c-4.51%2C0-8.73-2.19-11.33-5.87l-36.66-51.92c-3.24-4.59%2C0.04-10.93%2C5.67-10.93h49.56c4.51%2C0%2C8.73%2C2.19%2C11.33%2C5.87l36.66%2C51.92C407.49%2C350.94%2C404.2%2C357.28%2C398.58%2C357.28z%22%20fill%3D%22white%22%2F%3E%3Cpath%20d%3D%22M586.1%2C178.14h-42.82c-4.49%2C0-8.71%2C2.18-11.31%2C5.84L416.67%2C346.33c-3.26%2C4.59%2C0.02%2C10.95%2C5.65%2C10.95h45.96c6.74%2C0%2C13.06-3.26%2C16.96-8.76l109.33-153.95C599.47%2C187.68%2C594.55%2C178.14%2C586.1%2C178.14z%22%20fill%3D%22white%22%2F%3E%3Cpath%20d%3D%22M430.83%2C109.41h49.56c4.51%2C0%2C8.73%2C2.19%2C11.33%2C5.87l36.66%2C51.92c3.24%2C4.59-0.04%2C10.93-5.67%2C10.93h-49.56c-4.51%2C0-8.73-2.19-11.33-5.87l-36.66-51.92C421.93%2C115.75%2C425.21%2C109.41%2C430.83%2C109.41z%22%20fill%3D%22white%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E")`;

// Logo 描边蒙版 SVG data URL
const LOGO_MASK_STROKE = `url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20369.53%20247.87%22%3E%3Cg%20transform%3D%22translate(-229.94%20-109.41)%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%224.5%22%20stroke-linejoin%3D%22round%22%20stroke-linecap%3D%22round%22%3E%3Cpath%20d%3D%22M243.31%2C288.55h42.82c4.49%2C0%2C8.71-2.18%2C11.31-5.84l115.29-162.35c3.26-4.59-0.02-10.95-5.65-10.95h-45.96c-6.74%2C0-13.06%2C3.26-16.96%2C8.76L234.83%2C272.12C229.94%2C279.01%2C234.86%2C288.55%2C243.31%2C288.55z%22%2F%3E%3Cpath%20d%3D%22M398.58%2C357.28h-49.56c-4.51%2C0-8.73-2.19-11.33-5.87l-36.66-51.92c-3.24-4.59%2C0.04-10.93%2C5.67-10.93h49.56c4.51%2C0%2C8.73%2C2.19%2C11.33%2C5.87l36.66%2C51.92C407.49%2C350.94%2C404.2%2C357.28%2C398.58%2C357.28z%22%2F%3E%3Cpath%20d%3D%22M586.1%2C178.14h-42.82c-4.49%2C0-8.71%2C2.18-11.31%2C5.84L416.67%2C346.33c-3.26%2C4.59%2C0.02%2C10.95%2C5.65%2C10.95h45.96c6.74%2C0%2C13.06-3.26%2C16.96-8.76l109.33-153.95C599.47%2C187.68%2C594.55%2C178.14%2C586.1%2C178.14z%22%2F%3E%3Cpath%20d%3D%22M430.83%2C109.41h49.56c4.51%2C0%2C8.73%2C2.19%2C11.33%2C5.87l36.66%2C51.92c3.24%2C4.59-0.04%2C10.93-5.67%2C10.93h-49.56c-4.51%2C0-8.73-2.19-11.33-5.87l-36.66-51.92C421.93%2C115.75%2C425.21%2C109.41%2C430.83%2C109.41z%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E")`;

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const edgeCanvasRef = useRef<HTMLCanvasElement>(null);
  const dupContainerRef = useRef<HTMLDivElement>(null);
  const logoGlassRef = useRef<HTMLDivElement>(null);
  const logoClipGRef = useRef<SVGGElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const edgeCanvas = edgeCanvasRef.current;
    const dupContainer = dupContainerRef.current;
    const logoGlass = logoGlassRef.current;
    const logoClipG = logoClipGRef.current;

    if (!video || !canvas || !edgeCanvas || !dupContainer || !logoGlass) return;

    const ctx = canvas.getContext("2d");
    const edgeCtx = edgeCanvas.getContext("2d");
    if (!ctx || !edgeCtx) return;

    let lastViewportW = 0;
    let lastViewportH = 0;
    let lastEdgeW = 0;
    let lastEdgeH = 0;
    let animationId: number;

    // 鼠标跟随效果
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;
    const MOUSE_DISTORTION_AMOUNT = 32;
    const MOUSE_DISTORTION_SCALE = 1.12;
    const MOUSE_LERP = 0.12;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = logoGlass.getBoundingClientRect();
      const overLogo = e.clientX >= rect.left && e.clientX <= rect.right &&
                       e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!overLogo) {
        targetX = 0;
        targetY = 0;
        return;
      }
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const nx = (e.clientX - cx) / (rect.width / 2);
      const ny = (e.clientY - cy) / (rect.height / 2);
      targetX = nx * MOUSE_DISTORTION_AMOUNT;
      targetY = ny * MOUSE_DISTORTION_AMOUNT;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!e.touches[0]) return;
      const rect = logoGlass.getBoundingClientRect();
      const overLogo = e.touches[0].clientX >= rect.left && e.touches[0].clientX <= rect.right &&
                       e.touches[0].clientY >= rect.top && e.touches[0].clientY <= rect.bottom;
      if (!overLogo) {
        targetX = 0;
        targetY = 0;
        return;
      }
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const nx = (e.touches[0].clientX - cx) / (rect.width / 2);
      const ny = (e.touches[0].clientY - cy) / (rect.height / 2);
      targetX = nx * MOUSE_DISTORTION_AMOUNT;
      targetY = ny * MOUSE_DISTORTION_AMOUNT;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("touchmove", handleTouchMove, { passive: true });

    // 更新 logo clipPath
    const updateLogoClip = () => {
      if (!logoClipG || !logoGlass) return;
      const rect = logoGlass.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const sx = rect.width / LOGO_BOX.w;
      const sy = rect.height / LOGO_BOX.h;
      logoClipG.setAttribute("transform", `scale(${sx} ${sy}) translate(${-LOGO_BOX.x} ${-LOGO_BOX.y})`);
    };

    // 主动画循环
    const frame = () => {
      updateLogoClip();

      const vw = document.documentElement.clientWidth;
      const vh = document.documentElement.clientHeight;

      if (!video.videoWidth || !video.videoHeight) {
        animationId = requestAnimationFrame(frame);
        return;
      }

      // 计算 object-fit: cover 裁剪
      const cover = Math.max(vw / video.videoWidth, vh / video.videoHeight);
      const sw = vw / cover;
      const sh = vh / cover;
      const sx = (video.videoWidth - sw) / 2;
      const sy = (video.videoHeight - sh) / 2;

      // 主 logo canvas
      const rect = logoGlass.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        dupContainer.style.left = `${-rect.left}px`;
        dupContainer.style.top = `${-rect.top}px`;
        dupContainer.style.width = `${vw}px`;
        dupContainer.style.height = `${vh}px`;

        if (vw !== lastViewportW || vh !== lastViewportH) {
          canvas.width = vw;
          canvas.height = vh;
          lastViewportW = vw;
          lastViewportH = vh;
        }

        try {
          ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        } catch (err) {
          // 帧未就绪
        }
      }

      // Logo 边缘 canvas（水平镜像）
      const edgeRect = edgeCanvas.getBoundingClientRect();
      if (edgeRect.width > 0 && edgeRect.height > 0) {
        if (edgeRect.width !== lastEdgeW || edgeRect.height !== lastEdgeH) {
          edgeCanvas.width = Math.round(edgeRect.width);
          edgeCanvas.height = Math.round(edgeRect.height);
          lastEdgeW = edgeRect.width;
          lastEdgeH = edgeRect.height;
        }
        try {
          edgeCtx.save();
          edgeCtx.translate(edgeCanvas.width, 0);
          edgeCtx.scale(-1, 1);
          edgeCtx.drawImage(video, 0, 0, edgeCanvas.width, edgeCanvas.height);
          edgeCtx.restore();
        } catch (err) {
          // 帧未就绪
        }
      }

      // 鼠标跟随
      mouseX += (targetX - mouseX) * MOUSE_LERP;
      mouseY += (targetY - mouseY) * MOUSE_LERP;
      canvas.style.transform = `translate(${mouseX.toFixed(2)}px, ${mouseY.toFixed(2)}px) scale(${MOUSE_DISTORTION_SCALE})`;

      animationId = requestAnimationFrame(frame);
    };

    animationId = requestAnimationFrame(frame);

    // 2.5 秒后开始淡出，3 秒后完成
    const fadeTimer = setTimeout(() => setIsVisible(false), 2500);
    const completeTimer = setTimeout(() => onComplete(), 3100);

    return () => {
      cancelAnimationFrame(animationId);
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("touchmove", handleTouchMove);
    };
  }, [onComplete]);

  return (
    <div
      className={`fixed inset-0 bg-black overflow-hidden transition-opacity duration-500 z-50 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* SVG 滤镜定义 */}
      <svg className="absolute w-0 h-0" aria-hidden="true">
        <defs>
          <filter
            id="liquid-glass-refraction"
            x="-30%" y="-30%" width="160%" height="160%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.015" numOctaves="3" result="noise" />
            <feColorMatrix in="SourceAlpha" type="matrix" result="boosted_alpha"
              values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 100 0" />
            <feGaussianBlur in="boosted_alpha" stdDeviation="45" result="blurred_alpha" />
            <feComponentTransfer in="blurred_alpha" result="edge_mask">
              <feFuncA type="linear" slope="-1.3" intercept="1" />
            </feComponentTransfer>
            <feComposite in="noise" in2="edge_mask" operator="arithmetic"
                         k1="1" k2="0" k3="0" k4="0" result="masked_noise" />
            <feDisplacementMap in="SourceGraphic" in2="masked_noise" scale="65"
                               xChannelSelector="R" yChannelSelector="G" result="red_displaced" />
            <feColorMatrix in="red_displaced" type="matrix" result="red"
              values="1 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 1 0" />
            <feDisplacementMap in="SourceGraphic" in2="masked_noise" scale="56"
                               xChannelSelector="R" yChannelSelector="G" result="green_displaced" />
            <feColorMatrix in="green_displaced" type="matrix" result="green"
              values="0 0 0 0 0
                      0 1 0 0 0
                      0 0 0 0 0
                      0 0 0 1 0" />
            <feDisplacementMap in="SourceGraphic" in2="masked_noise" scale="47"
                               xChannelSelector="R" yChannelSelector="G" result="blue_displaced" />
            <feColorMatrix in="blue_displaced" type="matrix" result="blue"
              values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 1 0 0
                      0 0 0 1 0" />
            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="chromatic_dispersion" />
          </filter>
          <clipPath id="logo-clip" clipPathUnits="userSpaceOnUse">
            <g ref={logoClipGRef}>
              <path d="M243.31,288.55h42.82c4.49,0,8.71-2.18,11.31-5.84l115.29-162.35c3.26-4.59-0.02-10.95-5.65-10.95h-45.96c-6.74,0-13.06,3.26-16.96,8.76L234.83,272.12C229.94,279.01,234.86,288.55,243.31,288.55z" />
              <path d="M398.58,357.28h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92c-3.24-4.59,0.04-10.93,5.67-10.93h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92C407.49,350.94,404.2,357.28,398.58,357.28z" />
              <path d="M586.1,178.14h-42.82c-4.49,0-8.71,2.18-11.31,5.84L416.67,346.33c-3.26,4.59,0.02,10.95,5.65,10.95h45.96c6.74,0,13.06-3.26,16.96-8.76l109.33-153.95C599.47,187.68,594.55,178.14,586.1,178.14z" />
              <path d="M430.83,109.41h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92c3.24,4.59-0.04,10.93-5.67,10.93h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92C421.93,115.75,425.21,109.41,430.83,109.41z" />
            </g>
          </clipPath>
        </defs>
      </svg>

      {/* 背景视频 */}
      <video
        ref={videoRef}
        className="fixed inset-0 w-full h-full object-cover z-0 pointer-events-none"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260816_125506_3a597378-ec85-4ebd-bd22-03b45508ac62.mp4"
      />

      {/* 黑色遮罩 */}
      <div className="absolute inset-0 bg-black z-[1] pointer-events-none" />

      {/* Logo 玻璃效果 */}
      <div
        ref={logoGlassRef}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[2] pointer-events-none"
        style={{
          width: "min(80vw, 820px)",
          height: "min(53.7vw, 550px)",
          WebkitMaskImage: LOGO_MASK_FILL,
          maskImage: LOGO_MASK_FILL,
          WebkitMaskSize: "100% 100%",
          maskSize: "100% 100%",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          animation: "logo-glass-in 1100ms cubic-bezier(0.16, 1, 0.3, 1) both",
        }}
      >
        <div ref={dupContainerRef} className="absolute left-0 top-0 z-0 overflow-hidden pointer-events-none">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ filter: "url(#liquid-glass-refraction)" }}
          />
        </div>
        {/* Logo 边缘层 */}
        <div
          className="absolute inset-0 z-[1] pointer-events-none"
          style={{
            WebkitMaskImage: LOGO_MASK_STROKE,
            maskImage: LOGO_MASK_STROKE,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
          }}
        >
          <canvas ref={edgeCanvasRef} className="absolute inset-0 w-full h-full" />
        </div>
        {/* 磨砂层 */}
        <div
          className="absolute inset-0 z-[2] pointer-events-none"
          style={{
            background: "rgba(255, 255, 255, 0.06)",
            boxShadow: "inset 0 2px 3px rgba(255, 255, 255, 0.35), inset 0 -1.5px 2px rgba(0, 0, 0, 0.12)",
          }}
        />
      </div>

      {/* 品牌文字 */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[3] text-center pointer-events-none">
        <h1 className="text-xl font-light text-white/80 tracking-[0.4em] mb-2">PYRALUMA</h1>
        <p className="text-[10px] text-white/30 tracking-[0.3em]">AI DESIGN WORKBENCH</p>
      </div>

      {/* 加载进度条 */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-48 z-[3]">
        <div className="h-[2px] bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-white/40 to-white/80 rounded-full"
            style={{ animation: "splash-progress 2.5s ease-out forwards" }}
          />
        </div>
        <p className="text-center text-[10px] text-white/20 mt-3 tracking-widest">LOADING...</p>
      </div>

      <style jsx>{`
        @keyframes logo-glass-in {
          from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes splash-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
}
