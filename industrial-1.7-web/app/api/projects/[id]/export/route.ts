import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { apiError } from "@/lib/http";
import { exportProjectResults } from "@/lib/services/project-export";

export const runtime = "nodejs";
const exportOptions = z.object({ assetIds: z.array(z.string().min(1).max(200)).min(1).max(500).optional(), favoritesOnly: z.boolean().optional(), includeComparison: z.boolean().optional() }).strict();

async function readOptions(request: NextRequest) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim() === "application/x-www-form-urlencoded") {
    const form = await request.formData();
    if ([...form.keys()].some((key) => key !== "options") || form.getAll("options").length !== 1) throw Object.assign(new Error("导出参数无效"), { status: 400 });
    const value = form.get("options");
    if (typeof value !== "string" || value.length > 128_000) throw Object.assign(new Error("导出参数无效"), { status: 400 });
    try { return exportOptions.parse(JSON.parse(value)); }
    catch { throw Object.assign(new Error("导出参数无效"), { status: 400 }); }
  }
  return exportOptions.parse(await request.json());
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession(request);
    const { id } = await context.params;
    const options = await readOptions(request);
    const result = await exportProjectResults(user.id, id, options);
    return new Response(result.stream, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`, "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}
