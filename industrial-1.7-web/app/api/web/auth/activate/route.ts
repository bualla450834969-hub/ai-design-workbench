import { NextRequest, NextResponse } from "next/server";
import { activateOfflineLicense, localSessionCookie, localSessionMaxAge, makeSessionToken, publicLicense, userFromLicense } from "@/lib/offline-license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { code?: unknown; deviceId?: unknown };
    if (!body || typeof body !== "object" || typeof body.code !== "string") {
      return NextResponse.json({ error: "授权请求只能包含授权码。" }, { status: 400 });
    }
    const record = activateOfflineLicense(body.code, typeof body.deviceId === "string" ? body.deviceId : undefined);
    const response = NextResponse.json({
      user: userFromLicense(record),
      storageMode: "browser-local",
      license: publicLicense(record),
    });
    response.cookies.set(localSessionCookie, makeSessionToken(record), {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: localSessionMaxAge,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "激活失败，请检查授权码";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
