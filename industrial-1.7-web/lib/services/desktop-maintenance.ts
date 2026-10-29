import fs from "node:fs";
import crypto from "node:crypto";
import { dataPath } from "@/lib/data-path";

export function assertNoDesktopMaintenance() {
  if (process.env.DESKTOP_MODE !== "true") return;
  let record: { busy?: boolean; ownerPid?: number; message?: string };
  try { record = JSON.parse(fs.readFileSync(dataPath("maintenance-lock.json"), "utf8")); }
  catch { return; }
  if (!record.busy || !Number.isSafeInteger(record.ownerPid) || (record.ownerPid || 0) <= 0) return;
  try { process.kill(record.ownerPid!, 0); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return; }
  const error = new Error(String(record.message || "正在应用模型设置或迁移项目文件，请稍后再操作。").slice(0, 240));
  Object.assign(error, { status: 503 });
  throw error;
}

/** Hold a short-lived server lease until an upload/paid analysis has settled. */
export function acquireDesktopOperation(label: string): () => void {
  assertNoDesktopMaintenance();
  if (process.env.DESKTOP_MODE !== "true") return () => {};
  const directory = dataPath("active-operations");
  fs.mkdirSync(directory, { recursive: true });
  const target = dataPath("active-operations", `${crypto.randomUUID()}.json`);
  const temporary = `${target}.tmp`;
  const cleanup = () => {
    for (const filename of [temporary, target]) {
      try { fs.rmSync(filename, { force: true }); }
      catch (error) { console.warn("Could not release desktop operation lease", error); }
    }
  };
  try {
    fs.writeFileSync(temporary, JSON.stringify({ ownerPid: process.pid, startedAt: new Date().toISOString(), label: label.slice(0, 120) }), { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, target);
    // Desktop may have acquired its lock between our first check and publication.
    // A published lease must be visible before paid work or file mutations start.
    assertNoDesktopMaintenance();
  } catch (error) {
    cleanup();
    throw error;
  }
  let released = false;
  return () => { if (!released) { released = true; cleanup(); } };
}
