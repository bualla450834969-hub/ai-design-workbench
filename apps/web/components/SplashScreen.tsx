"use client";

import { useEffect, useState } from "react";

interface SplashScreenProps {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // 进度条动画
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2;
      });
    }, 40);

    // 2.5 秒后开始淡出
    const fadeTimer = setTimeout(() => {
      setIsVisible(false);
    }, 2200);

    // 2.8 秒后完成跳转
    const completeTimer = setTimeout(() => {
      onComplete();
    }, 2800);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(fadeTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div
      className={`min-h-screen bg-black flex flex-col items-center justify-center transition-opacity duration-500 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* 背景光晕 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-600/10 blur-[120px] animate-glow-pulse" />
      </div>

      {/* 全息六边形 Logo */}
      <div className="relative mb-12 animate-float">
        {/* 外发光 */}
        <div className="absolute -inset-8 rounded-full bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 blur-3xl animate-glow-pulse" />
        
        {/* 六边形 SVG */}
        <svg
          width="160"
          height="160"
          viewBox="0 0 200 200"
          className="relative z-10"
        >
          <defs>
            {/* 全息渐变 */}
            <linearGradient id="holographicGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.9)" />
              <stop offset="25%" stopColor="rgba(200,220,255,0.8)" />
              <stop offset="50%" stopColor="rgba(255,200,220,0.7)" />
              <stop offset="75%" stopColor="rgba(200,255,220,0.8)" />
              <stop offset="100%" stopColor="rgba(220,200,255,0.9)" />
            </linearGradient>
            
            {/* 彩虹反光 */}
            <linearGradient id="rainbowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff6b6b" stopOpacity="0.6" />
              <stop offset="20%" stopColor="#ffd93d" stopOpacity="0.6" />
              <stop offset="40%" stopColor="#6bcb77" stopOpacity="0.6" />
              <stop offset="60%" stopColor="#4d96ff" stopOpacity="0.6" />
              <stop offset="80%" stopColor="#9b59b6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#ff6b6b" stopOpacity="0.6" />
            </linearGradient>
            
            {/* 剪切路径 - 六边形 */}
            <clipPath id="hexClip">
              <polygon points="100,10 175,55 175,145 100,190 25,145 25,55" />
            </clipPath>
            
            {/* 内部剪切 - 空心六边形 */}
            <clipPath id="hexInnerClip">
              <polygon points="100,40 145,65 145,135 100,160 55,135 55,65" />
            </clipPath>
          </defs>
          
          {/* 六边形主体 - 由多个片段组成 */}
          <g clipPath="url(#hexClip)">
            {/* 背景 */}
            <rect width="200" height="200" fill="rgba(255,255,255,0.05)" />
            
            {/* 左上片段 */}
            <polygon 
              points="100,10 175,55 100,100 25,55" 
              fill="url(#holographicGrad)" 
              opacity="0.9"
            />
            
            {/* 右上片段 */}
            <polygon 
              points="175,55 175,145 100,100" 
              fill="url(#holographicGrad)" 
              opacity="0.7"
            />
            
            {/* 右下片段 */}
            <polygon 
              points="175,145 100,190 100,100" 
              fill="url(#holographicGrad)" 
              opacity="0.85"
            />
            
            {/* 左下片段 */}
            <polygon 
              points="100,190 25,145 100,100" 
              fill="url(#holographicGrad)" 
              opacity="0.75"
            />
            
            {/* 左片段 */}
            <polygon 
              points="25,145 25,55 100,100" 
              fill="url(#holographicGrad)" 
              opacity="0.8"
            />
            
            {/* 彩虹反光层 */}
            <rect 
              width="200" 
              height="200" 
              fill="url(#rainbowGrad)" 
              opacity="0.3"
              className="animate-holographic-spin"
              style={{ transformOrigin: 'center' }}
            />
            
            {/* 高光 */}
            <polygon 
              points="100,10 175,55 100,100 25,55" 
              fill="white" 
              opacity="0.2"
            />
          </g>
          
          {/* 六边形边框 */}
          <polygon 
            points="100,10 175,55 175,145 100,190 25,145 25,55" 
            fill="none" 
            stroke="rgba(255,255,255,0.3)" 
            strokeWidth="1"
          />
          
          {/* 中心空心 */}
          <polygon 
            points="100,40 145,65 145,135 100,160 55,135 55,65" 
            fill="black" 
            opacity="0.95"
          />
        </svg>
      </div>

      {/* 品牌文字 */}
      <div className="text-center relative z-10">
        <h1 className="text-xl font-light text-white/80 tracking-[0.4em] mb-2">PYRALUMA</h1>
        <p className="text-[10px] text-white/30 tracking-[0.3em]">AI DESIGN WORKBENCH</p>
      </div>

      {/* 加载进度条 */}
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-48">
        <div className="h-[2px] bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 rounded-full transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-[10px] text-white/20 mt-3 tracking-widest">LOADING...</p>
      </div>
    </div>
  );
}
