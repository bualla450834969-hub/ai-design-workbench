import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { dataPath } from "@/lib/data-path";

const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const TIMEOUT_MS = 30_000;

export function isWebMode() { return process.env.WEB_MODE === "true"; }

/** A synchronous bridge deliberately preserves the desktop store's API. The
 * dedicated worker owns exactly one PostgreSQL connection and session lock.
 * This is a single server snapshot store, not a distributed ORM. */
class WebDatabase {
  private worker: Worker;
  private health = new Int32Array(new SharedArrayBuffer(4));
  private directory: string;
  private failure = "Web 数据库连接不可用，已停止读写，请重启服务检查数据库";

  constructor() {
    if (process.env.DESKTOP_MODE === "true") throw new Error("WEB_MODE 与 DESKTOP_MODE 不能同时启用");
    if (!process.env.IDAI_DATA_DIR?.trim()) throw new Error("Web 服务必须配置独立的 IDAI_DATA_DIR 持久目录");
    if (!process.env.WEB_DATABASE_URL?.trim()) throw new Error("Web 服务必须配置独立的 WEB_DATABASE_URL");
    this.directory = dataPath("web-runtime-bridge");
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.worker = new Worker(path.join(process.cwd(), "scripts", "web-database-worker.mjs"), {
      workerData: { connectionString: process.env.WEB_DATABASE_URL, health: this.health.buffer },
    });
    this.worker.on("error", () => { Atomics.store(this.health, 0, 1); });
    this.worker.on("exit", () => { Atomics.store(this.health, 0, 1); });
    this.worker.unref();
  }

  assertHealthy() {
    if (Atomics.load(this.health, 0)) throw Object.assign(new Error(this.failure), { status: 503 });
  }

  request<T>(operation: "load" | "save" | "ping", payload?: unknown, expectedRevision?: number): T {
    this.assertHealthy();
    const serialized = payload === undefined ? undefined : JSON.stringify(payload);
    if (serialized && Buffer.byteLength(serialized) > MAX_SNAPSHOT_BYTES) {
      // Continuing after an in-memory mutation with a failed commit would expose
      // uncommitted data. All persistence errors poison this instance.
      Atomics.store(this.health, 0, 1);
      throw new Error("Web 项目数据超过单实例快照容量（64 MiB），服务已停止写入");
    }
    const completion = new Int32Array(new SharedArrayBuffer(4));
    const responsePath = path.join(this.directory, `${crypto.randomUUID()}.json`);
    try {
      this.worker.postMessage({ operation, serialized, expectedRevision, completion: completion.buffer, responsePath });
      if (Atomics.wait(completion, 0, 0, TIMEOUT_MS) === "timed-out") {
        Atomics.store(this.health, 0, 1);
        this.failure = "Web 数据库提交超时，服务已停止读写；请重启后核对任务状态";
        throw Object.assign(new Error(this.failure), { status: 503 });
      }
      if (!fs.existsSync(responsePath) || fs.statSync(responsePath).size > MAX_SNAPSHOT_BYTES + 4096) throw new Error("Web 数据库返回异常");
      const response = JSON.parse(fs.readFileSync(responsePath, "utf8")) as { value?: T; error?: string };
      if (Atomics.load(completion, 0) !== 1 || response.error) throw new Error(response.error || "Web 数据库提交失败");
      this.assertHealthy();
      return response.value as T;
    } catch (error) {
      Atomics.store(this.health, 0, 1);
      throw error;
    } finally {
      fs.rmSync(responsePath, { force: true });
    }
  }
}

declare global { var __idaiWebDatabase: WebDatabase | undefined }
function database() {
  if (!isWebMode()) throw new Error("Web 数据库仅在 WEB_MODE 启用");
  return globalThis.__idaiWebDatabase ??= new WebDatabase();
}
export function assertWebDatabaseHealthy() { if (isWebMode()) database().assertHealthy(); }
export function loadWebStore() { return database().request<Record<string, unknown> | null>("load"); }
export function saveWebStore(value: Record<string, unknown>, expectedRevision: number) { database().request("save", value, expectedRevision); }
export function pingWebDatabase() { database().request("ping"); }
