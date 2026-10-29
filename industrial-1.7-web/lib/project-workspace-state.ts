import type { ProjectWorkspaceState } from "@/types/domain";
import { normalizeBoardItemCount } from "@/lib/generation-board";
import { stripGeneratedPromptBoilerplate } from "@/lib/product-identity";

export const defaultProjectWorkspaceState: Required<ProjectWorkspaceState> = {
  selectedAssets: [],
  agentId: "appearance-variants",
  workflowKind: "shape",
  specifiedAngle: "",
  designDirections: {},
  reconstructionRatio: 70,
  outputCount: 1,
  boardItems: 1,
  resolution: "1K",
  input: "",
  generationMode: "source",
  aspectRatio: "auto",
  workspaceMode: "parameter",
  freeChatInput: "",
  freeChatSelectedAssets: [],
  freeResolution: "1K",
  freeAspectRatio: "auto",
  freeChatBoardItems: 1,
};

export function normalizeProjectWorkspaceState(source?: ProjectWorkspaceState | null): Required<ProjectWorkspaceState> {
  const local = source?.agentId === "local-retouch" || source?.generationMode === "local";
  const workflowKind = (local ? ["shape", "cmf", "decal"] : ["shape", "view", "cmf", "decal", "scene"]).includes(source?.workflowKind || "") ? source!.workflowKind! : "shape";
  const designDirections = { ...(source?.designDirections || {}) };
  if (local && !designDirections[`local-retouch:${workflowKind}`] && designDirections["local-retouch"]) designDirections[`local-retouch:${workflowKind}`] = designDirections["local-retouch"];
  return {
    selectedAssets: Array.isArray(source?.selectedAssets) ? [...source.selectedAssets] : [],
    agentId: local ? "local-retouch" : "appearance-variants",
    workflowKind,
    specifiedAngle: typeof source?.specifiedAngle === "string" ? source.specifiedAngle.slice(0, 160) : "",
    designDirections,
    reconstructionRatio: typeof source?.reconstructionRatio === "number" ? source.reconstructionRatio : 70,
    outputCount: typeof source?.outputCount === "number" ? source.outputCount : 1,
    boardItems: normalizeBoardItemCount(source?.boardItems),
    resolution: source?.resolution || "1K",
    input: stripGeneratedPromptBoilerplate(typeof source?.input === "string" ? source.input : ""),
    generationMode: local ? "local" : ["source", "reference", "text", "local"].includes(source?.generationMode || "")
      ? source!.generationMode!
      : "source",
    aspectRatio: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"].includes(source?.aspectRatio || "")
      ? source!.aspectRatio!
      : "auto",
    workspaceMode: source?.workspaceMode === "free-chat" ? "free-chat" : "parameter",
    freeChatInput: stripGeneratedPromptBoilerplate(typeof source?.freeChatInput === "string" ? source.freeChatInput : ""),
    freeChatSelectedAssets: Array.isArray(source?.freeChatSelectedAssets) ? [...source.freeChatSelectedAssets] : [],
    freeResolution: ["1K", "2K", "4K"].includes(source?.freeResolution || "") ? source!.freeResolution! : "1K",
    freeAspectRatio: ["auto", "1:1", "4:3", "3:4", "16:9", "9:16"].includes(source?.freeAspectRatio || "") ? source!.freeAspectRatio! : "auto",
    freeChatBoardItems: normalizeBoardItemCount(source?.freeChatBoardItems),
  };
}
