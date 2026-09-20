import { NextRequest, NextResponse } from "next/server";
import { getTaskStatus } from "@/lib/tripo";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const apiKey = request.nextUrl.searchParams.get("apiKey");
    const taskId = request.nextUrl.searchParams.get("taskId");

    if (!apiKey) {
      return NextResponse.json({ error: "缺少 API Key" }, { status: 400 });
    }

    if (!taskId) {
      return NextResponse.json({ error: "缺少任务 ID" }, { status: 400 });
    }

    const task = await getTaskStatus(apiKey, taskId);

    return NextResponse.json({
      status: task.status,
      progress: task.progress,
      modelUrl: task.output.model,
      renderedImage: task.output.rendered_image,
      error: task.error_msg,
    });
  } catch (error) {
    console.error("查询3D模型状态失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "查询失败" },
      { status: 500 }
    );
  }
}
