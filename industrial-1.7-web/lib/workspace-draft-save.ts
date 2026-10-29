import { normalizeProjectWorkspaceState } from "@/lib/project-workspace-state";
import type { ProjectWorkspaceState } from "@/types/domain";

export function workspaceDraftSignature(snapshot?: ProjectWorkspaceState | null) {
  return JSON.stringify(normalizeProjectWorkspaceState(snapshot));
}

/** An older completed request cannot mark a newer, still-debounced edit saved. */
export function workspaceDraftSavePhase(phase: "saving" | "saved" | "error", current: ProjectWorkspaceState, persistedSignature?: string) {
  if (phase === "error") return "error";
  return workspaceDraftSignature(current) === persistedSignature ? phase : "saving";
}
