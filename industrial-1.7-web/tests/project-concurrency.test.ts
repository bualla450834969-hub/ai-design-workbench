import { describe, expect, it, vi } from "vitest";

const tracker = vi.hoisted(() => ({ active: 0, maxActive: 0 }));

vi.mock("@/lib/providers/router", () => ({
  generateText: async (context: { userPrompt: string }) => {
    tracker.active += 1;
    tracker.maxActive = Math.max(tracker.maxActive, tracker.active);
    await new Promise((resolve) => setTimeout(resolve, 35));
    tracker.active -= 1;
    return { text: `完成：${context.userPrompt.slice(0, 20)}`, provider: "concurrency-test", model: "text-test" };
  },
  generateImages: vi.fn(),
}));

import { runAgentJob } from "@/lib/services/orchestrator";
import { sortAssetsByRole } from "@/lib/services/asset-roles";
import { store } from "@/lib/store";
import type { Asset } from "@/types/domain";

describe("project isolation and concurrency", () => {
  it("runs jobs from different projects at the same time without mixing histories", async () => {
    tracker.active = 0;
    tracker.maxActive = 0;
    const user = store.users.get("student-demo")!;
    const first = store.createProject(user.id, `并发项目A-${crypto.randomUUID()}`);
    const second = store.createProject(user.id, `并发项目B-${crypto.randomUUID()}`);

    const [firstResult, secondResult] = await Promise.all([
      runAgentJob({ userId: user.id, projectId: first.id, agentId: "brief-director", content: "项目A独立需求", assets: [], settings: {}, idempotencyKey: crypto.randomUUID() }),
      runAgentJob({ userId: user.id, projectId: second.id, agentId: "concept-architect", content: "项目B独立需求", assets: [], settings: {}, idempotencyKey: crypto.randomUUID() }),
    ]);

    expect(tracker.maxActive).toBe(2);
    expect(firstResult.job.status).toBe("succeeded");
    expect(secondResult.job.status).toBe("succeeded");
    expect(store.listMessages(user.id, first.id).map((message) => message.content).join(" ")).toContain("项目A独立需求");
    expect(store.listMessages(user.id, first.id).map((message) => message.content).join(" ")).not.toContain("项目B独立需求");
  });

  it("always sends product originals before design references regardless of upload order", () => {
    const base = { projectId: "project", type: "image/png", size: 10, url: "data:image/png;base64,AA==", createdAt: new Date().toISOString() };
    const style: Asset = { ...base, id: "style", name: "先上传的参考.png", role: "style" };
    const product: Asset = { ...base, id: "product", name: "后上传的原图.png", role: "structure" };
    expect(sortAssetsByRole([style, product], [style.id, product.id]).map((asset) => asset.id)).toEqual(["product", "style"]);
  });

  it("keeps the selected main product ahead of its auxiliary views", () => {
    const base = { projectId: "project", type: "image/png", size: 10, url: "data:image/png;base64,AA==", createdAt: new Date().toISOString(), role: "structure" as const };
    const rear: Asset = { ...base, id: "rear", name: "后视图.png" };
    const main: Asset = { ...base, id: "main", name: "主视图.png" };
    const side: Asset = { ...base, id: "side", name: "侧视图.png" };
    expect(sortAssetsByRole([rear, main, side], [main.id, side.id, rear.id]).map((asset) => asset.id)).toEqual(["main", "side", "rear"]);
  });
});
