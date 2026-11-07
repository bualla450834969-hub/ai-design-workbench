import type { DesignPlan } from "@/lib/providers/types";
import { detectNaturalDesignIntent } from "@/lib/services/natural-intent";

export const DESIGN_CONTROL_VERSION = 186;
export const SHAPE_CONSTRAINT_RULE = "区分功能事实和外观观察：mandatoryConstraints只写具体产品品类、部件/整机层级、核心功能、必要安全与安装接口、真实功能件数量，以及用户明确锁定的事项。不要把原图的圆方轮廓、长宽高比例、外壳层次、装饰分件和体块布局误写为功能硬约束；这些写入appearanceObservations（原图外观观察，不是锁定），允许变化项写入mutableFeatures。只有参考图时，不得从参考的几何、零件数量和布局推导目标产品的硬约束。所有列表简短，每项只表达一个事实。";

export function shapeVariationPrompt(ratio: unknown) {
  const value = Math.max(0, Math.min(100, Math.round(Number(ratio) || 0)));
  if (value === 0) return "重构0%：锁定全部产品几何、轮廓、比例、部件和分件位置，仅执行用户允许的表面处理。";
  const change = value <= 29
    ? "小幅微调，保留原图的整体轮廓、高宽关系、主次体块与分件布局；仅选一至两处边缘过渡、开孔节奏或局部细节改善，远看仍是原款。"
    : value <= 49 ? "中度改款，保留主要轮廓特征，在两至三项曲面、比例、体块或分件上做清楚可辨的变化。"
      : value <= 64 ? "明显改款，至少重组整体轮廓、比例、主次体块、分件中的三项，不能仅改孔型或圆角。"
        : value <= 84 ? "大幅重设计，至少重组整体轮廓、长宽高比例、主次体块、外壳层次、功能区包络、分件中的四项；远看即能区别原款。"
          : "概念级重构：重新设计整体轮廓、长宽高比例、主次体块和分件组织，形成明显不同的新外观；不要沿用原壳体的同一轮廓仅更换孔型、圆角或颜色。";
  return `重构${value}%：${change}始终保持图中实际产品的品类、对象层级、核心功能与必要安全/安装约束，原图继续作为这些事实的依据。除用户明确锁定或功能必需的几何外，外壳的具体形态、外观比例和装饰布局按本档变化；“同一产品身份”不能解释为“原外壳比例和造型不变”。不能用换背景、换相机或换颜色冒充造型重构。`;
}

const APPEARANCE = /外轮廓|外形|外壳|造型|体块|曲率|高宽比|高径比|长宽高|分件|圆(?:台|锥|柱|盘|环|形)|方(?:形|体)|穹顶|微锥|截锥|弧形|流线/;
const ENGINEERING = /安装|接口|孔距|连接器|安全|承重|密封|绝缘|容纳|内部堆叠|避让|工作原理|动力形式|轮子数量|车轮数量|支撑点数量/;
const USER_SHAPE_LOCK = /(?:保持|保留|锁定)[^。；\n]{0,16}(?:轮廓|比例|造型|形状)[^。；\n]{0,8}(?:不变|一致|原样)|(?:不(?:得|要|能)改变|禁止修改)[^。；\n]{0,10}(?:轮廓|比例|造型|形状)/;

/** Old plans can mix observed shell geometry with functional invariants. At
 * high shape variation, retain the observation without turning it into a lock.
 * Explicit user locks and engineering constraints always remain authoritative. */
export function applyDesignControls(plan: DesignPlan, settings: Record<string, unknown>, requirements = ""): DesignPlan {
  const next = { ...plan, mandatoryConstraints: [...plan.mandatoryConstraints], mutableFeatures: [...plan.mutableFeatures], styleFingerprint: [...plan.styleFingerprint], appearanceObservations: [...(plan.appearanceObservations || [])], controlVersion: DESIGN_CONTROL_VERSION };
  const shape = !settings.surfaceOnly && (settings.workflowKind === "shape" || (!settings.workflowKind && detectNaturalDesignIntent(requirements) === "standard"));
  if (shape && settings.generationMode === "source" && Number(settings.reconstructionRatio) >= 50 && !USER_SHAPE_LOCK.test(requirements)) {
    next.mandatoryConstraints = plan.mandatoryConstraints.filter((item) => {
      if (/产品身份.*对象层级/.test(item) || !APPEARANCE.test(item) || ENGINEERING.test(item)) return true;
      next.appearanceObservations.push(item);
      return false;
    });
    next.mandatoryConstraints.unshift(`保持${plan.productCategory}的产品身份、对象层级与已确认核心功能：${plan.coreFunctions.join("；")}`);
  }
  if (settings.referenceStrength !== undefined) {
    const strength = Math.max(0, Math.min(100, Number(settings.referenceStrength) || 0));
    next.styleFingerprint = strength === 0 ? [] : plan.styleFingerprint.slice(0, strength <= 33 ? 1 : strength <= 66 ? 3 : 6);
  }
  next.mandatoryConstraints = [...new Set(next.mandatoryConstraints)];
  next.appearanceObservations = [...new Set(next.appearanceObservations)].slice(0, 12);
  return next;
}
