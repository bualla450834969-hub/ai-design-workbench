export function normalizedTextPrefix(value: string, maxChars: number) {
  if (!Number.isFinite(maxChars) || maxChars <= 0) return "";
  return value.replace(/\s+/g, " ").trim().slice(0, Math.floor(maxChars));
}
