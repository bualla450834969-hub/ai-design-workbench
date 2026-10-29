import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { store } from "@/lib/store";
import { normalizeProjectWorkspaceState } from "@/lib/project-workspace-state";
import type { Asset } from "@/types/domain";

const require = createRequire(import.meta.url);
const temporaryDirectories: string[] = [];
const originalRegistry = process.env.LICENSE_REGISTRY_FILE;
const originalCloudConfig = process.env.LICENSE_CLOUD_CONFIG;
const originalDataDirectory = process.env.IDAI_DATA_DIR;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (originalRegistry === undefined) delete process.env.LICENSE_REGISTRY_FILE;
  else process.env.LICENSE_REGISTRY_FILE = originalRegistry;
  if (originalCloudConfig === undefined) delete process.env.LICENSE_CLOUD_CONFIG;
  else process.env.LICENSE_CLOUD_CONFIG = originalCloudConfig;
  if (originalDataDirectory === undefined) delete process.env.IDAI_DATA_DIR;
  else process.env.IDAI_DATA_DIR = originalDataDirectory;
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("project and asset ergonomics", () => {
  it("can delete a project and restore the default preset", () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "idai-project-delete-"));
    temporaryDirectories.push(dataDirectory);
    process.env.IDAI_DATA_DIR = dataDirectory;
    const user = store.users.get("student-demo")!;
    const project = store.createProject(user.id, `delete-${crypto.randomUUID()}`);
    expect(project.folderName).toContain("delete-");
    const projectDirectory = path.join(dataDirectory, "projects", project.folderName!);
    fs.mkdirSync(projectDirectory, { recursive: true });
    fs.writeFileSync(path.join(projectDirectory, "upload.png"), "test");
    const resultsDirectory = path.join(projectDirectory, "成果图");
    fs.mkdirSync(resultsDirectory, { recursive: true });
    fs.writeFileSync(path.join(resultsDirectory, "kept.png"), "result");
    store.deleteProject(user.id, project.id);

    expect(store.listProjects(user.id).some((item) => item.id === project.id)).toBe(false);
    expect(fs.existsSync(projectDirectory)).toBe(false);
    const recycled = store.listRecycledProjects(user.id).find((item) => item.projectId === project.id)!;
    const archiveRoot = path.join(dataDirectory, "projects", ".idai-recycle-bin", recycled.id, "project", "成果图");
    expect(fs.readdirSync(archiveRoot)).toContain("kept.png");
    const recovered = store.restoreRecycledProject(user.id, recycled.id);
    expect(recovered.id).toBe(project.id);
    expect(fs.existsSync(path.join(dataDirectory, "projects", recovered.folderName!, "upload.png"))).toBe(true);

    const restored = store.restoreDefaultProject(user.id);
    expect(restored).toMatchObject({ name: "我的第一个设计项目" });
    expect(store.listProjects(user.id)[0]).toMatchObject({ id: restored.id });
  });

  it("uses readable project-name folders and avoids collisions", () => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "idai-project-folder-"));
    temporaryDirectories.push(dataDirectory);
    process.env.IDAI_DATA_DIR = dataDirectory;
    const user = store.users.get("student-demo")!;
    const first = store.createProject(user.id, "手持小风扇");
    const second = store.createProject(user.id, "手持小风扇");

    expect(first.folderName).toBe("手持小风扇");
    expect(second.folderName).toBe("手持小风扇 (2)");
    expect(fs.existsSync(path.join(dataDirectory, "projects", first.folderName!))).toBe(true);
    expect(fs.existsSync(path.join(dataDirectory, "projects", second.folderName!))).toBe(true);
  });

  it("returns newest assets first and finds repeated uploads by hash", () => {
    const user = store.users.get("student-demo")!;
    const project = store.createProject(user.id, `assets-${crypto.randomUUID()}`);
    const older: Asset = { id: crypto.randomUUID(), projectId: project.id, name: "old.png", type: "image/png", size: 3, role: "structure", url: "/api/assets/old", createdAt: "2026-01-01T00:00:00.000Z", sha256: "same" };
    const newer: Asset = { id: crypto.randomUUID(), projectId: project.id, name: "new.png", type: "image/png", size: 3, role: "structure", url: "/api/assets/new", createdAt: "2026-01-02T00:00:00.000Z", sha256: "other" };

    store.addAsset(user.id, older);
    store.addAsset(user.id, newer);

    expect(store.listAssets(user.id, project.id).map((asset) => asset.id)).toEqual([newer.id, older.id]);
    expect(store.findAssetByHash(user.id, project.id, "same", "structure")?.id).toBe(older.id);
  });

  it("keeps an independent infinite-canvas layout on each project", () => {
    const user = store.loginDesktop(`canvas-${crypto.randomUUID()}`);
    const first = store.createProject(user.id, `canvas-a-${crypto.randomUUID()}`);
    const second = store.createProject(user.id, `canvas-b-${crypto.randomUUID()}`);
    store.updateProject(user.id, first.id, {
      canvas: {
        items: [{ assetId: "asset-a", x: 120, y: -40, width: 360, height: 260 }],
        viewport: { x: 22, y: 35, zoom: 0.8 },
      },
    });
    expect(store.assertProject(user.id, first.id).canvas?.items[0]).toMatchObject({ assetId: "asset-a", x: 120 });
    expect(store.assertProject(user.id, second.id).canvas).toBeUndefined();
  });

  it("keeps images, prompt and parameters isolated for every project", () => {
    const user = store.loginDesktop(`workspace-${crypto.randomUUID()}`);
    const first = store.createProject(user.id, `workspace-a-${crypto.randomUUID()}`);
    const second = store.createProject(user.id, `workspace-b-${crypto.randomUUID()}`);
    store.updateProject(user.id, first.id, {
      workspaceState: { selectedAssets: ["asset-a"], input: "保留拖拉机驾驶舱", outputCount: 12, workspaceMode: "free-chat" },
    });
    store.updateProject(user.id, second.id, {
      workspaceState: { selectedAssets: ["asset-b"], input: "按摩椅采用暖灰配色", outputCount: 3, workspaceMode: "parameter" },
    });

    expect(store.assertProject(user.id, first.id).workspaceState).toMatchObject({ selectedAssets: ["asset-a"], input: "保留拖拉机驾驶舱", outputCount: 12, workspaceMode: "free-chat" });
    expect(store.assertProject(user.id, second.id).workspaceState).toMatchObject({ selectedAssets: ["asset-b"], input: "按摩椅采用暖灰配色", outputCount: 3, workspaceMode: "parameter" });
    expect(normalizeProjectWorkspaceState(null)).toMatchObject({ selectedAssets: [], input: "", outputCount: 1, reconstructionRatio: 70, workspaceMode: "parameter" });
    expect(normalizeProjectWorkspaceState({ generationMode: "reference" })).toMatchObject({ generationMode: "reference" });
  });
});

describe("license manager direct codes", () => {
  it("issues without a device id and supports deleting the signing record", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "idai-license-manager-"));
    temporaryDirectories.push(directory);
    const registry = path.join(directory, "registry.json");
    const cloudConfig = path.join(directory, "cloud.json");
    await fs.promises.writeFile(cloudConfig, JSON.stringify({ serverUrl: "https://license.example.com", adminToken: "test-token" }));
    process.env.LICENSE_REGISTRY_FILE = registry;
    process.env.LICENSE_CLOUD_CONFIG = cloudConfig;
    const modulePath = path.resolve("授权管理工具", "license-manager.cjs");
    delete require.cache[require.resolve(modulePath)];
    const manager = require(modulePath) as {
      issue: (input: Record<string, string>) => { licenseId: string; code: string };
      batchIssue: (input: Record<string, string>) => { licenseIds: string[]; code: string };
      deleteLicense: (input: Record<string, string>) => void;
      page: (result?: string, error?: string, issuedId?: string) => string;
      mergeCloudLicenses: (remote: { licenses: Record<string, unknown> }) => unknown;
      activateDevice: (input: { licenseId: string; deviceId: string }, persist?: boolean) => unknown;
      reissue: (input: { licenseId: string }) => { code: string };
      syncLicense: (licenseId: string) => Promise<unknown>;
    };
    const first = manager.issue({ licenseId: "A-001", userName: "备注一", days: "365" });
    const second = manager.issue({ licenseId: "B-001", userName: "备注二", days: "365" });
    const data = JSON.parse(await readFile(registry, "utf8"));

    expect(first.code).toMatch(/^ID2(?:-[A-F0-9]{4}){6}$/);
    expect(first.code).toHaveLength(33);
    expect(second.licenseId).toBe("B-001");
    expect(data.licenses["A-001"].mode).toBe("direct-code");
    expect(data.licenses["B-001"].mode).toBe("direct-code");
    expect(data.licenses["B-001"]).not.toHaveProperty("devices");
    expect(manager.page(second.code, "", second.licenseId)).toContain("复制授权码");
    expect(manager.page(second.code, "", second.licenseId)).toContain("copyLicenseCode");
    expect(manager.page()).toContain("搜索学员姓名或授权编号");
    expect(manager.page()).toContain("导出授权清单");
    expect(manager.page()).toContain("最新在前（默认）");
    expect(manager.page()).toContain("sortLicenses");

    const copied: string[] = [];
    const html = manager.page(second.code, "", second.licenseId);
    const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    const context = {
      navigator: { clipboard: { writeText: async (value: string) => { copied.push(value); } } },
      document: { getElementById: () => ({ value: second.code }) },
      setTimeout: () => 0,
    } as Record<string, any>;
    vm.runInNewContext(script!, context);
    await context.copyLicenseCode({ textContent: "复制全部结果" });
    await context.copyCode({ textContent: "复制授权码", closest: () => ({ dataset: { code: second.code } }) });
    expect(copied).toEqual([second.code, second.code]);

    const batch = manager.batchIssue({ userNames: "学员甲\n学员乙", seatLimit: "2", licenseType: "permanent" });
    expect(batch.licenseIds).toHaveLength(2);
    expect(batch.code).toContain("学员甲");
    expect(batch.code).toContain("学员乙");

    manager.mergeCloudLicenses({ licenses: {
      "A-001": {
        activations: {
          laptop: { active: true, platform: "win32" },
          desktop: { active: true, platform: "win32" },
          former: { active: false, platform: "win32" },
        },
        seatLimit: 3,
      },
    } });
    const afterCloudRefresh = JSON.parse(fs.readFileSync(registry, "utf8"));
    expect(Object.values(afterCloudRefresh.licenses["A-001"].activations).filter((item: any) => item.active !== false)).toHaveLength(2);
    expect(afterCloudRefresh.licenses["A-001"].code).toBe(first.code);
    expect(manager.page()).toContain("2 / 3");
    expect(manager.page()).toContain('value="activate-device"');
    expect(manager.page()).toContain("恢复设备");
    manager.activateDevice({ licenseId: "A-001", deviceId: "former" });
    expect(manager.page()).toContain("3 / 3");
    manager.mergeCloudLicenses({ licenses: { "A-001": { activations: {
      laptop: { active: true }, desktop: { active: true }, former: { active: false }, extra: { active: true },
    }, seatLimit: 3 } } });
    expect(() => manager.activateDevice({ licenseId: "A-001", deviceId: "former" })).toThrow("最多使用 3 台设备");

    const replacement = manager.reissue({ licenseId: "A-001" });
    expect(replacement.code).not.toBe(first.code);
    const afterReissue = JSON.parse(fs.readFileSync(registry, "utf8"));
    expect(afterReissue.licenses["A-001"].codeHistory[0].code).toBe(first.code);
    expect(manager.page()).toContain("历史授权码");
    expect(manager.page()).toContain(first.code);
    manager.mergeCloudLicenses({ licenses: { "A-001": { seatLimit: 3 } } });
    expect(JSON.parse(fs.readFileSync(registry, "utf8")).licenses["A-001"].codeHistory[0].code).toBe(first.code);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body));
      expect(sent.licenses["A-001"].code).toBeUndefined();
      expect(sent.licenses["A-001"].codeHistory).toBeUndefined();
      expect(sent.licenses["A-001"].codeHash).toBe(afterReissue.licenses["A-001"].codeHash);
      return new Response(JSON.stringify({ ok: true, licenses: {} }), { status: 200 });
    }));
    await manager.syncLicense("A-001");

    await fs.promises.writeFile(cloudConfig, "{}");
    const offline = manager.issue({ licenseId: "OFFLINE-001", userName: "离线兼容", days: "1" });
    expect(offline.code).toMatch(/^IDAI1\./);

    manager.deleteLicense({ licenseId: "B-001" });
    const afterDelete = JSON.parse(fs.readFileSync(registry, "utf8"));
    expect(afterDelete.licenses["B-001"]).toBeUndefined();
  });
});
