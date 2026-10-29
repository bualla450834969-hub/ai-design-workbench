import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    product: "industrial-design-agent",
    version: "1.7.0",
    storageMode: "browser-local",
    license: "offline-local",
  }, { headers: { "Cache-Control": "no-store" } });
}
