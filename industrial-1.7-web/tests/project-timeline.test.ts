import { describe, expect, it } from "vitest";
import { projectTimeline } from "@/lib/project-timeline";
import { conversationDisplayGroups } from "@/lib/conversation-preview";
import type { Message } from "@/types/domain";

describe("one chronological queue for image and video turns", () => {
  it("puts a newly submitted image after historical videos and interleaves the next video", () => {
    const items = [
      { key: "image-old", createdAt: "2026-11-07T00:00:00Z" },
      { key: "image-new", createdAt: "2026-11-07T00:20:00Z" },
      { key: "video-old", createdAt: "2026-11-07T00:10:00Z" },
      { key: "video-new", createdAt: "2026-11-07T00:30:00Z" },
    ];
    expect(projectTimeline(items).map((item) => item.key)).toEqual(["image-old", "video-old", "image-new", "video-new"]);
    expect(projectTimeline(items.map((item) => ({ ...item, updatedAt: item.key === "video-old" ? "2099-01-01" : "" }))).map((item) => item.key)).toEqual(["image-old", "video-old", "image-new", "video-new"]);
  });
  it("keeps a late image completion in its original turn before a later video", () => {
    const messages: Message[] = [{ id: "user", jobId: "image-job", role: "user", projectId: "p", content: "生成图片", createdAt: "2026-11-07T00:00:00Z" }, { id: "reply", jobId: "image-job", role: "assistant", projectId: "p", content: "已生成", createdAt: "2026-11-07T01:00:00Z" }];
    const turns = conversationDisplayGroups(messages);
    const result = projectTimeline([...turns.map((turn) => ({ key: "image", createdAt: turn.message.createdAt, turn })), { key: "video", createdAt: "2026-11-07T00:10:00Z" }]);
    expect(result.map((item) => item.key)).toEqual(["image", "video"]);
    expect(turns[0].pairedAssistant?.id).toBe("reply");
  });
  it("handles optimistic jobs and equal submission timestamps stably", () => {
    expect(projectTimeline([{ key: "a", startedAt: 100 }, { key: "b", startedAt: 100 }, { key: "c", startedAt: 99 }]).map((item) => item.key)).toEqual(["c", "a", "b"]);
  });
});
