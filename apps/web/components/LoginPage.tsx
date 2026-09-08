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
    <div className="min-h-screen flex items-center justify-center px-4 bg-black relative overflow-hidden">
      {/* 背景光晕效果 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-indigo-500/10 blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-pink-500/10 blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo 区域 - 全息风格 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 relative">
            {/* 全息效果背景 */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-white/5 to-white/10 backdrop-blur-xl border border-white/20" />
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-transparent via-white/20 to-transparent opacity-50" />
            {/* 彩虹反光效果 */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden">
              <div className="absolute -inset-1/2 bg-gradient-to-r from-red-500/20 via-yellow-500/20 via-green-500/20 via-blue-500/20 to-purple-500/20 blur-xl animate-[spin_8s_linear_infinite]" />
            </div>
            <span className="relative text-4xl text-white/90 font-light tracking-wider">✦</span>
          </div>
          <h1 className="text-2xl font-light text-white tracking-widest mb-2">AI 设计工作台</h1>
          <p className="text-xs text-white/40 tracking-wider">PRODUCT DESIGN · INTELLIGENT GENERATION</p>
        </div>

        {/* 登录卡片 - 极简毛玻璃 */}
        <div className="rounded-2xl bg-white/[0.03] backdrop-blur-2xl border border-white/10 p-6">
          <div className="mb-5">
            <label className="mb-2 block text-xs font-medium text-white/50 tracking-wider">授权码 / LICENSE KEY</label>
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
              className="w-full rounded-lg bg-white/[0.05] border border-white/10 px-4 py-3 text-sm text-white placeholder-white/20 uppercase tracking-widest focus:outline-none focus:border-white/30 focus:bg-white/[0.08] transition-all"
            />
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-300/80">
              {error}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={isVerifying}
            className="w-full rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 py-3 text-sm font-medium text-white/90 tracking-wider disabled:opacity-50 transition-all"
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
        <p className="text-center text-[10px] text-white/20 mt-8 tracking-wider">
          授权码由管理员分发 · 每个授权码最多绑定 3 个设备
        </p>
      </div>
    </div>
  );
}
