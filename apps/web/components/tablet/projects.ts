export type TabletProject = {
  id: string;
  name: string;
  createdAt: number;
};

const PROJECTS_KEY = "tabletProjects";
const ACTIVE_KEY = "tabletActiveProject";
const ONBOARDED_KEY = "tabletOnboarded";
const WORKFLOW_KEY = "tabletWorkflow";

function readProjects(): TabletProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === "string" && typeof item.name === "string");
  } catch {
    return [];
  }
}

function writeProjects(projects: TabletProject[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function loadProjects(): TabletProject[] {
  return readProjects();
}

export function loadActiveProjectId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ACTIVE_KEY) || "";
}

export function isTabletOnboarded(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ONBOARDED_KEY) === "1";
}

export function markTabletOnboarded() {
  localStorage.setItem(ONBOARDED_KEY, "1");
}

export function clearTabletOnboarding() {
  localStorage.removeItem(ONBOARDED_KEY);
}

export function loadWorkflowId(): string {
  if (typeof window === "undefined") return "appearance";
  return localStorage.getItem(WORKFLOW_KEY) || "appearance";
}

export function saveWorkflowId(id: string) {
  localStorage.setItem(WORKFLOW_KEY, id);
}

export function createProject(name: string): TabletProject {
  const project: TabletProject = {
    id: `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "我的第一个设计项目",
    createdAt: Date.now(),
  };
  const next = [project, ...readProjects()].slice(0, 40);
  writeProjects(next);
  localStorage.setItem(ACTIVE_KEY, project.id);
  return project;
}

export function selectProject(id: string) {
  localStorage.setItem(ACTIVE_KEY, id);
}

export function renameProject(id: string, name: string) {
  const next = readProjects().map((project) =>
    project.id === id ? { ...project, name: name.trim() || project.name } : project
  );
  writeProjects(next);
}
