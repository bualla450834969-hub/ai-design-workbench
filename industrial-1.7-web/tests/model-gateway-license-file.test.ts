import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelGatewayProvider } from "@/lib/providers/gateway";
import type { ProviderContext } from "@/lib/providers/types";

const context = {
  agentId: "appearance-variants",
  systemPrompt: "system",
  userPrompt: "draw a lamp",
  assets: [],
} as ProviderContext;
const dirs: string[] = [];

function useDataDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "idai-gateway-"));
  dirs.push(dir);
  vi.stubEnv("IDAI_DATA_DIR", dir);
  return dir;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("model gateway license file", () => {
  it("reads url and token from license-gateway.json when env is empty", () => {
    const dir = useDataDir();
    writeFileSync(path.join(dir, "license-gateway.json"), JSON.stringify({ url: "https://gateway.example/root/", token: "file-token" }));
    expect(new ModelGatewayProvider().isConfigured()).toBe(true);
  });

  it("keeps env credentials ahead of the license file", () => {
    const dir = useDataDir();
    writeFileSync(path.join(dir, "license-gateway.json"), JSON.stringify({ url: "https://file.example", token: "file-token" }));
    vi.stubEnv("MODEL_GATEWAY_URL", "https://env.example");
    vi.stubEnv("MODEL_GATEWAY_TOKEN", "env-token");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: "ok", provider: "gateway", model: "m" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    return new ModelGatewayProvider().generateText(context).then(async (result) => {
      expect(result.text).toBe("ok");
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://env.example/v1/generate/text");
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer env-token");
      expect(new Headers(init.headers).get("X-Client")).toBe("industrial-design-agents-desktop");
    });
  });

  it("fills only the empty env field from the license file and posts images to the gateway", async () => {
    const dir = useDataDir();
    writeFileSync(path.join(dir, "license-gateway.json"), JSON.stringify({ url: "https://file.example/gw/", token: "file-token" }));
    vi.stubEnv("MODEL_GATEWAY_URL", "");
    vi.stubEnv("MODEL_GATEWAY_TOKEN", "env-token");
    vi.stubEnv("DESKTOP_MODE", "true");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ imageUrls: ["https://cdn.example/a.png"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new ModelGatewayProvider().generateImages(context, 2);
    expect(result.imageUrls).toEqual(["https://cdn.example/a.png"]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://file.example/gw/v1/generate/images");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer env-token");
    expect(JSON.parse(String(init.body)).count).toBe(2);
  });

  it("stays unconfigured for web mode without desktop mode, and when the file is missing", () => {
    useDataDir();
    vi.stubEnv("WEB_MODE", "true");
    vi.stubEnv("DESKTOP_MODE", "false");
    vi.stubEnv("MODEL_GATEWAY_URL", "https://env.example");
    vi.stubEnv("MODEL_GATEWAY_TOKEN", "env-token");
    expect(new ModelGatewayProvider().isConfigured()).toBe(false);
    vi.stubEnv("WEB_MODE", "");
    vi.stubEnv("MODEL_GATEWAY_URL", "");
    vi.stubEnv("MODEL_GATEWAY_TOKEN", "");
    expect(new ModelGatewayProvider().isConfigured()).toBe(false);
  });
});
