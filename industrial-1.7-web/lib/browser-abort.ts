export type BrowserAbortScope = { signal: AbortSignal; dispose(): void };

/** AbortController-based composition also works on Safari versions without
 * AbortSignal.any/timeout. Call dispose after the complete operation/body read. */
export function createBrowserAbort(options: { signals?: ReadonlyArray<AbortSignal | null | undefined>; timeoutMs?: number; timeoutMessage?: string } = {}): BrowserAbortScope {
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 0 || options.timeoutMs > 2_147_483_647)) throw new RangeError("请求超时时间无效。");
  const controller = new AbortController();
  const listeners = new Map<AbortSignal, () => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
    for (const [signal, listener] of listeners) signal.removeEventListener("abort", listener);
    listeners.clear();
  };
  const abort = (reason?: unknown) => { if (!controller.signal.aborted) controller.abort(reason); dispose(); };
  for (const signal of options.signals || []) {
    if (!signal || listeners.has(signal)) continue;
    if (signal.aborted) { abort(signal.reason); break; }
    const listener = () => abort(signal.reason);
    listeners.set(signal, listener); signal.addEventListener("abort", listener, { once: true });
  }
  if (!controller.signal.aborted && options.timeoutMs !== undefined) timer = setTimeout(() => abort(new DOMException(options.timeoutMessage || "请求超时，请稍后手动重试。", "TimeoutError")), options.timeoutMs);
  return { signal: controller.signal, dispose };
}
