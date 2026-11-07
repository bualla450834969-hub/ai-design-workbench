import type { ProjectWorkspaceState, WorkflowKind } from "@/types/domain";
import { normalizeBoardItemCount } from "@/lib/generation-board";
import { stripGeneratedPromptBoilerplate } from "@/lib/product-identity";
import { normalizeReferenceStrength } from "@/lib/reference-strength";

export const defaultProjectWorkspaceState: Required<ProjectWorkspaceState> = {
  selectedAssets: [],
  agentId: "appearance-variants",
  workflowKind: "shape",
  overallWorkflowKind: "shape",
  specifiedAngle: "",
  showDimensions: true,
  designDirections: {},
  reconstructionRatio: 70,
  referenceStrength: 50,
  outputCount: 1,
  boardItems: 1,
  resolution: "1K",
  input: "",
  organizedPrompt: "", unorganizedInput: "", organizedContext: "",
  generationMode: "source",
  aspectRatio: "auto",
  transparentBackground: false,
  workspaceMode: "parameter",
  freeChatInput: "",
  freeChatSelectedAssets: [],
  freeResolution: "1K",
  freeAspectRatio: "auto",
  freeTransparentBackground: false,
  freeChatBoardItems: 1,
};

export function normalizeProjectWorkspaceState(source?: ProjectWorkspaceState | null): Required<ProjectWorkspaceState> {
  const local = source?.agentId === "local-retouch" || source?.generationMode === "local";
  const workflowKind = (local ? ["shape", "cmf", "decal"] : ["shape", "view", "cmf", "decal", "scene", "packaging", "detail", "video"]).includes(source?.workflowKind || "") ? source!.workflowKind! : "shape";
  const overallWorkflowKind = !local ? workflowKind : ["shape", "view", "cmf", "decal", "scene", "packaging", "detail", "video"].includes(source?.overallWorkflowKind || "") ? source!.overallWorkflowKind! : workflowKind;
  const designDirections = { ...(source?.designDirections || {}) };
  if (local && !designDirections[`local-retouch:${workflowKind}`] && designDirections["local-retouch"]) designDirections[`local-retouch:${workflowKind}`] = designDirections["local-retouch"];
  return {
    selectedAssets: Array.isArray(source?.selectedAssets) ? [...source.selectedAssets] : [],
    agentId: local ? "local-retouch" : "appearance-variants",
    workflowKind,
    overallWorkflowKind,
    specifiedAngle: typeof source?.specifiedAngle === "string" ? source.specifiedAngle.slice(0, 160) : "",
    showDimensions: source?.showDimensions !== false,
    designDirections,
    reconstructionRatio: typeof source?.reconstructionRatio === "number" ? source.reconstructionRatio : 70,
    referenceStrength: normalizeReferenceStrength(source?.referenceStrength),
    outputCount: typeof source?.outputCount === "number" ? source.outputCount : 1,
    boardItems: normalizeBoardItemCount(source?.boardItems),
    resolution: source?.resolution || "1K",
    organizedPrompt: typeof source?.organizedPrompt === "string" ? source.organizedPrompt.slice(0, 20_000) : "",
    unorganizedInput: typeof source?.unorganizedInput === "string" ? source.unorganizedInput.slice(0, 20_000) : "",
    organizedContext: typeof source?.organizedContext === "string" ? source.organizedContext.slice(0, 10_000) : "",
    input: stripGeneratedPromptBoilerplate(typeof source?.input === "string" ? source.input : ""),
    generationMode: local ? "local" : ["source", "reference", "text", "local"].includes(source?.generationMode || "")
      ? source!.generationMode!
      : "source",
    aspectRatio: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"].includes(source?.aspectRatio || "")
      ? source!.aspectRatio!
      : "auto",
    transparentBackground: false,
    workspaceMode: source?.workspaceMode === "free-chat" ? "free-chat" : "parameter",
    freeChatInput: stripGeneratedPromptBoilerplate(typeof source?.freeChatInput === "string" ? source.freeChatInput : ""),
    freeChatSelectedAssets: Array.isArray(source?.freeChatSelectedAssets) ? [...source.freeChatSelectedAssets] : [],
    freeResolution: ["1K", "2K", "4K"].includes(source?.freeResolution || "") ? source!.freeResolution! : "1K",
    freeAspectRatio: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"].includes(source?.freeAspectRatio || "") ? source!.freeAspectRatio! : "auto",
    freeTransparentBackground: false,
    freeChatBoardItems: normalizeBoardItemCount(source?.freeChatBoardItems),
  };
}

export function enterLocalRetouchWorkflow(source: ProjectWorkspaceState) {
  const current = normalizeProjectWorkspaceState(source);
  return {
    agentId: "local-retouch" as const,
    workflowKind: (["shape", "cmf", "decal"] as WorkflowKind[]).includes(current.workflowKind) ? current.workflowKind : "shape" as const,
    overallWorkflowKind: current.overallWorkflowKind,
  };
}

export function leaveLocalRetouchWorkflow(source: ProjectWorkspaceState) {
  const current = normalizeProjectWorkspaceState(source);
  return { agentId: "appearance-variants" as const, workflowKind: current.overallWorkflowKind, overallWorkflowKind: current.overallWorkflowKind };
}
