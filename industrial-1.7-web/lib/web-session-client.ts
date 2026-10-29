import { APP_BASE_PATH, appPath } from "@/lib/app-path";

const key = `idai-web-session:${APP_BASE_PATH || "/"}`;

/** Share only a nonce. Private drafts stay in authenticated server storage. */
export function announceWebSessionChange() {
  if (process.env.NEXT_PUBLIC_WEB_MODE !== "true") return;
  try { localStorage.setItem(key, `${Date.now()}:${Math.random()}`); } catch { /* storage may be disabled */ }
}

export function watchWebSessionChanges() {
  if (process.env.NEXT_PUBLIC_WEB_MODE !== "true") return () => {};
  const changed = (event: StorageEvent) => {
    if (event.key === key) window.location.replace(appPath("/login"));
  };
  window.addEventListener("storage", changed);
  return () => window.removeEventListener("storage", changed);
}
