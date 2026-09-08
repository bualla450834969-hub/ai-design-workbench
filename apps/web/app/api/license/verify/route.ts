import { NextRequest, NextResponse } from "next/server";
import { verifyAndBindLicense } from "@/lib/license";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { licenseCode, deviceId } = body;

    if (!licenseCode || !deviceId) {
      return NextResponse.json({ valid: false, message: "缺少授权码或设备标识" }, { status: 400 });
    }

    const result = await verifyAndBindLicense(licenseCode, deviceId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ valid: false, message: error.message || "验证失败" }, { status: 500 });
  }
}
