import { boardLayoutLabel, normalizeBoardItemCount } from "@/lib/generation-board";
import { categoryReferenceDimensions, parseProductDimensions } from "@/lib/dimension-annotations";
import type { DesignPlan } from "@/lib/providers/types";
import type { Asset } from "@/types/domain";

export function isPackagingWorkflow(value: unknown) {
  return value === "packaging";
}

/** Reject an incomplete packaging task before text analysis or image generation can be billed. */
export function validatePackagingAssets(assets: readonly Asset[], generationMode: unknown) {
  if (generationMode !== "source") throw new Error("包装设计必须使用产品原图模式；本次尚未调用模型。");
  if (!assets.some((asset) => asset.type.startsWith("image/") && (asset.role === "structure" || asset.role === "result"))) {
    throw new Error("包装设计至少需要选择一张产品原图；本次尚未调用模型。");
  }
  if (assets.some((asset) => asset.type.startsWith("image/") && !["structure", "result", "style"].includes(asset.role))) {
    throw new Error("包装设计只接受产品原图和可选设计参考图；本次尚未调用模型。");
  }
}

export const PACKAGING_CONTRACT = "本轮只设计与产品原图所示产品相适配的外包装概念；根据产品和用户要求选择合适的盒、袋、套、托、吊卡或组合形式，以及必要的固定、开启、保护与陈列方式，不强制使用盒体或内托。包装容器是允许新增的设计对象；产品原图只作为被包装产品的身份、形态、尺度和功能依据，产品本体的轮廓、结构、配色、已有标识不得改造。可在同一画面中展示一件原产品与其包装，二者不是两款产品。设计参考图仅可借鉴包装形式、材质、配色和抽象视觉风格，不能复制参考产品、商标、品牌名称、文字或版式。包装须与产品尺寸、保护需求和摆放关系相符，不能让产品穿透包装或悬空。没有提供可用品牌、法规和规格信息时，不编造可识别商标、细小文案或法规标签；可用留白与抽象图形表达视觉层级。原产品已有清晰且可使用的标识可以保留在产品本体上。";

export const PACKAGING_DIELINE_DIRECTION = "包装刀版展开图";

export function isPackagingDielineDirection(direction: unknown) {
  return typeof direction === "string" && direction.includes(PACKAGING_DIELINE_DIRECTION);
}

export const PACKAGING_DIELINE_CONTRACT = "本轮交付的是包装概念刀版展开图，不是包装效果图：以单一俯视正投影绘制可折叠的平面展开轮廓，明确各面板、插舌、粘口和必要内托的位置；裁切线用实线、压痕折线用虚线，并以清晰图例区分。每条边连接关系应可折回合理的包装容器，结构适配原产品的保护和取放需求；产品原图只提供被包装产品的身份与相对形态，不得把产品画成包装刀版。设计参考图只借鉴抽象结构和风格，不复制品牌或现成版式。按产品品类、原图相对比例及所选包装结构估算一组合理的包装长宽高，给每个主面板、插舌、粘口、折边及必要内托的关键尺寸界线写上清楚的数字，单位全部为 mm；相邻面板共用边必须数值相同，展开总长宽须等于各段尺寸之和。用户提供实际数值时优先使用并换算为 mm；未提供时也要写具体估计数字，不能留空或用文字占位，绝不可为了匹配估计尺寸而改变原产品的形态、比例和颜色。图面仅在标题旁标一次“仅供参考”；这些数字只是概念设计参考，实际生产仍须由结构工程师核实材料、间隙、公差及刀线。";

export function packagingModeContract(direction: unknown) {
  return isPackagingDielineDirection(direction) ? PACKAGING_DIELINE_CONTRACT : PACKAGING_CONTRACT;
}

export function packagingBoardContract(value: unknown, direction?: unknown) {
  const count = normalizeBoardItemCount(value);
  if (isPackagingDielineDirection(direction)) {
    return count === 1
      ? "本张只绘制一套完整的包装概念刀版展开图，使用尽可能大的画幅保证刀线、折线和尺寸标注可辨。"
      : `本张以${boardLayoutLabel(count)}展示恰好${count}套不同的包装概念刀版，每格都须有独立完整的展开轮廓和清楚可读的刀线、折线及尺寸标注；若图幅无法清晰容纳，应提示用户改用单方案，不能省略关键结构。`;
  }
  if (count === 1) return "每张图片只展示一套完整的包装概念；可以同时展示对应的原产品和包装，不得再放入第二套方案。";
  return `每张图片以${boardLayoutLabel(count)}展示恰好${count}套包装概念，各格各有一套完整包装及其对应原产品，产品本体始终是同一款，仅包装结构、开盒体验、材质或视觉风格形成清楚差异。包装与产品同框属于同一方案，不算额外产品；不得缺格、重复、另加方案或画编号、标题、水印。`;
}

export function packagingReferenceRules(assets: readonly Asset[]) {
  const references = assets.filter((asset) => asset.role === "style" && asset.type.startsWith("image/"));
  return references.length
    ? references.map((asset, index) => {
      const tags = (asset.tags || []).filter((tag) => tag !== "主要设计参考图");
      const allowed = [
        tags.includes("参考造型") ? "包装的抽象外形与体量关系" : "",
        tags.includes("参考配色") ? "包装配色关系" : "",
        tags.includes("参考材质/工艺") || tags.includes("参考材质") ? "包装材料与工艺" : "",
        tags.includes("参考风格/设计语言") ? "抽象视觉风格" : "",
        tags.includes("参考细节/纹理") ? "细节与纹理节奏" : "",
        tags.includes("参考贴花/图案") ? "抽象图形组织" : "",
        tags.includes("参考结构布局") ? "包装的功能分区与取放逻辑" : "",
        tags.includes("参考场景") ? "陈列环境" : "",
        tags.includes("参考绘画风格") ? "画面表现方式" : "",
      ].filter(Boolean);
      const scope = allowed.length ? `只可借鉴${allowed.join("、")}；其他维度不得从本图迁移` : tags.includes("竞品参考") ? "只用于包装品类和市场定位分析，不复制外观" : "未标注借鉴维度，可综合提取包装形式、材质、配色与抽象风格";
      return `包装参考图${index + 1}（${asset.name}）：${scope}；不得把参考图的产品主体、品牌、商标、文字、条码、水印或完整平面版式迁入。`;
    }).join("\n")
    : "本轮没有包装设计参考图；仅依据产品原图和用户文字设计包装。";
}

export function enforcePackagingPlan(plan: DesignPlan, userRequirements: string, count: number, direction?: unknown): DesignPlan {
  if (isPackagingDielineDirection(direction)) {
    const measured = parseProductDimensions(userRequirements);
    const productReference = measured || categoryReferenceDimensions(plan.productCategory);
    const millimeters = (value: string) => Math.round(Number(value) * (productReference?.unit === "cm" ? 10 : 1));
    const referenceSize = productReference && !measured
      ? `按“${plan.productCategory}”的常见尺度，包装内腔可先以宽 ${millimeters(productReference.width) + 20} mm、深 ${millimeters(productReference.depth) + 20} mm、高 ${millimeters(productReference.height) + 20} mm 为参考起点；若原图显示不同比例，则调整数字以匹配原产品，包装不得挤压或改变产品。`
      : measured
        ? `用户给出的宽×深×高换算为 ${millimeters(measured.width)}×${millimeters(measured.depth)}×${millimeters(measured.height)} mm；按用户说明判断这是产品外形还是包装尺寸，并留出合理内腔间隙。`
        : `识别“${plan.productCategory}”品类并依据原图相对比例估算包装长宽高，所有关键边写出具体 mm 数值。`;
    return {
    ...plan,
    mandatoryConstraints: [...new Set([...plan.mandatoryConstraints.filter((item) => !/同框|陈列|立体|效果图|渲染|展示场景/.test(item)), PACKAGING_DIELINE_CONTRACT])],
    mutableFeatures: ["只设计与原产品适配的包装平面展开结构；产品本体不改。尺寸为概念估计并在图中标“仅供参考”。"],
    variantDirections: Array.from({ length: count }, (_, index) => `包装概念刀版${index + 1}：${userRequirements || "为原产品设计适配包装"}；本张只交付一套独立完整的平面展开轮廓、裁切线、压痕线、接缝与毫米数字标注。${referenceSize}原产品保持一致；标注各关键边和总尺寸，数字必须前后一致。`),
  };
  }
  const axes = [
    "保护性固定与适配方式", "包装开启与取放体验", "便携提拿与运输防护", "零售陈列与产品露出关系",
    "可回收材料与简洁折叠结构", "紧凑收纳与堆叠关系", "包装层次与开封顺序", "适配产品形态的包装轮廓",
  ];
  const structureLocked = /(?:盒型|包装(?:结构|形式|形态|外形)|开合方式).{0,10}(?:不变|保持|固定|不改|不调整|不动)|(?:不变|保持|固定|沿用|不改|不调整|不动).{0,10}(?:盒型|包装(?:结构|形式|形态|外形)|开合方式)/.test(userRequirements);
  const graphicsOnly = /(?:只|仅)(?:做|设计|修改|调整|更换|改).{0,16}(?:平面|图案|花卉|配色|纹样|贴花|印刷|视觉)/.test(userRequirements);
  const structuralChange = /抽拉|翻盖|插口|折叠|吊卡|袋装|套筒|内托|开窗|提手|开启方式|开合体验|包装结构|改变盒型|重做盒型|更换盒型/;
  const safeRoute = (route: string) => /包装|盒|袋|套|托|吊卡|陈列|开箱|开盒|固定|折叠|视觉|配色|材质|材料|平面|图案|花卉|纹样|印刷|版式|插画|插图/.test(route)
    && !/(?:原产品|产品本体|机身|整机).{0,12}(?:重设|重构|改造|变形|改变|调整轮廓)|(?:重设|重构|改造|变形|改变).{0,12}(?:原产品|产品本体|机身|整机)/.test(route)
    && (!(structureLocked || graphicsOnly) || !structuralChange.test(route))
    && (!graphicsOnly || !/材质|材料|换纸|工艺|保护方式|固定方式|陈列方式/.test(route));
  const restrictedFallback = "仅探索用户明确允许的包装变化维度，盒型及其他未授权特征保持不变";
  return {
    ...plan,
    mandatoryConstraints: [...new Set([...plan.mandatoryConstraints, PACKAGING_CONTRACT])],
    mutableFeatures: [`仅按用户要求调整包装；未授权的盒型、结构、开合、材料、配色与图案保持不变；原产品本体不改。用户要求：${userRequirements || "根据产品需要确定包装形式与视觉语言"}`],
    variantDirections: Array.from({ length: count }, (_, index) => {
      const candidate = String(plan.variantDirections[index] || "").trim();
      if (candidate.startsWith(`包装方案${index + 1}：${userRequirements || "为原产品设计适配包装"}；`) && candidate.includes("原产品保持一致")) return candidate;
      const focus = safeRoute(candidate) ? `本张重点：${candidate}` : structureLocked || graphicsOnly ? restrictedFallback : `重点探索${axes[index % axes.length]}`;
      return `包装方案${index + 1}：${userRequirements || "为原产品设计适配包装"}；${focus}。只改变用户允许的包装维度，原产品保持一致；不得复制设计参考图的品牌文字。`;
    }),
  };
}
