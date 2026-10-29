import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { apiError, noStoreJson } from "@/lib/http";
import { store } from "@/lib/store";

export async function GET(request: NextRequest) {
  try {
    const user = await requireSession(request);
    return noStoreJson({ projects: store.listProjects(user.id), user });
  } catch (error) { return apiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const input = z.object({
      name: z.string().trim().min(1).max(60).optional(),
      description: z.string().max(300).optional(),
      restoreDefault: z.boolean().optional(),
    }).parse(await request.json());
    if (input.restoreDefault) return noStoreJson({ project: store.restoreDefaultProject(user.id) }, { status: 201 });
    if (!input.name) throw new Error("项目名称不能为空");
    return noStoreJson({ project: store.createProject(user.id, input.name, input.description) }, { status: 201 });
  } catch (error) { return apiError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const input = z.object({
      projectId: z.string().min(1),
      name: z.string().trim().min(1).max(60).optional(),
      description: z.string().trim().max(300).optional(),
      canvas: z.object({
        items: z.array(z.object({
          assetId: z.string().min(1).max(100),
          x: z.number().finite().min(-1_000_000).max(1_000_000),
          y: z.number().finite().min(-1_000_000).max(1_000_000),
          width: z.number().finite().min(160).max(2400),
          height: z.number().finite().min(120).max(2400),
        })).max(1000),
        viewport: z.object({
          x: z.number().finite().min(-10_000_000).max(10_000_000),
          y: z.number().finite().min(-10_000_000).max(10_000_000),
          zoom: z.number().finite().min(0.05).max(4),
        }).optional(),
      }).optional(),
    }).refine((value) => value.name !== undefined || value.description !== undefined || value.canvas !== undefined, "没有需要修改的内容").parse(await request.json());
    return noStoreJson({ project: store.updateProject(user.id, input.projectId, input) });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireSession(request);
    const input = z.object({ projectId: z.string().min(1) }).parse(await request.json());
    return noStoreJson({ project: store.deleteProject(user.id, input.projectId) });
  } catch (error) { return apiError(error); }
}
