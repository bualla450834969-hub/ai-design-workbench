import { getAgent } from "@/lib/agents/catalog";
import type { ImageProvider, ProviderContext, TextOutput, TextProvider, ImageOutput } from "./types";

const demoCopy: Record<string, (prompt: string) => string> = {
  "brief-director": (prompt) => `### 项目任务书 · 首版

**项目目标**  
围绕“${prompt.slice(0, 56)}${prompt.length > 56 ? "…" : ""}”建立一条可验证的设计方向，在视觉差异、使用体验与量产成本之间取得平衡。

**目标用户与场景**
- 默认用户：重视品质与效率的城市消费者
- 核心场景：日常高频使用、收纳与展示并存
- 成功标准：第一眼能理解价值，连续使用不增加负担

**硬约束（待确认）**
1. 现有核心功能、接口与安全边界不可被外观牺牲。
2. 首轮默认沿用成熟供应链与常见工艺，不引入高风险结构。
3. 品牌标识、尺寸包络与目标成本需要在深化前锁定。

**主要风险**
- “科技感”等描述仍偏抽象，必须转换为线面、比例、CMF和交互细节。
- 参考图可能混有造型、材质与场景偏好，需要分别标注。

**下一步行动**
1. 上传现有产品/结构资料并标记绝对不能动的位置。
2. 确定目标价位与主要销售渠道。
3. 进入“概念灵感”生成四个差异方向。`,
  "concept-architect": (prompt) => `### 概念设计 Brief
主题：${prompt}

| 方向 | 造型语言 | CMF / 工艺 | 价值主张 |
|---|---|---|---|
| **A · 静谧几何** | 完整柔和包络，切线克制，操作区自然下沉 | 暖白细磨砂＋浅灰软触点缀 | 低学习成本，适合家居环境 |
| **B · 精密悬浮** | 主体与底座视觉分离，强调轻薄悬浮感 | 深空灰阳极氧化＋半透件 | 专业、高效、具技术可信度 |
| **C · 亲和模块** | 圆角模块组合，部件边界成为使用引导 | 低饱和双色注塑＋局部织物 | 易维护、可扩展、适合年轻用户 |
| **D · 标志切面** | 保留主包络，以一条识别性切面贯穿产品 | 金属银＋高反差品牌色点缀 | 货架识别强，适合形成产品家族 |

**推荐方向：A · 静谧几何**  
它对结构与供应链影响较小，能最快验证比例、触感和家居适配性；若品牌需要更强识别，再把D方向的标志切面并入第二轮。`,
  "appearance-variants": (prompt) => `### 四档变款策略

- **保守 20%**：锁定总体包络与功能件，仅优化分件线、倒角和CMF比例。
- **中度 40%**：接口位置不动，重排视觉重心与主次表面，建立明确产品家族特征。
- **创新 65%**：保留功能拓扑，重塑外壳比例、握持/交互区域和材质分区。
- **突破 85%**：保留品类与关键功能，重新定义姿态与模块关系；进入结构深化前必须验证内部空间。

本轮要求：${prompt}

已生成演示方案板。真实模型接入后，系统会把四个方向分开生成并记录各自的保留项和修改项。`,
  "render-studio": (prompt) => `### 渲染策略

- **结构依据**：以产品/白模图控制轮廓、比例与镜头。
- **CMF依据**：只迁移参考图的颜色、材质、粗糙度与表面工艺。
- **场景依据**：只迁移环境、光向、色温与构图氛围。
- **本轮描述**：${prompt}

已生成一张演示渲染。真实模型接入后会使用原图作为结构参考并返回高清PNG。`,
  "local-retouch": (prompt) => `### 局部编辑已建立

修改要求：${prompt}

演示模式已生成预览。生产流程会把无标记的干净产品原图和对应标注图同时交给图像模型，让模型理解标记位置、以干净原图锁定未标注区域、完成局部重设计，并返回一张无标记的完整成品图。`,
  "multi-view": (prompt) => `### 多视图规划

本轮要求：${prompt}

视角将被拆分为独立任务：前、后、左、右、顶、底。系统完成品类与比例锚定后逐张生成，检测重复视角，再统一尺度拼成3×2概念板。

> 多视图结果仅用于概念沟通，不是工程/CAD图纸，未知背面与底部结构属于模型推断。`,
};

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char] ?? char);
}

function demoSvg(context: ProviderContext, index: number, count: number) {
  const agent = getAgent(context.agentId);
  const labels = count === 6 ? ["FRONT", "BACK", "LEFT", "RIGHT", "TOP", "BOTTOM"] : ["CONSERVATIVE", "BALANCED", "INNOVATIVE", "BOLD"];
  const label = labels[index] ?? `OPTION ${index + 1}`;
  const prompt = escapeXml(context.userPrompt.split("\n\n<project_context>")[0].trim().slice(0, 44));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#f5f3ee"/><stop offset="1" stop-color="#e9e4db"/></linearGradient><linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${agent.color}"/><stop offset="1" stop-color="#1e2430"/></linearGradient><filter id="shadow"><feDropShadow dx="0" dy="28" stdDeviation="24" flood-opacity=".2"/></filter></defs>
  <rect width="1200" height="900" fill="url(#bg)"/><text x="70" y="78" font-family="Arial,sans-serif" font-size="22" letter-spacing="4" fill="#6e6a62">${label}</text>
  <g filter="url(#shadow)" transform="translate(${index % 2 ? 30 : 0} 0)"><ellipse cx="600" cy="720" rx="300" ry="48" fill="#2d3038" opacity=".16"/><path d="M330 520 C350 350 455 270 650 278 C790 284 890 390 872 560 C856 706 746 728 558 704 C412 685 314 638 330 520Z" fill="url(#body)"/><path d="M430 420 C505 342 660 323 766 388" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="15" stroke-linecap="round"/><rect x="476" y="570" width="248" height="34" rx="17" fill="#f4f1ea" opacity=".8"/><circle cx="786" cy="482" r="38" fill="#f4b55f"/><circle cx="786" cy="482" r="14" fill="#242936"/></g>
  <text x="70" y="812" font-family="Arial,sans-serif" font-size="19" fill="#65625d">AI CONCEPT PREVIEW · ${escapeXml(agent.shortName)}</text><text x="70" y="848" font-family="Arial,sans-serif" font-size="16" fill="#8a867f">${prompt}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export class MockProvider implements TextProvider, ImageProvider {
  readonly name = "demo";
  isConfigured() { return true; }

  async generateText(context: ProviderContext): Promise<TextOutput> {
    const makeCopy = demoCopy[context.agentId] ?? demoCopy["brief-director"];
    const cleanPrompt = context.userPrompt.split("\n\n")[0].trim();
    return { text: makeCopy(cleanPrompt), provider: this.name, model: "design-demo-v1" };
  }

  async generateImages(context: ProviderContext, count: number): Promise<ImageOutput> {
    return {
      imageUrls: Array.from({ length: count }, (_, index) => demoSvg(context, index, count)),
      provider: this.name,
      model: "design-demo-renderer-v1",
      revisedPrompt: context.userPrompt,
    };
  }
}
