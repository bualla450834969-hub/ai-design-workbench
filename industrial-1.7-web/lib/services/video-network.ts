/** Read the same proxy configuration the desktop launcher passes to Node. */
export function videoDownloadProxy(url: URL, env: Record<string, string | undefined> = process.env): string | undefined {
  const exclusions = (env.NO_PROXY || env.no_proxy || "").split(/[\s,]+/).filter(Boolean);
  if (exclusions.some((entry) => {
    if (entry === "*") return true;
    const [name, port] = entry.toLowerCase().replace(/^\*?\./, "").split(":");
    return (!port || port === (url.port || "443")) && (url.hostname === name || url.hostname.endsWith(`.${name}`));
  })) return;
  const raw = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
  if (!raw?.trim()) return;
  try {
    const proxy = new URL(raw);
    if (!["http:", "https:"].includes(proxy.protocol)) throw new Error();
    return proxy.toString();
  } catch { throw new Error("系统代理地址无法使用，请检查网络代理设置后重新保存视频。"); }
}

export type VideoFailureStage = "query" | "download" | "save";

/** Keep diagnostics useful without returning URLs, credentials or raw bodies. */
export function videoFailureDetails(error: unknown) {
  const value = error as { name?: string; code?: string; status?: number; cause?: { code?: string; name?: string } };
  const candidate = value?.cause?.code || value?.code || value?.name;
  const code = typeof candidate === "string" && /^(?:UND_ERR_[A-Z_]+|E[A-Z_]+|CERT_[A-Z_]+|TimeoutError|AbortError)$/.test(candidate) ? candidate : undefined;
  return { ...(code ? { code } : {}), ...(Number.isInteger(value?.status) ? { status: value.status } : {}) };
}

export function videoFailureMessage(error: unknown, stage: VideoFailureStage) {
  const { code } = videoFailureDetails(error);
  const action = stage === "query" ? "查询视频进度" : stage === "download" ? "下载视频" : "保存视频";
  if (/TIMEOUT|TimeoutError/.test(code || "")) return `${action}超时，请检查网络或代理后重试。`;
  if (/SOCKET|ECONN|ENET|EHOST/.test(code || "")) return `${action}连接中断，请检查网络或代理后重试。`;
  if (error instanceof Error && /[\u3400-\u9fff]/.test(error.message)) return error.message.replace(/图片/g, "视频");
  return `${action}未完成，请检查网络或代理后重试。`;
}
