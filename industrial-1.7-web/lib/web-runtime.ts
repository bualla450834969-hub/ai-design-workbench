import { store } from "@/lib/store";
import { isWebMode, pingWebDatabase } from "@/lib/web-runtime-database";
import { withUserProviderSnapshot } from "@/lib/web-providers";
import { runAgentJob } from "@/lib/services/orchestrator";
import { runFreeChatJob } from "@/lib/services/free-chat";
import type { WebTaskPayload } from "@/lib/web-runtime-task-types";
import { assertWebGenerationLicense, requireWebLicenseBinding } from "@/lib/web-generation-license";

interface RuntimeState { timer?: ReturnType<typeof setInterval>; busy: boolean; stopped: boolean }
declare global { var __idaiWebRuntime: RuntimeState | undefined }

async function execute(task: WebTaskPayload) {
  const { jobId, userId } = task.input;
  try {
    const user = store.users.get(userId);
    if (!user) throw new Error("排队账号已不存在，任务未执行");
    const webLicenseBindingId = requireWebLicenseBinding(task.webLicenseBindingId);
    // Resolve this user's current credential by immutable providerId, then apply
    // the submitted public model snapshot. No key is persisted in queue data.
    await withUserProviderSnapshot({ ...user, webLicenseBindingId }, task.provider, async () => {
      const job = store.getJob(userId, jobId);
      if (job.status === "cancelled") return;
      // Provider resolution may await DNS. Validate the original browser/device
      // binding as the final preflight, rather than trusting a current user ID.
      await assertWebGenerationLicense(userId, webLicenseBindingId);
      if (store.getJob(userId, jobId).status === "cancelled") return;
      if (task.kind === "agent") await runAgentJob(task.input);
      else await runFreeChatJob(task.input);
    });
  } catch (error) {
    // Orchestrators already retain partial results and classify cancellation.
    // Only preflight failures need their terminal state applied here.
    const job = store.getJob(userId, jobId);
    if (job.status === "queued" || job.status === "running") {
      const message = error instanceof Error ? error.message : "后台任务执行失败";
      store.updateJob(jobId, { status: "failed", progress: 100, error: message, stageLabel: message, recoveryAvailable: true });
    }
  } finally {
    store.completeWebTask(jobId);
  }
}

async function drain(state: RuntimeState) {
  if (state.busy || state.stopped) return;
  state.busy = true;
  try {
    // Detect a lost session even while the site is otherwise idle. Each durable
    // claim commits synchronously before any potentially charged provider call.
    pingWebDatabase();
    for (;;) {
      if (state.stopped) break;
      const task = store.claimNextWebTask();
      if (!task) break;
      await execute(task);
    }
  } catch {
    state.stopped = true;
    if (state.timer) clearInterval(state.timer);
    console.error("Web 后台队列已停止；请检查数据库和服务日志后重启。未自动重试已开始的任务。");
  } finally { state.busy = false; }
}

/** Starts inside the one long-lived Node server. Browser disconnect, refresh,
 * logout, and Android backgrounding do not own or cancel this process. */
export function startWebRuntime() {
  if (!isWebMode()) return;
  const previous = globalThis.__idaiWebRuntime;
  if (previous) return;
  // Importing store has already acquired the PostgreSQL single-instance lock,
  // hydrated its atomic snapshot, and classified interrupted claimed tasks.
  pingWebDatabase();
  const state: RuntimeState = { busy: false, stopped: false };
  globalThis.__idaiWebRuntime = state;
  state.timer = setInterval(() => { void drain(state); }, 1500);
  state.timer.unref();
  void drain(state);
}

export function wakeWebRuntime() {
  if (!isWebMode()) return;
  startWebRuntime();
  const state = globalThis.__idaiWebRuntime!;
  if (state.stopped) throw Object.assign(new Error("后台队列已停止，请联系管理员重启服务"), { status: 503 });
  // A fresh event-loop turn ensures the enqueue transaction and HTTP response
  // finish before the provider request starts, without tying work to Request.
  setImmediate(() => { void drain(state); });
}
