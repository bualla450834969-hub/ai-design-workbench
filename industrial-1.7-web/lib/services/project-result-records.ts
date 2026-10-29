import { store } from "@/lib/store";
import { projectResultAssets } from "@/lib/project-results";

export function projectResultRecords(userId: string, projectId: string) {
  const messages = store.listMessages(userId, projectId).slice().reverse();
  return projectResultAssets(store.listAssets(userId, projectId)).map((asset) => {
    const message = messages.find((item) => item.generation?.imageAssets?.some((image) => image.id === asset.id)
      || item.generation?.imageUrls.includes(asset.url));
    const generation = message?.generation;
    const originalInput = messages.find((item) => item.role === "user" && item.jobId && item.jobId === message?.jobId);
    return {
      asset, generation, variant: generation?.variants?.find((variant) => variant.assetId === asset.id),
      agentId: message?.agentId, input: generation?.requestSnapshot?.content || originalInput?.content || generation?.prompt || "",
      sourceAssetIds: generation?.settingsSnapshot?.sourceAssetIds ?? [],
      referenceAssetIds: generation?.settingsSnapshot?.referenceAssetIds ?? [],
    };
  });
}
