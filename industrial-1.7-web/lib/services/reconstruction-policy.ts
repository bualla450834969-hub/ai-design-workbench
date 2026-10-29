import type { NaturalDesignIntent } from "@/lib/services/natural-intent";

export const HIGH_RECONSTRUCTION_THRESHOLD = 65;
export const CONCEPT_REDRAW_THRESHOLD = 85;

/**
 * Whole-product appearance redesigns need a different final-image contract once
 * the slider reaches the large-redesign range. The source and style images have
 * already been analyzed by the design planner at this point. Keeping any of the
 * full pixel inputs in the paid image call either anchors the result to the old
 * silhouette or lets a style reference become the replacement product.
 */
export function usesAnalysisOnlyFinalImage(input: {
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
  const shared = `产品原图和全部设计参考图已经在前置视觉分析阶段逐张读取；正式生图阶段不附带任何上传图片的原始像素，只使用分析得到的产品类别、核心功能、关键部件数量与结构拓扑、相机语义和抽象设计语言。这样既不能复刻原产品外观，也不能把某张参考产品换角度充当结果。必须保留前置分析列出的品类、功能、安全、人机、关键部件数量、前后左右布局与连接关系；不得复制任何参考图主体、文字、水印、商标、背景或版式。用户未明确要求换角度时，按前置分析记录的观察方向、透视和产品姿态生成，不能靠换镜头冒充重构。`;
  if (value >= CONCEPT_REDRAW_THRESHOLD) {
    return `本张按 ${value}% 执行，进入 85–100% 概念级重绘模式。${shared}在上述硬约束成立的前提下，按「${selectedDirection}」和本张独立路线「${label}」建立全新的视觉身份；最大化重设整体轮廓、长宽高比例、视觉重心、主体架构、主次体块、功能区包络、分件方式与标志性特征面。结果必须明显属于同一产品品类和功能体系，但不能像原产品的小改款、换色版或圆角微调版。`;
  }
  return `本张按 ${value}% 执行，进入 65–84% 大幅重设计模式。${shared}按「${selectedDirection}」和本张独立路线「${label}」重新建立整体外轮廓、比例、视觉重心、主次体块、功能区包络、分件与标志性特征面；其中至少四类必须产生一眼可见的结构化差异，不能只改圆角、局部开孔、颜色、材质或装饰。`;
}
