import type { ProjectWorkspaceState } from "@/types/domain";

/** Return the original user draft only when an untouched system draft was
 * organized for different parameters. Manual edits are never discarded. */
export function expiredOrganizedInput(state: ProjectWorkspaceState, controlsFingerprint: string): string | undefined {
  return state.organizedPrompt && state.input === state.organizedPrompt && state.organizedContext !== controlsFingerprint
    ? state.unorganizedInput || "" : undefined;
}
