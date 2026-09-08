"use client";

import { useState, useEffect } from "react";
import { loadCostConfig, saveCostConfig, type CostConfig, getLicenseCode, saveLicenseCode, getDeviceId } from "@/utils";
import { useToast } from "@/components/Toast";

const PROVIDERS = [
  { id: "geeknow", name: "GeekAI (默认)", desc: "推荐，支持 Gemini 画图" },
  { id: "apiyi", name: "API易", desc: "OpenAI 兼容接口" },
  { id: "aihubmix", name: "AIHubMix", desc: "多模型聚合" },
  { id: "custom", name: "自定义", desc: "任意 OpenAI 兼容接口" },
];

const BRAIN_MODEL_OPTIONS = [
  { value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro（推荐）" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash（快）" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4.1", label: "GPT-4.1" },
];

const IMAGE_MODEL_OPTIONS = [
  { value: "gemini-3.1-flash-image-preview", label: "Gemini 3.1 Flash Image（推荐）" },
  { value: "gemini-2.5-flash-image", label: "Gemini 2.5 Flash Image" },
  { value: "gpt-image-1", label: "GPT Image 1" },
];

export default function SettingsPanel() {
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [providerConfigs, setProviderConfigs] = useState<Record<string, { apiKey: string; brainModel: string; imageModel: string; baseUrl?: string }>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = localStorage.getItem("providerConfigs");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [costConfig, setCostConfig] = useState<CostConfig>(() => loadCostConfig());
  const [licenseCode, setLicenseCode] = useState(() => getLicenseCode());
  const [licenseStatus, setLicenseStatus] = useState<{ valid: boolean; deviceCount: number; maxDevices: number; thisDeviceBound: boolean } | null>(null);
  const [isVerifyingLicense, setIsVerifyingLicense] = useState(false);
  const { showToast } = useToast();

  const updateCostConfig = (field: keyof CostConfig, value: string) => {
    const numValue = parseFloat(value) || 0;
    const next = { ...costConfig, [field]: numValue };
    setCostConfig(next);
    saveCostConfig(next);
  };

  const handleVerifyLicense = async () => {
    if (!licenseCode.trim()) {
      showToast("请输入授权码", "error");
      return;
    }
    setIsVerifyingLicense(true);
    try {
      const deviceId = getDeviceId();
      const res = await fetch("/api/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseCode, deviceId }),
      });
      const result = await res.json();
      if (result.valid) {
        saveLicenseCode(licenseCode.trim().toUpperCase());
        setLicenseCode(licenseCode.trim().toUpperCase());
        showToast(result.alreadyBound ? "授权验证通过" : "授权成功，设备已绑定", "success");
        // 查询状态
        const statusRes = await fetch("/api/license/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ licenseCode, deviceId }),
        });
        const status = await statusRes.json();
        setLicenseStatus(status);
      } else {
        showToast(result.message || "授权失败", "error");
      }
    } catch (e) {
      showToast("验证失败，请稍后重试", "error");
    } finally {
      setIsVerifyingLicense(false);
    }
  };

  // 页面加载时查询授权状态
  useEffect(() => {
    if (licenseCode) {
      const deviceId = getDeviceId();
      fetch("/api/license/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseCode, deviceId }),
      })
        .then((r) => r.json())
        .then((s) => setLicenseStatus(s))
        .catch(() => {});
    }
  }, [licenseCode]);

  const updateConfig = (providerId: string, field: string, value: string) => {
    setProviderConfigs((prev) => {
      const next = {
        ...prev,
        [providerId]: {
          apiKey: prev[providerId]?.apiKey || "",
          brainModel: prev[providerId]?.brainModel || BRAIN_MODEL_OPTIONS[0]!.value,
          imageModel: prev[providerId]?.imageModel || IMAGE_MODEL_OPTIONS[0]!.value,
          baseUrl: prev[providerId]?.baseUrl || "",
          [field]: value,
        },
      };
      if (typeof window !== "undefined") {
        localStorage.setItem("providerConfigs", JSON.stringify(next));
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* 授权码 */}
      <section className="glass-card rounded-2xl p-4">
        <h2 className="mb-1 text-sm font-semibold text-white">授权码</h2>
        <p className="mb-3 text-xs text-white/50">每个授权码最多绑定 3 个设备，绑定后不可解绑</p>
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={licenseCode}
              onChange={(e) => setLicenseCode(e.target.value.toUpperCase())}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text');
                setLicenseCode(text.toUpperCase().trim());
                e.preventDefault();
              }}
              placeholder="输入授权码，例如 LIHUO-XXXX-XXXX"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="input-field flex-1 rounded-lg px-3 py-2 text-sm uppercase"
            />
            <button
              onClick={handleVerifyLicense}
              disabled={isVerifyingLicense}
              className="rounded-lg bg-indigo-500/80 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-all"
            >
              {isVerifyingLicense ? "验证中..." : "验证"}
            </button>
          </div>
          {licenseStatus && (
            <div className={`rounded-lg p-3 text-xs ${licenseStatus.valid ? "bg-green-500/15 text-green-300 border border-green-500/30" : "bg-red-500/15 text-red-300 border border-red-500/30"}`}>
              {licenseStatus.valid ? (
                <div className="space-y-1">
                  <p className="font-medium">✓ 授权码有效</p>
                  <p>已绑定设备：{licenseStatus.deviceCount} / {licenseStatus.maxDevices}</p>
                  <p>当前设备：{licenseStatus.thisDeviceBound ? "已绑定" : "未绑定"}</p>
                </div>
              ) : (
                <p>✗ 授权码无效或已达设备上限</p>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="glass-card rounded-2xl p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">AI 供应商</h2>
        <p className="mb-3 text-xs text-white/50">点击展开配置，API Key 仅保存在本地浏览器，不会上传</p>
        <div className="space-y-2">
          {PROVIDERS.map((p) => {
            const isExpanded = expandedProvider === p.id;
            const config = providerConfigs[p.id];
            const hasKey = config?.apiKey && config.apiKey.length > 0;
            return (
              <div key={p.id} className="overflow-hidden rounded-lg border border-white/10">
                <button
                  onClick={() => setExpandedProvider(isExpanded ? null : p.id)}
                  className="flex w-full items-center justify-between px-3 py-3 text-left hover:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <div>
                      <div className="text-sm font-medium text-white">{p.name}</div>
                      <div className="text-xs text-white/50">{p.desc}</div>
                    </div>
                    {hasKey && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">已配置</span>
                    )}
                  </div>
                  <span className={`text-white/40 transition-transform ${isExpanded ? "rotate-90" : ""}`}>›</span>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/5 bg-white/5 p-3 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-white/70">API Key</label>
                      <input
                        type="password"
                        value={config?.apiKey || ""}
                        onChange={(e) => updateConfig(p.id, "apiKey", e.target.value)}
                        placeholder="输入你的 API Key"
                        className="input-field w-full rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-white/70">方案模型（Brain）</label>
                      <select
                        value={config?.brainModel || BRAIN_MODEL_OPTIONS[0]!.value}
                        onChange={(e) => updateConfig(p.id, "brainModel", e.target.value)}
                        className="input-field w-full rounded-lg px-3 py-2 text-sm"
                      >
                        {BRAIN_MODEL_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-white/70">画图模型（Image）</label>
                      <select
                        value={config?.imageModel || IMAGE_MODEL_OPTIONS[0]!.value}
                        onChange={(e) => updateConfig(p.id, "imageModel", e.target.value)}
                        className="input-field w-full rounded-lg px-3 py-2 text-sm"
                      >
                        {IMAGE_MODEL_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    {p.id === "custom" && (
                      <div>
                        <label className="mb-1 block text-xs font-medium text-white/70">接口地址（Base URL）</label>
                        <input
                          type="text"
                          value={config?.baseUrl || ""}
                          onChange={(e) => updateConfig(p.id, "baseUrl", e.target.value)}
                          placeholder="https://your-api-endpoint.com/v1"
                          className="input-field w-full rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    )}
                    <p className="text-[10px] text-white/40">配置自动保存到本地浏览器</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass-card rounded-2xl p-4">
        <h2 className="mb-1 text-sm font-semibold text-white">费用估算</h2>
        <p className="mb-3 text-xs text-white/50">配置模型单价后，生成按钮会实时显示预估费用（仅供参考，实际以供应商计费为准）</p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">方案模型（Brain）单次调用费用（元）</label>
            <input
              type="text"
              inputMode="decimal"
              value={costConfig.brainCostPerCall || ""}
              onChange={(e) => updateCostConfig("brainCostPerCall", e.target.value)}
              placeholder="例如：0.06"
              className="input-field w-full rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-white/70">画图模型（Image）单张生成费用（元）</label>
            <input
              type="text"
              inputMode="decimal"
              value={costConfig.imageCostPerCall || ""}
              onChange={(e) => updateCostConfig("imageCostPerCall", e.target.value)}
              placeholder="例如：0.15"
              className="input-field w-full rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <p className="text-[10px] text-white/40">计算公式：1次方案模型 + N张画图模型（N=生成数量）</p>
        </div>
      </section>

      <section className="glass-card rounded-2xl p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">关于</h2>
        <div className="space-y-2 text-xs text-white/50">
          <p>核心引擎版本：v1.0.0</p>
          <p>基于 AI-Design-Pro 学习源码重构</p>
          <p>移动优先 · 响应式布局</p>
        </div>
      </section>
    </div>
  );
}
