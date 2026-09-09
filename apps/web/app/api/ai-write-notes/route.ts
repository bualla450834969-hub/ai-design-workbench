import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productImages, productName, apiKey, provider, brainModel, baseUrl } = body;

    if (!apiKey) {
      return NextResponse.json({ error: "请先在设置页配置 AI 供应商 API Key" }, { status: 400 });
    }

    if (!productImages || productImages.length === 0) {
      return NextResponse.json({ error: "请先上传产品图片" }, { status: 400 });
    }

    // 构造 prompt
    const systemPrompt = `你是一位拥有15年经验的资深工业设计师，擅长消费电子产品、家居用品、小家电的外观设计。
请根据用户提供的产品图片和产品名称，分析产品的现状，并生成一份专业、具体、可执行的设计优化需求文档。

输出要求：
1. 先简要分析产品现状（造型特点、优缺点）
2. 然后给出具体的设计优化建议，包括以下维度：
   - 造型方向：整体造型的优化方向，要具体描述（如：更圆润的边角、更简洁的线条、更有辨识度的剪影等）
   - 配色方案：建议的主色、辅色、点缀色，以及色彩搭配理由
   - 材质工艺：建议使用的材质和表面处理工艺（如：磨砂塑料、金属阳极氧化、IMD模内装饰等）
   - 功能优化：从用户体验角度提出功能改进建议
   - 用户群体：明确目标用户画像（年龄、性别、生活方式、消费能力）
   - 使用场景：描述产品的主要使用场景和环境
   - 差异化卖点：如何在同类产品中脱颖而出
3. 语言要专业但易懂，避免空泛的形容词，每个建议都要具体可执行
4. 总字数控制在300-500字
5. 用中文输出，用清晰的分段和小标题组织内容`;

    const userPrompt = `产品名称：${productName || "未命名产品"}

请分析这张产品图片，生成设计优化需求文档。`;

    // 构造 OpenAI 兼容的请求体
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPrompt },
          ...productImages.slice(0, 3).map((img: { dataUrl: string }) => ({
            type: "image_url",
            image_url: { url: img.dataUrl },
          })),
        ],
      },
    ];

    // 确定 API endpoint
    let endpoint = "";
    if (provider === "geeknow") {
      endpoint = "https://www.geeknow.top/v1/chat/completions";
    } else if (provider === "apiyi") {
      endpoint = "https://api.apiyi.com/v1/chat/completions";
    } else if (provider === "aihubmix") {
      endpoint = "https://aihubmix.com/v1/chat/completions";
    } else if (provider === "custom" && baseUrl) {
      endpoint = baseUrl.replace(/\/$/, "") + "/chat/completions";
    } else {
      endpoint = "https://www.geeknow.top/v1/chat/completions";
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: brainModel || "gemini-3.1-pro-preview",
        messages,
        temperature: 0.8,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[AI Write Notes] API error:", response.status, err);
      
      let errorMsg = `AI 调用失败: ${response.status}`;
      if (response.status === 429) {
        errorMsg = "API 请求过于频繁，请稍后再试（限流 429）";
      } else if (response.status === 401 || response.status === 403) {
        errorMsg = "API Key 无效或已过期，请检查设置";
      } else if (response.status === 404) {
        errorMsg = "模型不存在或 API 地址错误，请检查供应商配置";
      } else {
        try {
          const errJson = JSON.parse(err);
          errorMsg = errJson.error?.message || errJson.message || `AI 调用失败: ${response.status}`;
        } catch {
          errorMsg = `AI 调用失败: ${response.status} ${err.slice(0, 100)}`;
        }
      }
      
      return NextResponse.json({ error: errorMsg }, { status: response.status });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || "";

    if (!result) {
      console.error("[AI Write Notes] Empty response:", JSON.stringify(data).slice(0, 500));
      return NextResponse.json({ error: "AI 返回内容为空" }, { status: 500 });
    }

    return NextResponse.json({ notes: result });
  } catch (error: any) {
    console.error("[AI Write Notes] Unexpected error:", error);
    return NextResponse.json({ error: error.message || "生成失败" }, { status: 500 });
  }
}
