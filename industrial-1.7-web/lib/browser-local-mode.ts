/** A build-time opt-in. Desktop bundles always keep their existing local server. */
export function isBrowserLocalMode() {
  return process.env.NEXT_PUBLIC_WEB_LOCAL_MODE === "true" && typeof window !== "undefined" && !window.desktopAPI;
}

/** The sole server API families permitted by the browser-local product. */
export function isAuthorizationOnlyApi(pathname: string) {
  const path = pathname.replace(/\/+$/, "");
  return ["/api/web/auth/activate", "/api/web/auth/status", "/api/auth/logout", "/api/web/build", "/api/health"].includes(path);
}
