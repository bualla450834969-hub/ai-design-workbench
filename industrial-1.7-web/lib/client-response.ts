type ErrorPayload = { error?: unknown; message?: unknown };

function payloadMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const candidate = (payload as ErrorPayload).error || (payload as ErrorPayload).message;
  return typeof candidate === "string" ? candidate.trim() : "";
}

export async function readApiJson<T = Record<string, unknown>>(response: Response, fallback: string): Promise<T> {
  const body = await response.text().catch(() => "");
  if (!body.trim()) {
    const detail = response.ok
      ? "本机服务没有返回内容，请稍后重试"
      : `本机服务暂时不可用（${response.status || "连接中断"}），请等待几秒后重试`;
    throw new Error(`${fallback}：${detail}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`${fallback}：本机服务返回异常，请等待几秒后重试`);
  }

  if (!response.ok) throw new Error(payloadMessage(payload) || `${fallback}（${response.status}）`);
  return payload as T;
}
