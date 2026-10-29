import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { apiError, noStoreJson } from "@/lib/http";
import { store } from "@/lib/store";
import { migrateLegacyBoardItemCount } from "@/lib/generation-board";
export const runtime = "nodejs";

const workspaceStateSchema = z.object({
  selectedAssets: z.array(z.string()).optional(),
  agentId: z.enum(["appearance-variants", "local-retouch"]).optional(),
  workflowKind: z.enum(["shape", "view", "cmf", "decal", "scene", "packaging", "detail"]).optional(),
  overallWorkflowKind: z.enum(["shape", "view", "cmf", "decal", "scene", "packaging", "detail"]).optional(),
  designDirections: z.record(z.string(), z.string()).optional(),
  specifiedAngle: z.string().max(160).optional(),
  showDimensions: z.boolean().optional(),
  reconstructionRatio: z.number().int().min(0).max(100).optional(),
  outputCount: z.number().int().min(1).max(100).optional(),
  boardItems: z.preprocess(migrateLegacyBoardItemCount, z.union([z.literal(1), z.literal(4), z.literal(9)])).optional(),
  resolution: z.enum(["1K", "2K", "4K"]).optional(),
  input: z.string().max(20_000).optional(),
  generationMode: z.enum(["source", "reference", "text", "local"]).optional(),
  aspectRatio: z.enum(["auto", "1:1", "4:3", "3:4", "16:9", "9:16"]).optional(),
  workspaceMode: z.enum(["parameter", "free-chat"]).optional(),
  freeChatInput: z.string().max(5000).optional(),
  freeChatSelectedAssets: z.array(z.string()).max(9).optional(),
  freeResolution: z.enum(["1K", "2K", "4K"]).optional(),
  freeAspectRatio: z.enum(["auto", "1:1", "4:3", "3:4", "16:9", "9:16"]).optional(),
  freeChatBoardItems: z.preprocess(migrateLegacyBoardItemCount, z.union([z.literal(1), z.literal(4), z.literal(9)])).optional(),
}).superRefine((state, context) => {
  if ((state.agentId === "local-retouch" || state.generationMode === "local") && state.workflowKind && !["shape", "cmf", "decal"].includes(state.workflowKind)) context.addIssue({ code: "custom", path: ["workflowKind"], message: "局部改图只支持造型、CMF和贴花" });
});

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession(request);
    const { id } = await context.params;
    const project = store.assertProject(user.id, id);
    return noStoreJson({ project });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireSession(request);
    const { id } = await context.params;
    const body = await request.json();
    const update: { name?: string; description?: string; workspaceState?: Record<string, unknown> } = {};
    if (body.name !== undefined) update.name = String(body.name);
    if (body.description !== undefined) update.description = String(body.description);
    if (body.workspaceState !== undefined) update.workspaceState = workspaceStateSchema.parse(body.workspaceState);
    const project = store.updateProject(user.id, id, update);
    return noStoreJson({ project });
  } catch (error) { return apiError(error); }
}
