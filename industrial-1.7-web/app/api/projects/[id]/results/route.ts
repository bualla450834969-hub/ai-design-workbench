import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { apiError, noStoreJson } from "@/lib/http";
import { projectResultRecords } from "@/lib/services/project-result-records";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession(request);
    const { id } = await context.params;
    return noStoreJson({ results: projectResultRecords(user.id, id) });
  } catch (error) { return apiError(error); }
}
