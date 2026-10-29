"use client";

import { fetchWithTimeout } from "@/lib/client-operations";
import { readApiJson } from "@/lib/client-response";

export async function localJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  return readApiJson<T>(await fetchWithTimeout(path, init), "操作失败");
}

export function localSend<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  return localJson<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function deviceId() {
  const key = "idai-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing && /^[a-f0-9-]{36}$/i.test(existing)) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}
