import { NextResponse } from "next/server";
import { localSessionCookie } from "@/lib/offline-license";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(localSessionCookie, "", { httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
