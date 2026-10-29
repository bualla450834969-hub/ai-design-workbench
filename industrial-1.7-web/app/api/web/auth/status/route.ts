import { NextRequest, NextResponse } from "next/server";
import { localSessionCookie, publicLicense, readSessionToken, userFromLicense } from "@/lib/offline-license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const record = readSessionToken(request.cookies.get(localSessionCookie)?.value);
  if (!record) {
    return NextResponse.json({ error: "请使用授权码重新进入本地网页版" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({
    user: userFromLicense(record),
    storageMode: "browser-local",
    license: publicLicense(record),
  }, { headers: { "Cache-Control": "no-store" } });
}
