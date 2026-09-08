const DEFAULT_GEEKNOW_STABLE_BRAIN_MODEL = "gemini-2.5-pro";

type ProviderChatRetryOptions<T> = {
  provider: string;
  model: string;
  scope: string;
  signal?: AbortSignal;
  attemptTimeoutMs?: number;
  run: (model: string, signal: AbortSignal) => Promise<T>;
};

function abortError() {
  const error = new Error("操作已取消");
  error.name = "AbortError";
  return error;
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "unknown provider error");
  return message
    .replace(/\bsk-[A-Za-z0-9_-]{6,}\b/g, "sk-***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .replace(/[A-Za-z0-9_-]{32,}/g, "***")
    .slice(0, 280);
}

export function isTransientProviderError(error: unknown) {
  const message = safeErrorMessage(error).toLowerCase();
  if (!message) return false;
  if (/api\s*key|unauthori[sz]ed|forbidden|余额|欠费|balance|quota exhausted|invalid key|鉴权|认证失败/.test(message)) {
    return false;
  }
  return /fetch failed|network|socket|connect|econn|enotfound|und_err|terminated|timeout|timed out|超过\s*\d+\s*秒|没有响应|连接.*中断|断开连接|暂时|稍后|繁忙|拥堵|限流|频率|rate.?limit|too many requests|overload|unavailable|no available channel|无可用通道|通道.*不可用|模型.*(?:不存在|不可用)|model.*not found|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b/.test(message);
}

function retryModels(provider: string, model: string) {
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedModel = model.trim();
  if (normalizedProvider === "geeknow" && normalizedModel !== DEFAULT_GEEKNOW_STABLE_BRAIN_MODEL) {
    return [normalizedModel, DEFAULT_GEEKNOW_STABLE_BRAIN_MODEL];
  }
  return [normalizedModel, normalizedModel];
}

function waitForRetry(ms: number, signal?: AbortSignal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function callProviderChatWithRetry<T>({
  provider,
  model,
  scope,
  signal,
  attemptTimeoutMs = 95_000,
  run
}: ProviderChatRetryOptions<T>) {
  const models = retryModels(provider, model);
  let lastError: unknown;

  for (let attempt = 0; attempt < models.length; attempt += 1) {
    if (signal?.aborted) throw abortError();
    const attemptModel = models[attempt];
    const attemptController = new AbortController();
    let attemptTimedOut = false;
    const abortFromCaller = () => attemptController.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    const attemptTimer = setTimeout(() => {
      attemptTimedOut = true;
      attemptController.abort();
    }, attemptTimeoutMs);
    try {
      return await run(attemptModel, attemptController.signal);
    } catch (caughtError) {
      if (signal?.aborted) throw abortError();
      const error = attemptTimedOut
        ? new Error(`${scope}超过 ${Math.round(attemptTimeoutMs / 1000)} 秒没有响应`)
        : caughtError;
      if (error instanceof Error && error.name === "AbortError") throw error;
      lastError = error;
      const transient = isTransientProviderError(error);
      console.warn("[provider-diagnostic]", JSON.stringify({
        scope,
        provider,
        model: attemptModel,
        attempt: attempt + 1,
        retrying: transient && attempt + 1 < models.length,
        error: safeErrorMessage(error)
      }));
      if (!transient || attempt + 1 >= models.length) throw error;
      await waitForRetry(700, signal);
    } finally {
      clearTimeout(attemptTimer);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("供应商方案模型没有返回结果。");
}

export function logProviderImageFailure({
  scope,
  provider,
  model,
  index,
  submitted,
  error
}: {
  scope: string;
  provider: string;
  model: string;
  index: number;
  submitted: boolean;
  error: unknown;
}) {
  console.error("[provider-image-failure]", JSON.stringify({
    scope,
    provider,
    model,
    index,
    submitted,
    transient: isTransientProviderError(error),
    error: safeErrorMessage(error)
  }));
}
