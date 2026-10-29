/** The tablet preview is hosted under its own path; desktop builds keep ''. */
export const APP_BASE_PATH = (process.env.NEXT_PUBLIC_APP_BASE_PATH || "").replace(/\/+$/, "");

export function appPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return value;
  const prefixed = !APP_BASE_PATH || value === APP_BASE_PATH || value.startsWith(`${APP_BASE_PATH}/`) || value.startsWith(`${APP_BASE_PATH}?`) ? value : `${APP_BASE_PATH}${value}`;
  if (process.env.NEXT_PUBLIC_WEB_MODE !== "true") return prefixed;
  const suffixIndex = prefixed.search(/[?#]/);
  const path = suffixIndex < 0 ? prefixed : prefixed.slice(0, suffixIndex);
  const suffix = suffixIndex < 0 ? "" : prefixed.slice(suffixIndex);
  // Match Next's web-only trailingSlash setting without redirecting API POSTs.
  return `${path.endsWith("/") || /\.[^/]+$/.test(path) ? path : `${path}/`}${suffix}`;
}
