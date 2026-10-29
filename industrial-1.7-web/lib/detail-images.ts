import type { DesignPlan } from "@/lib/providers/types";
import type { Asset } from "@/types/domain";

export const DETAIL_DIRECTIONS = ["产品主图", "功能卖点图", "局部细节图", "使用场景图", "产品详情长图"] as const;

export function isDetailWorkflow(value: unknown) {
  return value === "detail";
}

/** Check the image roles before either a text or an image model can be billed. */
export function validateDetailAssets(assets: readonly Asset[], generationMode: unknown) {
  if (generationMode !== "source") throw new Error("产品详情图必须使用产品原图模式；本次尚未调用模型。");
  if (!assets.some((asset) => asset.type.startsWith("image/") && (asset.role === "structure" || asset.role === "result"))) {
    throw new Error("产品详情图至少需要一张产品原图；本次尚未调用模型。");
  }
  if (assets.some((asset) => asset.type.startsWith("image/") && !["structure", "result", "style"].includes(asset.role))) {
    throw new Error("产品详情图只接受产品原图和可选设计参考图；本次尚未调用模型。");
  }
}

/** The parameter composer supplies a full task template; keep only its actual user notes downstream. */
export function detailUserNotes(content: string) {
  const value = content.trim();
  const withoutGeneratedCount = (notes: string) => notes.replace(/(?:^|\n)生成\d+张图片，每张呈现\d+个完整方案。?\s*$/, "").trim();
  if (/^以本轮产品原图为唯一产品身份依据，制作“[^”]+”。/.test(value)) {
    const marker = "\n补充要求：";
    const index = value.indexOf(marker);
    return index < 0 ? "" : withoutGeneratedCount(value.slice(index + marker.length));
  }
  // Earlier AI-organized drafts included the entire image contract. It is now
  // supplied exactly once at generation time; preserve only the user's prefix.
  const contractIndex = value.indexOf("本轮只为产品原图中的同一款产品制作电商展示图");
  if (contractIndex < 0) return value;
  return withoutGeneratedCount(value.slice(0, contractIndex)
    .replace(/依据“[^”]+”产品原图制作“[^”]+”；?\s*$/, "")
    .replace(/[。；;\s]+$/, "")
    .trim());
}

/** A long detail image starts portrait, while an explicit user choice remains authoritative. */
export function detailOutputAspectRatio(workflowKind: unknown, direction: unknown, requested: unknown) {
  const ratio = typeof requested === "string" && requested ? requested : "auto";
  return isDetailWorkflow(workflowKind) && direction === "产品详情长图" && ratio === "auto" ? "9:16" : ratio;
}

export const DETAIL_IMAGE_CONTRACT = "本轮只为产品原图中的同一款产品制作电商展示图，不重新设计产品。首张产品原图是唯一产品身份依据；保留真实轮廓与长宽高比例、结构与部件数量、材质、颜色、图案和已有标识。只改变本执行方向允许的构图、背景、光线及有依据的信息层级；不得从参考图复制商品。输出中的产品必须是边缘清楚、颜色实在的单层不透明实体；先建立最终画面再放置同一产品，禁止把原图和新画面半透明叠加、错位重影、双重曝光或拼贴多个互相穿插的产品。不得编造性能、规格、尺寸、配件、认证、价格、品牌或卖点；缺少可核实文字时留白。";

export function detailDirectionContract(direction: unknown) {
  const selected = typeof direction === "string" ? direction : "";
  if (selected === "功能卖点图") return "突出产品原图中可确认的一项功能或用户明确提供且可核实的一项卖点；用构图、局部引导和信息层级表达。没有证据的功能不得猜测或标注。";
  if (selected === "局部细节图") return "聚焦产品原图中真实可见的一处局部细节，可放大展示材质、做工或结构连接；局部必须与同一产品整体一致，不新增零件。";
  if (selected === "使用场景图") return "把同一产品置于符合用途的合理使用环境，可调整环境和光照；产品外观、比例、材质与颜色保持一致，不凭空增加使用者、配件或使用方式。";
  if (selected === "产品详情长图") return "制作一张有完整阅读顺序的电商详情页画面，遵守用户选择的画幅。按产品证据组织内容：完整产品主视觉与简短品类标题、原图可见的一个结构或操作亮点、另一处不同的材质或做工特写、合理使用情境、简洁的信息收束；有足够证据和画面空间时分成四到五个清晰模块，画幅较短时合并相关模块，不机械等分。只有用户提供并明确核实的参数、清单、售后或品牌信息才可加入对应模块；缺少证据时展示真实细节，不为凑数重复产品或编造卖点。每个模块只讲一件事，使用统一色彩、留白和区块边界；标题和标签尽量短且易读，无证据的文字直接省略，不写空泛宣传句或乱码小字。可使用同一产品的完整图与真实局部特写，但各区不能透明叠加、错位重影，不能把横向原照片直接当作整张详情页的底图。";
  return "制作简洁清晰的产品主图，完整展示一款产品并留安全边距；背景和光线可优化，不添加未经证实的宣传文字或额外产品。";
}

export function detailReferenceRules(assets: readonly Asset[]) {
  const references = assets.filter((asset) => asset.role === "style" && asset.type.startsWith("image/"));
  if (!references.length) return "本轮无设计参考图；只依据产品原图和用户的文字要求制作展示图。";
  return references.map((asset, index) => {
    const tags = asset.tags || [];
    const permitted = [
      tags.includes("参考构图") ? "构图" : "",
      tags.includes("参考光影") ? "光影" : "",
      tags.includes("参考背景/场景") ? "背景与场景氛围" : "",
      tags.includes("参考信息排版") ? "信息层级与版式节奏" : "",
    ].filter(Boolean);
    return `展示参考图${index + 1}：只可借鉴${permitted.length ? permitted.join("、") : "抽象构图、背景、灯光和信息层级"}；不能复制其中的产品、品牌、文字、价格、卖点或规格。`;
  }).join("\n");
}

const UNSAFE_DETAIL_ROUTE = /(?:重(?:新)?设计|重构|改款|换色|改色|改变(?:产品|外形|轮廓|结构|比例|颜色|材质)|修改(?:产品|外形|轮廓|结构|比例|颜色|材质)|替换(?:产品|原图|商品)|新(?:增|添)(?:部件|配件|功能)|增加(?:部件|配件|功能)|删(?:除|去)(?:部件|配件|功能)|虚构|编造|伪造|忽略.{0,12}(?:要求|约束|规则)|多张|额外生成|(?:\d+(?:\.\d+)?\s*(?:毫米|mm|小时|mAh|瓦|W)))/i;

function safeLongDetailRoute(value: string, hasVerifiedFunctions: boolean) {
  const route = value.trim();
  if (!route || route.length > 500 || UNSAFE_DETAIL_ROUTE.test(route)) return "";
  if (!hasVerifiedFunctions && /(?:功能卖点|性能|续航|防水|承重|功率|认证|价格)/.test(route)) return "";
  return route;
}

function longDetailRoute(plan: DesignPlan, requirements: string, index: number) {
  const previous = plan.variantDirections[index] || "";
  // Both the planner and the browser prompt enforce a plan; do not wrap an already locked route twice.
  if (previous.startsWith(`详情图${index + 1}：单张详情页；`)) return previous;
  const category = plan.productCategory.trim() && !plan.productCategory.startsWith("待") ? plan.productCategory.trim() : "原图中的产品";
  const visibleCandidates = plan.coreFunctions.map((item) => item.trim()).filter(Boolean);
  const plannedRoute = /^详情图\d+：单张9:16竖版；/.test(previous)
    ? "" : previous.replace(/上段|中段|下段/g, "");
  const planned = safeLongDetailRoute(plannedRoute, visibleCandidates.length > 0);
  const requested = safeLongDetailRoute(detailUserNotes(requirements), visibleCandidates.length > 0);
  const focus = [requested, planned].filter((item, position, items) => item && items.indexOf(item) === position).join("；");
  const candidate = visibleCandidates.length ? visibleCandidates[index % visibleCandidates.length] : undefined;
  return `详情图${index + 1}：单张详情页；产品类别为“${category}”。以完整产品主视觉开场，再从原图真实可见的结构、材质、操作部位和合理场景中选不同内容组成信息区块。${candidate ? `分析候选要点“${candidate}”只有对照原图能直接确认时才可成为一个独立模块；` : ""}${focus ? `优先考虑本轮要求：${focus}；` : ""}用短标题和少量有依据的标签形成阅读层级，未核实的功能、规格与承诺不写；模块数量和高度按实际画幅及证据取舍，禁止固定等分、重复同一张照片或在照片上堆半透明图层。`;
}

export function enforceDetailPlan(plan: DesignPlan, requirements: string, count: number, direction: unknown): DesignPlan {
  const layouts = ["主体居中并保留清晰留白", "主体与文字区错位排列", "以真实细节形成视觉焦点", "使用柔和环境光突出原有材质", "以简洁背景突出产品轮廓"];
  const existingConstraints = plan.mandatoryConstraints.filter((constraint) => constraint !== DETAIL_IMAGE_CONTRACT && constraint !== detailDirectionContract(direction) && !constraint.startsWith("本轮只为产品原图中的同一款产品制作电商展示图"));
  return {
    ...plan,
    mandatoryConstraints: [...new Set([...existingConstraints, "产品外观、比例、结构、颜色及已有标识与首张产品原图一致"])],
    mutableFeatures: ["只允许调整展示构图、环境、灯光和经核实的信息层级；产品本体保持原样。"],
    variantDirections: Array.from({ length: count }, (_, index) => direction === "产品详情长图"
      ? longDetailRoute(plan, requirements, index)
      : `详情图${index + 1}：${layouts[index % layouts.length]}。`),
  };
}
