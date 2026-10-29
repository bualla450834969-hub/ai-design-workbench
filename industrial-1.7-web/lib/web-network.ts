import { Agent } from "undici";
import { pinnedImageDispatcher, resolvePublicImageUrl } from "@/lib/services/safe-image-download";

async function publicTarget(value: string) {
  const target = await resolvePublicImageUrl(value);
  for (const { address } of target.addresses) {
    const normalized = address.toLowerCase();
    // Additional special-purpose ranges and cloud virtual platform address.
    if (/^192\.88\.99\./.test(normalized) || normalized === "168.63.129.16"
      || /^2001:(?:2|10|1[0-9a-f]|2[0-9a-f]):/.test(normalized) || /^3fff:/.test(normalized)) throw new Error("地址不属于可连接的公网服务");
  }
  return target;
}

/** DNS is validated and the resulting public addresses are pinned to the socket. */
export async function assertPublicHttpsUrl(value: string | URL) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("供应商地址格式不正确"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) throw new Error("供应商地址必须使用HTTPS，不能包含登录凭据、查询参数或片段");
  return (await publicTarget(url.toString())).url;
}

export async function webSafeFetch(value: string | URL, init: RequestInit = {}): Promise<Response> {
  let url = new URL(value);
  const original = url.origin;
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(660_000)]) : AbortSignal.timeout(660_000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("仅允许连接公网HTTPS地址");
    const target = await publicTarget(url.toString());
    const dispatcher = pinnedImageDispatcher(target.hostname, target.addresses);
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal, redirect: "manual", dispatcher } as RequestInit & { dispatcher: Agent });
    } catch {
      await dispatcher.destroy();
      throw new Error("无法连接供应商，请检查平台地址或稍后重试");
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      await dispatcher.destroy();
      if (!location || redirects === 3) throw new Error("供应商重定向次数过多");
      url = new URL(location, url);
      // Never forward a customer's credential to another origin, including on 307/308.
      if (url.origin !== original) throw new Error("供应商返回跨域跳转，已阻止凭据转发；请直接填写最终API地址");
      if (!["GET", "HEAD"].includes(init.method || "GET") && ![307, 308].includes(response.status)) throw new Error("供应商改变了请求方法，请检查API地址");
      continue;
    }
    // Keep the dispatcher alive until the body is consumed or cancelled.
    if (!response.body) { await dispatcher.destroy(); return response; }
    const maxBytes = 96 * 1024 * 1024;
    if (Number(response.headers.get("content-length") || 0) > maxBytes) { await response.body.cancel(); await dispatcher.destroy(); throw new Error("模型平台响应超过安全大小限制"); }
    const reader = response.body.getReader();
    let closed = false;
    let bytes = 0;
    const finish = async () => { if (!closed) { closed = true; reader.releaseLock(); await dispatcher.close(); } };
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const part = await reader.read();
          if (part.done) { controller.close(); await finish(); }
          else {
            bytes += part.value.byteLength;
            if (bytes > maxBytes) { await reader.cancel(); controller.error(new Error("模型平台响应超过安全大小限制")); await finish(); }
            else controller.enqueue(part.value);
          }
        } catch (error) { controller.error(error); await finish(); }
      },
      async cancel(reason) { await reader.cancel(reason); await finish(); },
    });
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  throw new Error("供应商连接失败");
}
