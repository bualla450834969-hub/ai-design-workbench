"use client";

import { useState, useEffect } from "react";
import { getDeviceId, getLicenseCode, saveLicenseCode } from "@/utils";

interface LoginPageProps {
  onAuthorized: () => void;
}

export default function LoginPage({ onAuthorized }: LoginPageProps) {
  const [licenseCode, setLicenseCode] = useState(() => getLicenseCode());
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  const [isAutoChecking, setIsAutoChecking] = useState(false);

  // 页面加载时，如果有保存的授权码，自动验证
  useEffect(() => {
    const savedCode = getLicenseCode();
    if (savedCode) {
      setIsAutoChecking(true);
      const deviceId = getDeviceId();
      fetch("/api/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseCode: savedCode, deviceId }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.valid) {
            onAuthorized();
          }
        })
        .catch(() => {})
        .finally(() => setIsAutoChecking(false));
    }
  }, [onAuthorized]);

  const handleVerify = async () => {
    if (!licenseCode.trim()) {
      setError("请输入授权码");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const deviceId = getDeviceId();
      const response = await fetch("/api/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseCode: licenseCode.trim().toUpperCase(), deviceId }),
      });

      const data = await response.json();

      if (data.valid) {
        saveLicenseCode(licenseCode.trim().toUpperCase());
        onAuthorized();
      } else {
        setError(data.message || "授权码无效或已达设备上限");
      }
    } catch (err) {
      setError("验证失败，请检查网络连接");
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    setLicenseCode(text.toUpperCase().trim());
    e.preventDefault();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleVerify();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 login-bg">
      {/* 背景光晕效果 - 增强版 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-[100px] animate-glow-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-pink-600/20 blur-[100px] animate-glow-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-[120px] animate-glow-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* 网格背景 */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '50px 50px'
      }} />

      <div className="w-full max-w-md relative z-10">
        {/* Logo 区域 - 全息六边形 logo（和启动页一致） */}
        <div className="text-center mb-10 animate-float">
          <div className="relative inline-block mb-6" style={{ width: '160px', height: '108px' }}>
            {/* 外发光 */}
            <div className="absolute -inset-6 rounded-full bg-gradient-to-r from-indigo-500/30 via-purple-500/30 to-pink-500/30 blur-3xl animate-glow-pulse" />
            {/* 六边形 SVG */}
            <svg
              viewBox="0 0 369.53 247.87"
              className="relative w-full h-full"
              style={{ filter: 'drop-shadow(0 0 30px rgba(255,255,255,0.2))' }}
            >
              <defs>
                {/* 全息渐变 - 增强不透明度 */}
                <linearGradient id="login-holo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="rgba(255,255,255,0.95)" />
                  <stop offset="25%" stopColor="rgba(180,210,255,0.9)" />
                  <stop offset="50%" stopColor="rgba(255,180,210,0.85)" />
                  <stop offset="75%" stopColor="rgba(180,255,210,0.9)" />
                  <stop offset="100%" stopColor="rgba(210,180,255,0.95)" />
                </linearGradient>
                {/* 彩虹反光动画 - 增强不透明度 */}
                <linearGradient id="login-rainbow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ff6b6b" stopOpacity="0.6" />
                  <stop offset="20%" stopColor="#ffd93d" stopOpacity="0.6" />
                  <stop offset="40%" stopColor="#6bcb77" stopOpacity="0.6" />
                  <stop offset="60%" stopColor="#4d96ff" stopOpacity="0.6" />
                  <stop offset="80%" stopColor="#9b59b6" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#ff6b6b" stopOpacity="0.6" />
                </linearGradient>
                <clipPath id="login-hex-clip">
                  <g transform="translate(-229.94 -109.41)">
                    <path d="M243.31,288.55h42.82c4.49,0,8.71-2.18,11.31-5.84l115.29-162.35c3.26-4.59-0.02-10.95-5.65-10.95h-45.96c-6.74,0-13.06,3.26-16.96,8.76L234.83,272.12C229.94,279.01,234.86,288.55,243.31,288.55z" />
                    <path d="M398.58,357.28h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92c-3.24-4.59,0.04-10.93,5.67-10.93h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92C407.49,350.94,404.2,357.28,398.58,357.28z" />
                    <path d="M586.1,178.14h-42.82c-4.49,0-8.71,2.18-11.31,5.84L416.67,346.33c-3.26,4.59,0.02,10.95,5.65,10.95h45.96c6.74,0,13.06-3.26,16.96-8.76l109.33-153.95C599.47,187.68,594.55,178.14,586.1,178.14z" />
                    <path d="M430.83,109.41h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92c3.24,4.59-0.04,10.93-5.67,10.93h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92C421.93,115.75,425.21,109.41,430.83,109.41z" />
                  </g>
                </clipPath>
              </defs>
              {/* 全息填充 */}
              <g clipPath="url(#login-hex-clip)">
                <rect width="369.53" height="247.87" fill="url(#login-holo-grad)" />
                <rect width="369.53" height="247.87" fill="url(#login-rainbow-grad)" className="animate-holographic-spin" style={{ transformOrigin: 'center' }} />
                {/* 高光 */}
                <rect width="369.53" height="123.9" fill="white" opacity="0.15" />
              </g>
              {/* 六边形描边 - 增强可见性 */}
              <g transform="translate(-229.94 -109.41)" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
                <path d="M243.31,288.55h42.82c4.49,0,8.71-2.18,11.31-5.84l115.29-162.35c3.26-4.59-0.02-10.95-5.65-10.95h-45.96c-6.74,0-13.06,3.26-16.96,8.76L234.83,272.12C229.94,279.01,234.86,288.55,243.31,288.55z" />
                <path d="M398.58,357.28h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92c-3.24-4.59,0.04-10.93,5.67-10.93h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92C407.49,350.94,404.2,357.28,398.58,357.28z" />
                <path d="M586.1,178.14h-42.82c-4.49,0-8.71,2.18-11.31,5.84L416.67,346.33c-3.26,4.59,0.02,10.95,5.65,10.95h45.96c6.74,0,13.06-3.26,16.96-8.76l109.33-153.95C599.47,187.68,594.55,178.14,586.1,178.14z" />
                <path d="M430.83,109.41h49.56c4.51,0,8.73,2.19,11.33,5.87l36.66,51.92c3.24,4.59-0.04,10.93-5.67,10.93h-49.56c-4.51,0-8.73-2.19-11.33-5.87l-36.66-51.92C421.93,115.75,425.21,109.41,430.83,109.41z" />
              </g>
            </svg>
          </div>
          <h1 className="text-2xl font-light text-white tracking-widest mb-2">AI 设计工作台</h1>
          <p className="text-xs text-white/40 tracking-[0.3em]">PRODUCT DESIGN · INTELLIGENT GENERATION</p>
        </div>

        {/* 登录卡片 - 极简毛玻璃增强版 */}
        <div className="login-card rounded-2xl bg-white/[0.04] backdrop-blur-2xl border border-white/15 p-6 shadow-2xl">
          <div className="mb-5">
            <label className="mb-2 block text-xs font-medium text-white/50 tracking-[0.2em]">授权码 / LICENSE KEY</label>
            <input
              type="text"
              value={licenseCode}
              onChange={(e) => setLicenseCode(e.target.value.toUpperCase())}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              placeholder="输入授权码"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="w-full rounded-lg bg-white/[0.06] border border-white/15 px-4 py-3 text-sm text-white placeholder-white/25 uppercase tracking-[0.2em] focus:outline-none focus:border-white/40 focus:bg-white/[0.1] focus:shadow-[0_0_20px_rgba(255,255,255,0.1)] transition-all"
            />
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/15 border border-red-500/30 p-3 text-xs text-red-300/90">
              {error}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={isVerifying || isAutoChecking}
            className="w-full rounded-lg bg-white/10 hover:bg-white/20 border border-white/25 hover:border-white/40 py-3 text-sm font-medium text-white/90 tracking-[0.2em] disabled:opacity-50 transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.15)]"
          >
            {isVerifying || isAutoChecking ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                {isAutoChecking ? "自动验证中..." : "验证中..."}
              </span>
            ) : (
              "验证并进入 / ENTER"
            )}
          </button>
        </div>

        {/* 底部提示 */}
        <p className="text-center text-[10px] text-white/25 mt-8 tracking-[0.15em]">
          授权码由管理员分发 · 每个授权码最多绑定 3 个设备
        </p>
      </div>
    </div>
  );
}
