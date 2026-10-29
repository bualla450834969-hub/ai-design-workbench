import { lookup } from "node:dns/promises";
import net from "node:net";
import type { LookupFunction } from "node:net";
import { Agent } from "undici";

type Address = { address: string; family: number };
const PRIVATE_URL_ERROR = "图片地址指向本机或内网，已拒绝下载";
const MAX_DNS_BYTES = 64 * 1024;

function ipv6Words(address: string) {
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [left, right = ""] = normalized.split("::");
  const head = left ? left.split(":").map((part) => parseInt(part, 16)) : [];
  const tail = right ? right.split(":").map((part) => parseInt(part, 16)) : [];
  return [...head, ...Array(Math.max(0, 8 - head.length - tail.length)).fill(0), ...tail] as number[];
}

/** Non-global addresses must never become an image transport target. */
export function isPrivateNetworkAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (net.isIPv4(normalized)) {
    const [a, b, c] = normalized.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 || (b === 2)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113);
  }
  if (!net.isIPv6(normalized)) return true;
  const words = ipv6Words(normalized);
  // IPv4-mapped and IPv4-compatible spellings include hexadecimal forms.
  if (words.slice(0, 5).every((part) => part === 0) && (words[5] === 0 || words[5] === 0xffff)) {
    return isPrivateNetworkAddress(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
  }
  // Only global unicast; exclude documentation and 6to4/Teredo tunnels whose
  // embedded endpoints can otherwise bypass the IPv4 checks above.
  return (words[0] & 0xe000) !== 0x2000 || words[0] === 0x2002
    || (words[0] === 0x2001 && (words[1] === 0 || words[1] === 0xdb8));
}

export function isFakeProxyAddress(address: string) {
  return net.isIPv4(address) && /^198\.(?:18|19)\./.test(address);
}

function checkedUrl(value: string) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("图片地址不是可下载链接");
  if (url.username || url.password) throw new Error("图片地址不能包含登录凭据");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || /\.(?:localhost|local|internal|lan|home)$/.test(hostname)
    || (!net.isIP(hostname) && !hostname.includes("."))) throw new Error(PRIVATE_URL_ERROR);
  return { url, hostname };
}

/** Pin the DNS decision to the connection, rather than checking then resolving again. */
export function pinnedImageDispatcher(hostname: string, addresses: Address[]) {
  if (!addresses.length || addresses.some((entry) => isPrivateNetworkAddress(entry.address))) throw new Error(PRIVATE_URL_ERROR);
  const pinnedLookup: LookupFunction = (host, options, callback) => {
    if (host.toLowerCase().replace(/\.$/, "") !== hostname) {
      callback(new Error("图片连接域名与安全校验不一致"), "", 4);
      return;
    }
    const family = typeof options === "number" ? options : options.family;
    const candidates = family ? addresses.filter((entry) => entry.family === family) : addresses;
    if (!candidates.length) { callback(new Error("图片地址不支持当前网络协议"), "", 4); return; }
    if (typeof options === "object" && options.all) callback(null, candidates);
    else callback(null, candidates[0].address, candidates[0].family);
  };
  return new Agent({ connect: { lookup: pinnedLookup, timeout: 15_000 }, maxOrigins: 1 });
}

async function boundedBody(response: Response, maxBytes: number, message: string) {
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) { await response.body?.cancel(); throw new Error(message); }
  if (!response.body) throw new Error("图片下载响应没有内容");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new Error(message); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

async function resolveFakeProxyHost(hostname: string): Promise<Address[]> {
  // A Fake-IP is NOT an allowlist exception. Verify the public hostname through
  // fixed HTTPS resolvers, then connect only to their validated real address.
  // No supplier URL, path, token or Authorization header reaches these services.
  const resolvers = [
    { url: "https://dns.alidns.com/resolve", hostname: "dns.alidns.com", address: "223.5.5.5" },
    { url: "https://cloudflare-dns.com/dns-query", hostname: "cloudflare-dns.com", address: "1.1.1.1" },
    { url: "https://dns.google/resolve", hostname: "dns.google", address: "8.8.8.8" },
  ];
  for (const resolver of resolvers) {
    const dispatcher = pinnedImageDispatcher(resolver.hostname, [{ address: resolver.address, family: 4 }]);
    try {
      const response = await fetch(`${resolver.url}?name=${encodeURIComponent(hostname)}&type=A`, {
        headers: { Accept: "application/dns-json" }, redirect: "error", signal: AbortSignal.timeout(6_000), dispatcher,
      } as RequestInit & { dispatcher: Agent });
      if (!response.ok) { await response.body?.cancel(); continue; }
      const record = JSON.parse((await boundedBody(response, MAX_DNS_BYTES, "公网域名校验响应过大")).toString("utf8")) as {
        Status?: number; Question?: { name?: string; type?: number } | Array<{ name?: string; type?: number }>; Answer?: Array<{ type?: number; data?: string }>;
      };
      const questions = Array.isArray(record.Question) ? record.Question : record.Question ? [record.Question] : [];
      if (record.Status !== 0 || !questions.some((question) => question.type === 1 && question.name?.toLowerCase().replace(/\.$/, "") === hostname)) continue;
      const addresses = (record.Answer || []).filter((answer) => answer.type === 1 && typeof answer.data === "string")
        .map((answer) => ({ address: answer.data!, family: 4 }));
      if (addresses.some((entry) => isPrivateNetworkAddress(entry.address))) throw new Error(PRIVATE_URL_ERROR);
      if (addresses.length) return addresses;
    } catch (error) {
      if (error instanceof Error && error.message === PRIVATE_URL_ERROR) throw error;
    } finally { await dispatcher.destroy(); }
  }
  throw new Error("代理返回了虚拟图片地址，无法验证公网下载地址；请暂时关闭代理的 Fake-IP DNS 或切换网络后重新保存，无需重新生图。");
}

export async function resolvePublicImageUrl(value: string) {
  const { url, hostname } = checkedUrl(value);
  let addresses: Address[];
  if (net.isIP(hostname)) addresses = [{ address: hostname, family: net.isIP(hostname) }];
  else {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      addresses = await Promise.race([
        lookup(hostname, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("图片域名解析超时，请稍后重新保存")), 10_000); timer.unref(); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }
  if (!net.isIP(hostname) && addresses.length && addresses.every((entry) => isFakeProxyAddress(entry.address))) addresses = await resolveFakeProxyHost(hostname);
  if (!addresses.length || addresses.some((entry) => isPrivateNetworkAddress(entry.address))) throw new Error(PRIVATE_URL_ERROR);
  return { url, hostname, addresses };
}

async function downloadPublicImageOnce(value: string, options: { maxBytes: number; headersForUrl?: (url: string) => Record<string, string> | undefined }) {
  let current = value;
  const signal = AbortSignal.timeout(90_000);
  for (let redirect = 0; redirect <= 4; redirect += 1) {
    const target = await resolvePublicImageUrl(current);
    const dispatcher = pinnedImageDispatcher(target.hostname, target.addresses);
    try {
      const response = await fetch(target.url, {
        headers: options.headersForUrl?.(target.url.toString()), redirect: "manual", signal, dispatcher,
      } as RequestInit & { dispatcher: Agent });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || redirect === 4) throw new Error("图片下载重定向次数过多");
        current = new URL(location, target.url).toString();
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error([401, 403].includes(response.status)
          ? `图片下载被拒绝（HTTP ${response.status}），可能是临时链接过期或受保护的下载地址；请检查供应商任务记录。`
          : `下载图片失败：HTTP ${response.status}`);
      }
      return {
        bytes: await boundedBody(response, options.maxBytes, "图片文件超过 50MB，无法安全保存"),
        contentType: response.headers.get("content-type"), finalUrl: target.url.toString(),
      };
    } finally { await dispatcher.destroy(); }
  }
  throw new Error("图片下载失败");
}

/** Only retry the read-only download. Never repeat a paid image generation request. */
export async function downloadPublicImage(value: string, options: { maxBytes: number; headersForUrl?: (url: string) => Record<string, string> | undefined }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await downloadPublicImageOnce(value, options); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transientHttp = /下载图片失败：HTTP (?:429|500|502|503|504)\b/.test(message);
      const transientNetwork = error instanceof TypeError || (error instanceof Error && /(?:fetch failed|timeout|timed out|network error|socket hang up)/i.test(`${error.name} ${message}`));
      if ((!transientHttp && !transientNetwork) || attempt === 2) {
        if (transientNetwork) throw new Error("图片下载连接失败，已自动重试 3 次；请检查网络后点击“重新保存”", { cause: error });
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw new Error("图片下载失败");
}
