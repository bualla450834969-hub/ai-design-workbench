"use client";

import { useState } from "react";
import { createProject, markTabletOnboarded } from "./projects";
import TabletBrand from "./TabletBrand";

export default function TabletProjectStep({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("我的第一个设计项目");

  const create = () => {
    createProject(name);
    markTabletOnboarded();
    onCreated();
  };

  return (
    <div className="tablet-gate">
      <header className="tablet-gate-header">
        <TabletBrand />
        <span className="tablet-count">3 / 3</span>
      </header>
      <main className="tablet-gate-main">
        <section className="tablet-intro">
          <span className="tablet-eyebrow">创建项目</span>
          <h1>从空白工作台开始</h1>
          <p>项目名称保存在这台浏览器，用来区分不同的外观改款任务。</p>
          <ol>
            <li><i>1</i><span><strong>激活软件</strong><small>已完成</small></span></li>
            <li><i>2</i><span><strong>连接模型</strong><small>已完成</small></span></li>
            <li className="active"><i>3</i><span><strong>创建项目</strong><small>从空白工作台开始</small></span></li>
          </ol>
        </section>
        <section className="tablet-card">
          <label>
            <span>项目名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") create();
              }}
            />
          </label>
          <div className="tablet-error" />
          <button type="button" className="tablet-primary" onClick={create}>
            <span>创建项目并进入</span>
            <b>→</b>
          </button>
          <small className="tablet-privacy">进入后可在左侧继续新建项目，并切换外观改款、配色、场景和精修。</small>
        </section>
      </main>
    </div>
  );
}
