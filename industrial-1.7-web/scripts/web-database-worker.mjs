import fs from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import postgres from "postgres";

const health = new Int32Array(workerData.health);
const sql = postgres(workerData.connectionString, {
  max: 1, connect_timeout: 10, idle_timeout: 0,
  connection: { statement_timeout: 20_000, application_name: "idai-tablet-web" },
  onclose: () => Atomics.store(health, 0, 1),
});
let connection;
let initialization;
let serial = Promise.resolve();

async function initialize() {
  connection = await sql.reserve();
  const [lock] = await connection`SELECT pg_try_advisory_lock(18404273, 166) AS acquired`;
  if (!lock.acquired) throw new Error("Web 数据库已有运行实例；本测试服务只允许一个进程");
  await connection`CREATE TABLE IF NOT EXISTS web_runtime_state (
    id TEXT PRIMARY KEY, revision BIGINT NOT NULL DEFAULT 0, value JSONB, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
  await connection`INSERT INTO web_runtime_state (id) VALUES ('main') ON CONFLICT (id) DO NOTHING`;
}

async function handle(message) {
  const completion = new Int32Array(message.completion);
  let result;
  let status = 1;
  try {
    if (Atomics.load(health, 0)) throw new Error("Web 数据库连接已失效，需要重启服务");
    await (initialization ??= initialize());
    if (Atomics.load(health, 0)) throw new Error("Web 数据库连接已失效，需要重启服务");
    if (message.operation === "load") {
      const [row] = await connection`SELECT value, revision FROM web_runtime_state WHERE id = 'main'`;
      if (row.value !== null && Number(row.value.revision) !== Number(row.revision)) throw new Error("Web 数据库存储版本不一致");
      result = row.value;
    } else if (message.operation === "save") {
      const expected = message.expectedRevision;
      const value = JSON.parse(message.serialized);
      if (!Number.isSafeInteger(expected) || expected < 0 || value.revision !== expected + 1) throw new Error("Web 数据库提交版本无效");
      const rows = await connection`UPDATE web_runtime_state SET value=${connection.json(value)}, revision=${expected + 1}, updated_at=now()
        WHERE id='main' AND revision=${expected} RETURNING revision`;
      if (rows.length !== 1) throw new Error("Web 数据库提交冲突，服务需要重启以保护已保存数据");
      result = true;
    } else if (message.operation === "ping") {
      await connection`SELECT 1`;
      result = true;
    } else throw new Error("未知 Web 数据库请求");
    if (Atomics.load(health, 0)) throw new Error("Web 数据库操作被中断，需要重启核对数据");
  } catch (error) {
    Atomics.store(health, 0, 1);
    status = 2;
    result = { error: error instanceof Error ? error.message : String(error) };
  }
  try {
    // Only the bridge reads this mode-0600 transient response. Payloads contain no
    // provider keys; no project data is ever logged to stdout.
    fs.writeFileSync(message.responsePath, JSON.stringify(status === 1 ? { value: result } : result), { mode: 0o600 });
  } catch { Atomics.store(health, 0, 1); status = 2; }
  Atomics.store(completion, 0, status);
  Atomics.notify(completion, 0);
}

parentPort.on("message", (message) => { serial = serial.then(() => handle(message)); });
