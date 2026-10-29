"use client";

import { useState, type ReactNode } from "react";
import type { TabId } from "@/components/AppNavigation";
import TabletBrand from "./TabletBrand";
import { createProject, type TabletProject } from "./projects";
import { TABLET_WORKFLOWS, findWorkflow } from "./workflows";

const TABS: { id: TabId; label: string }[] = [
  { id: "generate", label: "工作台" },
  { id: "results", label: "结果" },
  { id: "history", label: "历史" },
  { id: "favorites", label: "收藏" },
];

export default function TabletShell({
  activeTab,
  onTabChange,
  workflowId,
  onWorkflow,
  projects,
  activeProjectId,
  onProjectsChange,
  onOpenSettings,
  onLogout,
  children,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  workflowId: string;
  onWorkflow: (id: string) => void;
  projects: TabletProject[];
  activeProjectId: string;
  onProjectsChange: (projects: TabletProject[], activeId: string) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [creating, setCreating] = useState(false);
  const workflow = findWorkflow(workflowId);
  const active = projects.find((project) => project.id === activeProjectId) || projects[0];

  const addProject = () => {
    const project = createProject(draftName);
    onProjectsChange([project, ...projects.filter((item) => item.id !== project.id)], project.id);
    setDraftName("");
    setCreating(false);
    onTabChange("generate");
  };

  return (
    <div className={collapsed ? "tablet-shell is-collapsed" : "tablet-shell"}>
      <aside className="tablet-sidebar">
        <div className="tablet-sidebar-header">
          <TabletBrand />
          <button type="button" className="tablet-icon-button" onClick={() => setCollapsed(true)} aria-label="收起侧栏">
            ⟨
          </button>
        </div>
        <button type="button" className="tablet-new-project" onClick={() => setCreating((value) => !value)}>
          <span>+</span> 新建项目
        </button>
        {creating && (
          <form
            className="tablet-new-project-form"
            onSubmit={(event) => {
              event.preventDefault();
              addProject();
            }}
          >
            <input
              value={draftName}
              placeholder="项目名称"
              onChange={(event) => setDraftName(event.target.value)}
              autoFocus
            />
          </form>
        )}
        <div className="tablet-project-list">
          {projects.map((project) => (
            <button
              key={project.id}
              type="button"
              className={project.id === active?.id ? "tablet-project is-active" : "tablet-project"}
              onClick={() => {
                onProjectsChange(projects, project.id);
                onTabChange("generate");
              }}
            >
              <span>{project.name}</span>
              <small>本地项目</small>
            </button>
          ))}
        </div>
        <div className="tablet-workflow-label">工作流</div>
        <div className="tablet-workflows">
          {TABLET_WORKFLOWS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={item.id === workflow.id ? "is-active" : undefined}
              onClick={() => {
                onWorkflow(item.id);
                onTabChange("generate");
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="tablet-sidebar-footer">
          <button type="button" onClick={onOpenSettings}>模型与授权</button>
          <button type="button" onClick={onLogout}>退出</button>
        </div>
      </aside>
      <section className="tablet-main">
        <header className="tablet-topbar">
          {collapsed && (
            <button type="button" className="tablet-icon-button" onClick={() => setCollapsed(false)} aria-label="展开侧栏">
              ☰
            </button>
          )}
          <div className="tablet-topbar-title">
            <strong>{active?.name || "未命名项目"}</strong>
            <small>{workflow.label} · {workflow.hint}</small>
          </div>
          <nav className="tablet-scope">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? "is-active" : undefined}
                onClick={() => onTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>
        <div className="tablet-workspace">{children}</div>
      </section>
    </div>
  );
}
