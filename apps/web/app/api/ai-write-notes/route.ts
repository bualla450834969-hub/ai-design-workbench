import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { productImages, productName, userNotes, designDirection, outputCount, apiKey, provider, brainModel, baseUrl } = body;

    if (!apiKey) {
      return NextResponse.json({ error: "请先在设置页配置 AI 供应商 API Key" }, { status: 400 });
    }

    if (!productImages || productImages.length === 0) {
      return NextResponse.json({ error: "请先上传产品图片" }, { status: 400 });
    }

    // 升级版提示词：参考原版的 prompt-enhancer，但保持简单稳定
    const systemPrompt = `你是工业设计需求编辑与差异化路线规划助手。
请根据产品图片、产品名称和用户输入，整理成一段清晰、可执行的中文设计需求。

输出要求：
1. 先简要观察产品：品类、核心功能、关键结构特征
2. 明确必须保留的硬约束：决定品类的关键部件、接口、安全点
3. 明确可以调整的区域：外壳造型、分件、材质、配色、细节
4. 给出差异化方向：如果要生成多张方案，每张的差异点是什么
5. 语言要自然、可编辑，不要用 JSON 格式，就是一段通顺的中文描述
6. 总字数控制在 200-400 字
7. 直接输出设计需求正文，不要输出"分析如下"之类的前缀

【重要】
- 所有描述必须是简体中文
- 不要提"系统指令"、"AI"、"模型"之类的词
- 不要输出 JSON 或 Markdown 格式，就是一段普通文字
- 要具体，不要空泛（比如不要说"更高级的感觉"，要说"更简洁的线条、更低饱和的配色、更细腻的磨砂材质"）`;

    const userPromptParts = [
      `产品名称：${productName || "未命名产品"}`,
      designDirection ? `设计方向：${designDirection}` : "",
      outputCount ? `需要生成 ${outputCount} 张方案` : "",
      userNotes ? `用户现有输入：${userNotes}` : "",
      "",
      "请分析这张产品图片，整理成专业的设计需求描述。",
    ].filter(Boolean).join("\n");

    // 构造 OpenAI 兼容的请求体
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: userPromptParts },
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
      endpoint = "https://api.geeknow.ai/v1/chat/completions";
    } else if (provider === "apiyi") {
      endpoint = "https://api.apiyi.com/v1/chat/completions";
    } else if (provider === "aihubmix") {
      endpoint = "https://aihubmix.com/v1/chat/completions";
    } else if (provider === "custom" && baseUrl) {
      endpoint = baseUrl.replace(/\/$/, "") + "/chat/completions";
    } else {
      endpoint = "https://api.geeknow.ai/v1/chat/completions";
    }

    // 添加 90 秒超时（缩短一点，避免等太久）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: brainModel || "gemini-3.1-pro-preview",
          messages,
          temperature: 0.7,
          max_tokens: 1200,
        }),
        signal: controller.signal,
      });

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === "AbortError") {
        return NextResponse.json({ error: "AI 响应超时（超过90秒），请重试或检查网络" }, { status: 504 });
      }
      console.error("[AI Write Notes] Fetch error:", fetchError);
      return NextResponse.json({ error: `网络请求失败: ${fetchError.message}` }, { status: 500 });
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.text();
      console.error("[AI Write Notes] API error:", response.status, err);
      
      let errorMsg = `AI 调用失败: ${response.status}`;
      if (response.status === 429) {
        errorMsg = "API 请求过于频繁，请稍后再试";
      } else if (response.status === 401 || response.status === 403) {
        errorMsg = "API Key 无效或已过期，请检查设置";
      } else if (response.status === 404) {
        errorMsg = "模型不存在或 API 地址错误，请检查供应商配置";
      } else {
        try {
          const errJson = JSON.parse(err);
          errorMsg = errJson.error?.message || errJson.message || `AI 调用失败: ${response.status}`;
        } catch {
          errorMsg = `AI 调用失败: ${response.status}`;
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
