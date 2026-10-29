import type { AgentId, GenerationMode, WorkflowKind } from "@/types/domain";

export interface WorkflowSpec {
  id: AgentId;
  label: string;
  workflowKind: WorkflowKind;
  generationMode: GenerationMode;
  countKey: "variants" | "outputs" | "viewCount" | "outputCount";
}

/** Sidebar order matches the 1.7 tablet workbench. */
export const WORKFLOWS: WorkflowSpec[] = [
  { id: "appearance-variants", label: "外观改款", workflowKind: "shape", generationMode: "source", countKey: "variants" },
  { id: "cmf-colorways", label: "配色 CMF", workflowKind: "cmf", generationMode: "source", countKey: "outputs" },
  { id: "sketch-envelope", label: "草图与结构", workflowKind: "shape", generationMode: "source", countKey: "outputs" },
  { id: "render-studio", label: "场景图", workflowKind: "scene", generationMode: "source", countKey: "outputs" },
  { id: "local-retouch", label: "局部精修", workflowKind: "shape", generationMode: "local", countKey: "outputs" },
  { id: "multi-view", label: "多角度", workflowKind: "view", generationMode: "source", countKey: "viewCount" },
  { id: "detail-view", label: "细节图", workflowKind: "shape", generationMode: "source", countKey: "outputs" },
  { id: "free-chat", label: "自由对话", workflowKind: "shape", generationMode: "text", countKey: "outputCount" },
];

export function workflowById(id: string) {
  return WORKFLOWS.find((item) => item.id === id) || WORKFLOWS[0];
}
