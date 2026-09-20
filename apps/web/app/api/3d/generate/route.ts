import { NextRequest, NextResponse } from "next/server";
import { multiviewToModel } from "@/lib/tripo";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey, images } = body;

    if (!apiKey) {
      return NextResponse.json({ error: "请先在设置页面配置 Tripo API Key" }, { status: 400 });
    }

    if (!images || !Array.isArray(images) || images.length < 4) {
      return NextResponse.json({ error: "需要至少4张视图图片（前、左、后、右）" }, { status: 400 });
    }

    // 只取前4张 [front, left, back, right]
    const fourViews = images.slice(0, 4);

    const taskId = await multiviewToModel(apiKey, fourViews);

    return NextResponse.json({ taskId });
  } catch (error) {
    console.error("3D模型生成失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "3D模型生成失败" },
      { status: 500 }
    );
  }
}
