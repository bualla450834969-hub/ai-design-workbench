"use client";

import { useState } from "react";
import { getDeviceId, getLicenseCode, saveLicenseCode } from "@/utils";

interface LoginPageProps {
  onAuthorized: () => void;
}

export default function LoginPage({ onAuthorized }: LoginPageProps) {
  const [licenseCode, setLicenseCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");

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
        {/* Logo 区域 - 全息风格增强版 */}
        <div className="text-center mb-10 animate-float">
          <div className="holographic-logo mx-auto mb-6">
            <div className="holographic-rainbow" />
            <span className="relative text-4xl text-white/90 font-light tracking-wider z-10">✦</span>
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
            disabled={isVerifying}
            className="w-full rounded-lg bg-white/10 hover:bg-white/20 border border-white/25 hover:border-white/40 py-3 text-sm font-medium text-white/90 tracking-[0.2em] disabled:opacity-50 transition-all hover:shadow-[0_0_30px_rgba(255,255,255,0.15)]"
          >
            {isVerifying ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                验证中...
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
