import { shapeVariationPrompt } from "@/lib/generation-controls";
import type { NaturalDesignIntent } from "@/lib/services/natural-intent";

export const HIGH_RECONSTRUCTION_THRESHOLD = 65;
export const CONCEPT_REDRAW_THRESHOLD = 85;

/**
 * The slider changes the permitted appearance variation, never the identity
 * evidence. Every level keeps the selected source and eligible style images in
 * the final request; high reconstruction only selects a stronger design brief.
 */
export function usesHighReconstruction(input: {
  agentId?: string;
  generationMode?: unknown;
  workflowKind?: unknown;
  freeChatAction?: unknown;
  reconstructionRatio?: unknown;
  naturalIntent: NaturalDesignIntent;
  surfaceOnly: boolean;
  hasAnnotation: boolean;
}) {
  const ratio = Math.max(0, Math.min(100, Math.trunc(Number(input.reconstructionRatio) || 0)));
  const generationMode = String(input.generationMode || "source");
  const workflowKind = String(input.workflowKind || "");
  return input.agentId === "appearance-variants"
    && generationMode === "source"
    && (!workflowKind || workflowKind === "shape")
    && !input.freeChatAction
    && input.naturalIntent === "standard"
    && !input.surfaceOnly
    && !input.hasAnnotation
    && ratio >= HIGH_RECONSTRUCTION_THRESHOLD;
}

export function highReconstructionPrompt(ratio: number, selectedDirection: string, label: string) {
  const value = Math.max(HIGH_RECONSTRUCTION_THRESHOLD, Math.min(100, Math.trunc(Number(ratio) || 0)));
  const shared = `正式生图持续读取主产品原图、同一产品辅助角度和本轮允许的设计参考图，并结合已确认的视觉分析。主产品原图确定实际设计对象、品类、功能、部件层级和结构关系；项目名称仅辅助理解，不能把图片中的局部产品或独立部件补成另一层级的整机，也不能擅自替换功能或工作原理。重构比例只控制允许改变的外观，不降低这些身份约束。保留可验证的核心功能、安全、人机、必要安装接口及功能部件数量；外壳轮廓、外观比例、装饰分件和视觉体块布局不作为功能锁定；从参考图提炼被允许的体块、曲面、线条、格栅或CMF等设计语言，转译到同一目标产品，不复制参考主体、文字、水印、商标、背景或版式。用户未明确要求换角度时，保持原图的观察方向、透视和产品姿态，不能靠换镜头冒充重构。`;
  if (value >= CONCEPT_REDRAW_THRESHOLD) {
    return `${shapeVariationPrompt(value)}本张按 ${value}% 执行，进入 85–100% 概念级重绘模式。${shared}在上述硬约束成立的前提下，按「${selectedDirection}」和本张独立路线「${label}」建立全新的视觉身份；最大化重设整体轮廓、长宽高比例、视觉重心、主体架构、主次体块、功能区包络、分件方式与标志性特征面。结果必须明显属于同一产品品类和功能体系，但不能像原产品的小改款、换色版或圆角微调版。`;
  }
  return `${shapeVariationPrompt(value)}本张按 ${value}% 执行，进入 65–84% 大幅重设计模式。${shared}按「${selectedDirection}」和本张独立路线「${label}」重新建立整体外轮廓、比例、视觉重心、主次体块、功能区包络、分件与标志性特征面；其中至少四类必须产生一眼可见的结构化差异，不能只改圆角、局部开孔、颜色、材质或装饰。`;
}
