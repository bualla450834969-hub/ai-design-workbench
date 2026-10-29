"use client";

import { useState } from "react";
import { getDeviceId, normalizeStoredLicense, saveLicenseCode } from "@/utils";
import TabletBrand from "./TabletBrand";

const STEPS = [
  { title: "激活软件", detail: "粘贴授权码" },
  { title: "连接模型", detail: "使用自己的 API Key" },
  { title: "创建项目", detail: "从空白工作台开始" },
];

export default function TabletActivation({
  onActivated,
}: {
  onActivated: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const activate = async () => {
    const stored = normalizeStoredLicense(code);
    if (!stored) {
      setError("请粘贴授权码");
      return;
    }
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/license/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseCode: stored, deviceId: getDeviceId() }),
      });
      const result = await res.json();
      if (!result.valid) {
        setError(result.message || "激活失败，请检查授权码");
        return;
      }
      saveLicenseCode(stored);
      onActivated();
    } catch {
      setError("无法完成本机校验，请确认网页已启动");
    } finally {
      setPending(false);
    }
  };

  const paste = async () => {
    setError("");
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error("剪贴板中没有文本");
      setCode(text.trim());
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(message || "读取剪贴板失败，请在输入框中按 Ctrl+V");
    }
  };

  return (
    <div className="tablet-gate">
      <header className="tablet-gate-header">
        <TabletBrand />
        <span className="tablet-count">1 / 3</span>
      </header>
      <main className="tablet-gate-main">
        <section className="tablet-intro">
          <span className="tablet-eyebrow">网页工作台</span>
          <h1>欢迎，输入授权码即可开始</h1>
          <p>接下来连接模型并创建第一个项目，三步即可开始。</p>
          <ol>
            {STEPS.map((step, index) => (
              <li key={step.title} className={index === 0 ? "active" : undefined}>
                <i>{index + 1}</i>
                <span>
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </span>
              </li>
            ))}
          </ol>
        </section>
        <section className="tablet-card">
          <label>
            <span>授权码</span>
            <textarea
              value={code}
              spellCheck={false}
              autoComplete="off"
              placeholder="粘贴授权码"
              onChange={(event) => setCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void activate();
                }
              }}
            />
          </label>
          <button type="button" className="tablet-paste" onClick={() => void paste()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="8" y="3" width="12" height="14" rx="2" />
              <path d="M4 7v12a2 2 0 0 0 2 2h10" />
            </svg>
            从剪贴板粘贴授权码
          </button>
          <div className="tablet-error">{error}</div>
          <button type="button" className="tablet-primary" disabled={pending} onClick={() => void activate()}>
            <span>{pending ? "正在验证…" : "激活并继续"}</span>
            <b>→</b>
          </button>
          <small className="tablet-privacy">
            粘贴你已有的 IDAI1 或 LIHUO 授权码即可在本机激活。校验不连接远程授权服务器，也不会上传项目或 API Key。
          </small>
        </section>
      </main>
    </div>
  );
}
