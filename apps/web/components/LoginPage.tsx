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
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo 区域 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-2xl border border-white/15 mb-4">
            <span className="text-3xl text-white">✦</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">AI 设计工作台</h1>
          <p className="text-sm text-white/50">产品外观重构 · 智能设计生成</p>
        </div>

        {/* 登录卡片 */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-white mb-1">授权验证</h2>
          <p className="text-xs text-white/50 mb-5">请输入授权码以继续使用，每个授权码最多绑定 3 个设备</p>

          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/70">授权码</label>
              <input
                type="text"
                value={licenseCode}
                onChange={(e) => setLicenseCode(e.target.value.toUpperCase())}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                placeholder="例如：LIHUO-XXXX-XXXX"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                className="input-field w-full rounded-lg px-4 py-3 text-sm uppercase tracking-wider"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-red-500/15 border border-red-500/30 p-3 text-xs text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={handleVerify}
              disabled={isVerifying}
              className="btn-primary w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-50"
            >
              {isVerifying ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  验证中...
                </span>
              ) : (
                "验证并进入"
              )}
            </button>
          </div>
        </div>

        {/* 底部提示 */}
        <p className="text-center text-xs text-white/30 mt-6">
          授权码由管理员分发，如有疑问请联系管理员
        </p>
      </div>
    </div>
  );
}
