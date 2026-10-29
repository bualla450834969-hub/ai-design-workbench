import { NextResponse } from "next/server";

export function apiError(error: unknown, fallback = "请求失败") {
  const message = error instanceof Error ? error.message : fallback;
  const suppliedStatus = error && typeof error === "object" && "status" in error ? Number(error.status) : NaN;
  const status = Number.isInteger(suppliedStatus) && suppliedStatus >= 400 && suppliedStatus <= 599
    ? suppliedStatus : message === "UNAUTHORIZED" ? 401 : message.includes("无权") ? 403 : message.includes("不存在") ? 404 : 400;
  return NextResponse.json({ error: message === "UNAUTHORIZED" ? "请先登录" : message }, { status });
}

export function noStoreJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
