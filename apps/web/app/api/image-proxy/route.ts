import { NextRequest, NextResponse } from "next/server";

// 图片代理：解决跨域下载问题
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return NextResponse.json({ error: "缺少图片 URL 参数" }, { status: 400 });
  }

  try {
    // 验证 URL 格式
    const parsedUrl = new URL(imageUrl);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: "无效的图片 URL" }, { status: 400 });
    }

    //  fetch 图片
    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `下载图片失败: ${response.status}` },
        { status: response.status }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/png";
    const download = searchParams.get("download") === "true";

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
    };

    // 只有显式要求下载时才设置 attachment
    if (download) {
      headers["Content-Disposition"] = "attachment";
    }

    return new NextResponse(arrayBuffer, { headers });
  } catch (error) {
    console.error("[Image Proxy] Error:", error);
    return NextResponse.json(
      { error: "图片代理失败" },
      { status: 500 }
    );
  }
}
