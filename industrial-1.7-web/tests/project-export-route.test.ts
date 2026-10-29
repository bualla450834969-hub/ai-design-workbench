import { NextRequest } from "next/server";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { assertSameOrigin } from "@/lib/web-auth-common";

const fixture = vi.hoisted(() => ({ authorize: vi.fn(), exporter: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireSession: fixture.authorize }));
vi.mock("@/lib/services/project-export", () => ({ exportProjectResults: fixture.exporter }));
import { POST } from "@/app/api/projects/[id]/export/route";

const context = { params: Promise.resolve({ id: "project-a" }) };
function request(options: unknown, form = false, user = "user-a", origin = "https://tablet.example") {
  return new NextRequest("https://tablet.example/tablet/api/projects/project-a/export/", {
    method: "POST", headers: { Origin: origin, "X-Test-User": user, "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json" },
    body: form ? new URLSearchParams({ options: JSON.stringify(options) }) : JSON.stringify(options),
  });
}
beforeEach(() => {
  vi.stubEnv("WEB_MODE", "true"); vi.stubEnv("DESKTOP_MODE", "false"); vi.stubEnv("WEB_ORIGIN", "https://tablet.example");
  fixture.authorize.mockReset(); fixture.exporter.mockReset();
  fixture.authorize.mockImplementation(async (request: NextRequest) => {
    assertSameOrigin(request);
    const id = request.headers.get("x-test-user"); if (!id) throw new Error("UNAUTHORIZED"); return { id };
  });
  fixture.exporter.mockImplementation(async (userId: string) => {
    if (userId !== "user-a") throw Object.assign(new Error("项目不存在或无权访问"), { status: 403 });
    return { stream: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0x50, 0x4b, 3, 4])); controller.close(); } }), filename: "项目成果.zip" };
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("authenticated ZIP export transport", () => {
  it.each([false, true])("supports the %s native form mode with the same authenticated options", async (form) => {
    const options = { assetIds: ["asset-a", "asset-b"], favoritesOnly: false, includeComparison: false };
    const response = await POST(request(options, form), context);
    expect(response.status).toBe(200);
    expect(fixture.exporter).toHaveBeenCalledWith("user-a", "project-a", options);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toContain(`attachment; filename*=UTF-8''${encodeURIComponent("项目成果.zip")}`);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([0x50, 0x4b, 3, 4]));
  });

  it("keeps 500 selected IDs in the POST body rather than a long URL", async () => {
    const assetIds = Array.from({ length: 500 }, (_, index) => `owned-${index}`);
    const input = request({ assetIds }, true);
    expect(input.nextUrl.search).toBe("");
    const response = await POST(input, context); expect(response.status).toBe(200);
    expect(fixture.exporter.mock.calls[0][2].assetIds).toEqual(assetIds);
    await response.body?.cancel();
  });

  it.each([{ assetIds: [] }, { assetIds: Array.from({ length: 501 }, () => "asset") }, { assetIds: ["asset"], unknown: true }, { favoritesOnly: "true" }])("rejects invalid native form options %j", async (options) => {
    expect((await POST(request(options, true), context)).status).toBe(400);
    expect(fixture.exporter).not.toHaveBeenCalled();
  });

  it("rejects duplicated options fields and malformed JSON", async () => {
    for (const body of ["options=%7Bbroken", "options=%7B%7D&options=%7B%7D"]) {
      const response = await POST(new NextRequest("https://tablet.example/tablet/api/projects/project-a/export/", { method: "POST", headers: { Origin: "https://tablet.example", "X-Test-User": "user-a", "Content-Type": "application/x-www-form-urlencoded" }, body }), context);
      expect(response.status).toBe(400);
    }
    expect(fixture.exporter).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated, cross-origin, and foreign-project downloads", async () => {
    expect((await POST(request({}, true, ""), context)).status).toBe(401);
    expect((await POST(request({}, true, "user-a", "https://foreign.example"), context)).status).toBe(403);
    expect(fixture.exporter).not.toHaveBeenCalled();
    expect((await POST(request({}, true, "user-b"), context)).status).toBe(403);
    expect(fixture.exporter).toHaveBeenCalledOnce();
  });
});
