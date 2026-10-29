"use client";

import { useMemo, useState } from "react";
import runtimeConfig from "@/deploy/runtime-config.json";
import { getAgent } from "@/lib/agents/catalog";
import { modelConnections, openExternalLink } from "@/lib/model-connections-client";
import { DEFAULT_TEXT_MODEL, defaultImageModelForProvider } from "@/lib/model-pricing";
import { isModelProviderReady } from "@/lib/provider-onboarding";
import { LOCAL_OFFLINE_CODE } from "@/lib/local-code";
import { deviceId } from "@/lib/tablet-client";
import type { Project } from "@/types/domain";

const STEPS = [
  { title: "激活软件", detail: "粘贴授权码" },
  { title: "连接模型", detail: "使用自己的 API Key" },
  { title: "创建项目", detail: "从空白工作台开始" },
];

const EXTRA_PROVIDER = {
  type: "openai-compatible" as const,
  title: "自定义",
  name: "自定义兼容供应商",
  baseUrl: "",
  note: "需支持浏览器直连",
  registerUrl: "",
};

type ProviderPreset = {
  type: DesktopProviderType;
  title: string;
  name: string;
  baseUrl: string;
  note: string;
  registerUrl?: string;
};

function presets(): ProviderPreset[] {
  const listed = runtimeConfig.providers.map((item) => ({
    type: item.type as DesktopProviderType,
    title: item.title,
    name: item.name,
    baseUrl: item.baseUrl,
    note: item.note,
    registerUrl: item.registerUrl,
  }));
  return [...listed, EXTRA_PROVIDER];
}

export function OnboardingFrame({ step, children }: { step: 1 | 2 | 3; children: React.ReactNode }) {
  return (
    <div className="ida-onboard">
      <header className="ida-top">
        <div className="ida-brand">
          <b>ID</b>
          <span><strong>工业设计智能体</strong><small>INDUSTRIAL AI</small></span>
        </div>
        <span className="ida-count">{step} / 3</span>
      </header>
      <main>
        <section className="ida-intro">
          <span className="ida-eyebrow">网页工作台</span>
          <h1>{step === 1 ? "欢迎，输入授权码即可开始" : step === 2 ? "连接模型，使用自己的 API Key" : "创建第一个项目"}</h1>
          <p>{step === 1 ? "接下来连接模型并创建第一个项目，三步即可开始。" : step === 2 ? "先填写自己的 API Key，确认文字和图片模型并保存，再创建项目。" : "项目、图片和生成结果保存在这台浏览器里。"}</p>
          <ol>
            {STEPS.map((item, index) => (
              <li key={item.title} className={index + 1 === step ? "active" : ""}>
                <i>{index + 1}</i>
                <span><strong>{item.title}</strong><small>{item.detail}</small></span>
              </li>
            ))}
          </ol>
        </section>
        <section className="ida-card">{children}</section>
      </main>
    </div>
  );
}

export function ActivateStep({ onActivated }: { onActivated: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function paste() {
    setError("");
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error("剪贴板中没有文本");
      setCode(text.trim());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取剪贴板失败，请在输入框中按 Ctrl+V");
    }
  }

  async function activate() {
    if (pending) return;
    setError("");
    if (!code.trim()) {
      setError("请粘贴授权码");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/web/auth/activate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), deviceId: deviceId() }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "激活失败，请检查授权码");
      onActivated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "激活失败，请检查授权码");
      setPending(false);
    }
  }

  return (
    <OnboardingFrame step={1}>
      <label>
        <span>授权码</span>
        <textarea value={code} spellCheck={false} autoComplete="off" placeholder="粘贴授权码" onChange={(event) => setCode(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void activate(); } }} />
      </label>
      <button className="ida-ghost" type="button" onClick={() => void paste()}>从剪贴板粘贴授权码</button>
      <div className="ida-error" role="alert">{error}</div>
      <button className="ida-primary" type="button" disabled={pending} onClick={() => void activate()}>
        <span>{pending ? "正在验证…" : "激活并继续"}</span><b>→</b>
      </button>
      <small className="ida-privacy">
        项目、图片和模型 Key 保存在此浏览器的本地工作区。当前版本在本机完成离线授权，不会连接授权服务器，也不会伪造官方签名。生成时由浏览器直连你选择的供应商，供应商会收到本轮提示词、必要图片及 Key。本机离线授权码：{LOCAL_OFFLINE_CODE}
      </small>
    </OnboardingFrame>
  );
}

export function ModelStep({ onReady, onBack }: { onReady: () => void; onBack?: () => void }) {
  const options = useMemo(presets, []);
  const [type, setType] = useState<DesktopProviderType>(options[0]?.type || "apiyi");
  const preset = options.find((item) => item.type === type) || options[0];
  const [name, setName] = useState(preset?.name || "");
  const [baseUrl, setBaseUrl] = useState(preset?.baseUrl || "");
  const [apiKey, setApiKey] = useState("");
  const [textModel, setTextModel] = useState(DEFAULT_TEXT_MODEL);
  const [imageModel, setImageModel] = useState(defaultImageModelForProvider(preset?.type || "apiyi"));
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function choose(next: DesktopProviderType) {
    const item = options.find((entry) => entry.type === next) || options[0];
    setType(next);
    setName(item.name);
    setBaseUrl(item.baseUrl);
    setTextModel(DEFAULT_TEXT_MODEL);
    setImageModel(defaultImageModelForProvider(next));
    setError("");
  }

  async function save() {
    setError("");
    setPending(true);
    try {
      const draft: DesktopProviderDraft = {
        id: `local-${type}`,
        name: name.trim(),
        type,
        baseUrl: baseUrl.trim(),
        textModel: textModel.trim(),
        imageModel: imageModel.trim(),
        workspaceId: "",
        modelCatalog: [textModel.trim(), imageModel.trim()].filter(Boolean),
        modelVerifications: {},
        enabled: true,
        apiKey: apiKey.trim(),
      };
      const api = modelConnections();
      if (!api.saveProvider) throw new Error("当前环境无法保存模型连接");
      const saved = await api.saveProvider(draft);
      const active = saved.providers.find((item) => item.id === draft.id) || saved.providers.find((item) => item.enabled);
      if (!isModelProviderReady(active)) throw new Error("模型连接尚未启用，请确认 API Key、文字模型和图片模型后重新保存。");
      onReady();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
      setPending(false);
    }
  }

  return (
    <OnboardingFrame step={2}>
      <label>
        <span>选择平台</span>
        <select value={type} onChange={(event) => choose(event.target.value as DesktopProviderType)}>
          {options.map((item) => <option key={item.type} value={item.type}>{item.title} · {item.note}</option>)}
        </select>
      </label>
      <label>
        <span>供应商名称</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="输入便于区分的供应商名称" />
      </label>
      <label>
        <span>地址</span>
        <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://供应商/v1" spellCheck={false} />
      </label>
      <label>
        <span>API Key</span>
        <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="粘贴 API Key" type="password" autoComplete="off" spellCheck={false} />
      </label>
      <div className="ida-split">
        <label>
          <span>文字模型</span>
          <input value={textModel} onChange={(event) => setTextModel(event.target.value)} spellCheck={false} />
        </label>
        <label>
          <span>图片模型</span>
          <input value={imageModel} onChange={(event) => setImageModel(event.target.value)} spellCheck={false} />
        </label>
      </div>
      {preset?.registerUrl ? <button className="ida-ghost" type="button" onClick={() => void openExternalLink(preset.registerUrl!).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "无法打开注册页"))}>开户注册</button> : null}
      <div className="ida-error" role="alert">{error}</div>
      <button className="ida-primary" type="button" disabled={pending} onClick={() => void save()}>
        <span>{pending ? "正在保存…" : "保存并继续"}</span><b>→</b>
      </button>
      {onBack ? <button className="ida-text" type="button" onClick={onBack}>返回工作台</button> : null}
      <small className="ida-privacy">密钥只保存在这台浏览器的 IndexedDB。直连只支持公开 HTTPS 供应商，不会把 Key 发到本站或授权服务器。</small>
    </OnboardingFrame>
  );
}

export function ProjectStep({ onCreated }: { onCreated: (project: Project) => void }) {
  const agent = getAgent("appearance-variants");
  const [name, setName] = useState("我的第一个设计项目");
  const [description, setDescription] = useState(agent.description);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function create() {
    setError("");
    if (!name.trim()) {
      setError("项目名称不能为空");
      return;
    }
    setPending(true);
    try {
      const { localSend } = await import("@/lib/tablet-client");
      const result = await localSend<{ project: Project }>("/api/projects", { name: name.trim(), description: description.trim() });
      onCreated(result.project);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建项目失败");
      setPending(false);
    }
  }

  return (
    <OnboardingFrame step={3}>
      <label>
        <span>项目名称</span>
        <input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        <span>说明</span>
        <textarea value={description} maxLength={300} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <div className="ida-error" role="alert">{error}</div>
      <button className="ida-primary" type="button" disabled={pending} onClick={() => void create()}>
        <span>{pending ? "正在创建…" : "创建项目"}</span><b>→</b>
      </button>
      <small className="ida-privacy">创建后进入工作台。图片和结果按当前授权身份保存在本机浏览器，不会上传到授权服务器。</small>
    </OnboardingFrame>
  );
}
