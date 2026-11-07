import type { Asset, Message } from "@/types/domain";

export interface ConversationDisplayGroup {
  message: Message;
  pairedAssistant?: Message;
}

/** The feed places a completed reply beside its request, even when jobs finish out of order. */
export function conversationDisplayGroups(messages: Message[]): ConversationDisplayGroup[] {
  const assistantByJobId = new Map(messages
    .filter((message) => message.role === "assistant" && (message.jobId || message.generation?.jobId))
    .map((message) => [message.jobId || message.generation!.jobId, message]));
  const pairedAssistantIds = new Set(messages
    .filter((message) => message.role === "user" && message.jobId && assistantByJobId.has(message.jobId))
    .map((message) => assistantByJobId.get(message.jobId!)!.id));
  return messages.filter((message) => !pairedAssistantIds.has(message.id)).map((message) => ({
    message,
    pairedAssistant: message.role === "user" && message.jobId ? assistantByJobId.get(message.jobId) : undefined,
  }));
}

/** Result navigation follows the cards actually displayed in this conversation, not asset creation order. */
export function conversationResultPreviewAssets(groups: ConversationDisplayGroup[], projectAssets: Asset[], projectId: string): Asset[] {
  const current = new Map(projectAssets.filter((asset) => asset.projectId === projectId).map((asset) => [asset.id, asset]));
  const ordered = new Map<string, Asset>();
  for (const { message, pairedAssistant } of groups) {
    for (const item of [message, pairedAssistant]) {
      for (const asset of item?.generation?.imageAssets || []) {
        if (asset.projectId !== projectId || !asset.type.startsWith("image/") || ordered.has(asset.id)) continue;
        ordered.set(asset.id, current.get(asset.id) || asset);
      }
    }
  }
  return [...ordered.values()];
}
