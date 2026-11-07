import { NextResponse } from "next/server";
import { userFacingError } from "@/lib/user-facing-error";

export function apiError(error: unknown, fallback = "请求失败") {
  const issue = error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)
    ? error.issues.find((item: unknown) => item && typeof item === "object" && "message" in item && typeof item.message === "string")
    : undefined;
  const message = issue?.message || (error instanceof Error ? error.message : fallback);
  const suppliedStatus = error && typeof error === "object" && "status" in error ? Number(error.status) : NaN;
  const status = Number.isInteger(suppliedStatus) && suppliedStatus >= 400 && suppliedStatus <= 599
    ? suppliedStatus : message === "UNAUTHORIZED" ? 401 : message.includes("无权") ? 403 : message.includes("不存在") ? 404 : 400;
  const customerMessage = message === "UNAUTHORIZED" ? "请先登录后重试。"
    : (status === 401 || status === 403) && /授权/.test(message)
      ? "设备授权无效或已失效，请重新输入授权码；若仍失败，请联系授权管理员。"
      : userFacingError(message, fallback);
  return NextResponse.json({ error: customerMessage }, { status });
}

export function noStoreJson(data: unknown, init?: ResponseInit) {
  const response = NextResponse.json(data, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
