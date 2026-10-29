/* Public assets only. Project data and authenticated HTML always use the network. */
const SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `idai-pwa:${encodeURIComponent(SCOPE.pathname)}:`;
const BUILD_ID = "__WEB_BUILD_ID__";
const CACHE = `${CACHE_PREFIX}public-${BUILD_ID}`;
const OFFLINE_URL = new URL("offline.html", SCOPE).href;
const PUBLIC_URLS = new Set([
  "offline.html", "manifest.webmanifest", "icons/icon.svg",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
].map((path) => new URL(path, SCOPE).href));

function localPath(url) {
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return null;
  return url.pathname.slice(SCOPE.pathname.length);
}

function publicAsset(url) {
  const path = localPath(url);
  if (path === null || url.search) return false;
  if (PUBLIC_URLS.has(url.href)) return true;
  // Only content-addressed JS/CSS/fonts; never image optimization or user files.
  return path.startsWith("_next/static/") && /(?:^|[/.\-])[a-f0-9]{8,}(?:[.\-]|$)/i.test(path)
    && /\.(?:js|css|woff2?|ttf|otf)$/.test(path);
}

function cacheableResponse(url, response) {
  if (!response.ok || response.redirected || response.type === "opaque" || response.type === "opaqueredirect") return false;
  if (/\b(?:private|no-store)\b/i.test(response.headers.get("cache-control") || "")) return false;
  return url.href === OFFLINE_URL || !/text\/html/i.test(response.headers.get("content-type") || "");
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all([...PUBLIC_URLS].map(async (url) => {
    const response = await fetch(new Request(url, { cache: "reload", credentials: "omit" }));
    if (!cacheableResponse(new URL(url), response)) throw new Error("Public offline assets are unavailable");
    await cache.put(url, response);
  }))));
  // Updates wait for the user; installation never reloads an active task.
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "ACTIVATE_UPDATE" || !event.source?.url) return;
  if (localPath(new URL(event.source.url)) === null) return;
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("authorization")) return;
  const url = new URL(request.url);
  const path = localPath(url);
  if (path === null || path === "api" || path.startsWith("api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE);
      const offline = await cache.match(OFFLINE_URL);
      if (offline) return new Response((await offline.text()).replace("<!--APP_BASE-->", `<base href="${SCOPE.href}">`), { status: 503, headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" } });
      return new Response("网络暂不可用，请联网后重新打开工业设计智能体。", { status: 503, headers: { "Content-Type": "text/plain;charset=utf-8" } });
    }));
    return;
  }
  if (!publicAsset(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (cacheableResponse(url, response)) event.waitUntil(cache.put(request, response.clone()));
    return response;
  })());
});
