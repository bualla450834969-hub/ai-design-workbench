import type { AssetRole, WorkflowKind } from "@/types/domain";

/** These tasks require an explicitly chosen product original; composer images are references. */
export function resolveParameterImageRole(role: AssetRole | "auto", workflowKind: WorkflowKind, hasProduct: boolean, index = 0): AssetRole {
  if (role !== "auto") return role;
  return workflowKind === "packaging" || workflowKind === "detail" || hasProduct || index > 0 ? "style" : "structure";
}
