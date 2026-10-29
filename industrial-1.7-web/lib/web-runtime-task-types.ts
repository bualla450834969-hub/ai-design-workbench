import type { AgentId, Asset } from "@/types/domain";
import type { WebProviderSnapshot } from "@/lib/web-providers";

interface BaseTaskInput {
  userId: string; projectId: string; content: string; assets: Asset[];
  idempotencyKey: string; jobId: string;
}
export type WebTaskPayload = ({
  kind: "agent";
  input: BaseTaskInput & { agentId: AgentId; settings: Record<string, string | number | boolean> };
  provider: WebProviderSnapshot;
} | {
  kind: "free-chat";
  input: BaseTaskInput & { selectedAssetIds: string[]; resolution?: "1K" | "2K" | "4K"; aspectRatio?: "auto" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16"; boardItems?: number };
  provider: WebProviderSnapshot;
}) & { webLicenseBindingId: string };
export interface WebTaskRecord {
  payload: WebTaskPayload;
  state: "queued" | "started" | "done";
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}
