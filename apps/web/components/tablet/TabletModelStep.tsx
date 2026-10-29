"use client";

import { useState } from "react";
import TabletBrand from "./TabletBrand";

const PROVIDERS = [
  { id: "geeknow", name: "GeekAI" },
  { id: "apiyi", name: "API易" },
  { id: "aihubmix", name: "AIHubMix" },
  { id: "custom", name: "自定义 OpenAI 兼容接口" },
];

const BRAIN_MODELS = ["gemini-3.1-pro-preview", "gemini-2.5-pro", "gpt-4.1", "gpt-4o"];
const IMAGE_MODELS = ["gemini-3.1-flash-image-preview", "gemini-2.5-flash-image", "gpt-image-2"];

type ProviderConfig = { apiKey: string; brainModel: string; imageModel: string; baseUrl?: string };

export default function TabletModelStep({
  onContinue,
  onSkip,
}: {
  onContinue: () => void;
  onSkip: () => void;
}) {
  const [provider, setProvider] = useState("geeknow");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [brainModel, setBrainModel] = useState(BRAIN_MODELS[0]);
  const [imageModel, setImageModel] = useState(IMAGE_MODELS[0]);
  const [error, setError] = useState("");

  const save = () => {
    if (!apiKey.trim()) {
      setError("请填写模型 API Key，或选择稍后填写");
      return;
    }
    if (provider === "custom" && !/^https:\/\//i.test(baseUrl.trim())) {
      setError("自定义接口需要完整的 HTTPS 地址");
      return;
    }
    const current = readConfigs();
    const next: Record<string, ProviderConfig> = {
      ...current,
      [provider]: {
        apiKey: apiKey.trim(),
        brainModel,
        imageModel,
        baseUrl: baseUrl.trim(),
      },
    };
    localStorage.setItem("providerConfigs", JSON.stringify(next));
    onContinue();
  };

  return (
    <div className="tablet-gate">
      <header className="tablet-gate-header">
        <TabletBrand />
        <span className="tablet-count">2 / 3</span>
      </header>
      <main className="tablet-gate-main">
        <section className="tablet-intro">
          <span className="tablet-eyebrow">连接模型</span>
          <h1>使用你自己的 API Key</h1>
          <p>密钥只保存在这台浏览器。生成时由本机直接发给你选择的模型供应商。</p>
          <ol>
            <li><i>1</i><span><strong>激活软件</strong><small>已完成</small></span></li>
            <li className="active"><i>2</i><span><strong>连接模型</strong><small>使用自己的 API Key</small></span></li>
            <li><i>3</i><span><strong>创建项目</strong><small>从空白工作台开始</small></span></li>
          </ol>
        </section>
        <section className="tablet-card">
          <label>
            <span>供应商</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value)}>
              {PROVIDERS.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>API Key</span>
            <input
              type="password"
              value={apiKey}
              autoComplete="off"
              placeholder="粘贴模型供应商的 API Key"
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
          {provider === "custom" && (
            <label>
              <span>接口地址</span>
              <input
                value={baseUrl}
                placeholder="https://api.example.com/v1"
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </label>
          )}
          <div className="tablet-split">
            <label>
              <span>文字模型</span>
              <select value={brainModel} onChange={(event) => setBrainModel(event.target.value)}>
                {BRAIN_MODELS.map((model) => <option key={model}>{model}</option>)}
              </select>
            </label>
            <label>
              <span>图片模型</span>
              <select value={imageModel} onChange={(event) => setImageModel(event.target.value)}>
                {IMAGE_MODELS.map((model) => <option key={model}>{model}</option>)}
              </select>
            </label>
          </div>
          <div className="tablet-error">{error}</div>
          <button type="button" className="tablet-primary" onClick={save}>
            <span>保存并继续</span>
            <b>→</b>
          </button>
          <button type="button" className="tablet-paste" onClick={onSkip}>稍后在设置中填写</button>
          <small className="tablet-privacy">API Key 不会发到本站服务器，也不会发到授权服务器。</small>
        </section>
      </main>
    </div>
  );
}

function readConfigs(): Record<string, ProviderConfig> {
  try {
    const raw = localStorage.getItem("providerConfigs");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
