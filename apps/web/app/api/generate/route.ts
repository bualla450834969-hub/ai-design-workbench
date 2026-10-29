import { NextResponse } from "next/server";
import { runGenerationPipeline } from "@workbench/core";
import { verifyLicenseOnly } from "@/lib/license";

/**
 * 生成 API 路由
 * 验证授权码和设备绑定，通过后注入核心层
 */
export async function POST(req: Request) {
  const body = await req.json();
  const { licenseCode, deviceId } = body;

  // 验证授权码
  if (!licenseCode || !deviceId) {
    return NextResponse.json({ error: "缺少授权码或设备标识" }, { status: 401 });
  }

  const licenseResult = await verifyLicenseOnly(licenseCode, deviceId);
  if (!licenseResult.valid) {
    return NextResponse.json({ error: licenseResult.message || "授权验证失败" }, { status: 403 });
  }

  // IDAI1 载荷区分大小写。LIHUO / TESTER 仍按原样折叠为大写。
  const compactLicense = String(licenseCode).trim().replace(/\s+/g, "");
  const accessCode = /^idai1\./i.test(compactLicense)
    ? `IDAI1.${compactLicense.slice(6)}`
    : compactLicense.toUpperCase();

  const enhancedReq = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({
      ...body,
      accessCode,
    }),
  });

  return runGenerationPipeline(enhancedReq);
}
