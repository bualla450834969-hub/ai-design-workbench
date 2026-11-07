import { stripGeneratedPromptBoilerplate } from "@/lib/product-identity";
import type { Message } from "@/types/domain";

export const FREE_CHAT_MEMORY_LIMIT = 1800;

/** Only user-confirmed design facts belong here; image pixels remain explicit attachments. */
export function normalizeFreeChatMemory(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\0/g, "").trim().slice(0, FREE_CHAT_MEMORY_LIMIT)
    : "";
}

export function formatFreeChatHistory(messages: Message[], excludeJobId?: string) {
  return messages
    .filter((message) => message.agentId === "free-chat"
      && (message.role === "user" || message.role === "assistant")
      && message.jobId !== excludeJobId)
    .slice(-12)
    .map((message) => `${message.role === "user" ? "用户" : "助手"}：${stripGeneratedPromptBoilerplate(message.content).replace(/\s+/g, " ").slice(0, 1200)}`)
    .join("\n")
    .slice(-8000);
}
