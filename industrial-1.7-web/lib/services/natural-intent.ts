import type { AgentId } from "@/types/domain";

export type NaturalDesignIntent = "standard" | "surface-only" | "scoped-edit" | "multi-view";

export const SURFACE_ONLY_CONSTRAINT = "仅编辑用户指定的表面配色、材质、纹理、图案或贴花；原图轮廓、几何、结构、部件数量和位置、所有现有视角、透视、姿态、画幅、主体位置、背景及多视图数量与布局保持一致。黑色功能件、开孔、接口、护目镜、镜片与边框默认保留原样，除非用户明确指定修改。不得新增角度、减少视图、重新构图或将贴花任务扩大为外观改款。";
export const DRAWING_STYLE_REFERENCE_CONSTRAINT = "绘画风格参考只提供画面表现：线条、笔触、上色方式、明暗层次和光影表达；不提供目标产品的轮廓、比例、结构、部件或构图。保持产品原图身份；用户明确要求写实或其他表现时以用户文字为准，未指定时允许采用该图的绘画表现，不强制转成写实渲染。";

export const STANDARD_SIX_VIEWS = ["正视图", "后视图", "左侧视图", "右侧视图", "俯视图", "底视图"] as const;
export const STANDARD_EIGHT_VIEWS = [...STANDARD_SIX_VIEWS, "左前45°视图", "右前45°视图"] as const;

/** The eight-view shortcut extends, rather than replaces, natural six-view requests. */
export function requestedStandardViewCount(content: string, fallback = 6): 6 | 8 {
  if (/(?:八|8)(?:视图|视角|(?:个|种)?(?:不同)?角度)/.test(content) || /左前?\s*45[°度]?.*右前?\s*45[°度]?/.test(content)) return 8;
  if (/(?:六|6)(?:视图|视角|(?:个|种)?(?:不同)?角度)/.test(content)) return 6;
  return fallback === 8 ? 8 : 6;
}

export function standardMultiViewViews(content: string, fallback = 6): string[] {
  return [...(requestedStandardViewCount(content, fallback) === 8 ? STANDARD_EIGHT_VIEWS : STANDARD_SIX_VIEWS)];
}

/** Explicitly named single views must not fall back to the first front view. */
export function requestedMultiViewViews(content: string, fallback = 6): string[] {
  if (/(?:八|8|六|6)(?:视图|视角|(?:个|种)?(?:不同)?角度)/.test(content)) return standardMultiViewViews(content, fallback);
  const names = content.match(/[左右]前?\s*45\s*[°度]?(?:视图)?|正视(?:图)?|前视(?:图)?|后视(?:图)?|背视(?:图)?|左(?:侧)?视(?:图)?|右(?:侧)?视(?:图)?|俯视(?:图)?|顶视(?:图)?|底视(?:图)?|仰视(?:图)?/g) || [];
  const normalized = names.map((name) => /左.*45/.test(name) ? "左前45°视图" : /右.*45/.test(name) ? "右前45°视图" : /后|背/.test(name) ? "后视图" : /左/.test(name) ? "左侧视图" : /右/.test(name) ? "右侧视图" : /俯|顶/.test(name) ? "俯视图" : /底|仰/.test(name) ? "底视图" : "正视图");
  return normalized.length ? [...new Set(normalized)] : standardMultiViewViews(content, fallback);
}

export function multiViewBoardLabel(content: string, fallback = 6) {
  return requestedStandardViewCount(content, fallback) === 8 ? "一张4×2八视图整版" : "一张3×2六视图整版";
}

export function isSurfaceEditingTask(input: { content: string; agentId?: string; generationMode?: string; hasProductImage: boolean; surfaceOnly?: boolean; workflowKind?: string }) {
  if (!input.hasProductImage || input.generationMode === "text" || input.generationMode === "reference") return false;
  if (input.workflowKind === "packaging" || input.workflowKind === "detail") return false;
  if (input.workflowKind === "shape") return false;
  if (input.workflowKind === "cmf" || input.workflowKind === "decal") return true;
  return input.surfaceOnly === true || input.agentId === "cmf-colorways" || detectNaturalDesignIntent(input.content) === "surface-only";
}

export function requestsSeparateViews(value: string) {
  return /(?:每个|各个|每一|各|逐)(?:角度|视图|视角).{0,12}(?:单独|分别|各自|一张)|(?:单独|分别|拆成|拆分).{0,12}(?:八|8|六|6|五|5|四|4|三|3)?(?:张|视图|视角)|(?:八|8|六|6)张.{0,8}(?:独立|单独|分图)/.test(value.replace(/\s+/g, ""));
}

export function requestsSixViewBoard(value: string) {
  // Kept under its historic export name for existing callers; includes eight-view boards.
  return /(?:八|8|六|6)(?:视图|视角)/.test(value) && !requestsSeparateViews(value) && !/(?:[2-9]\d*|[二两三四五六七八九十])\s*张/.test(value) && detectNaturalDesignIntent(value) !== "surface-only";
}

/** Explicit independent-file instructions override a stale board toggle everywhere. */
export function resolveMultiViewBoard(content: string, count: number, requestedBoard?: boolean) {
  if (requestsSeparateViews(content)) return false;
  return requestedBoard === true || (requestedBoard !== false && count === 1 && requestsSixViewBoard(content));
}

function countToken(value: string) {
  const chinese: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  return /^\d+$/.test(value) ? Number(value) : chinese[value];
}

export function explicitFreeChatImageCount(text: string) {
  // “Each angle gets one image” describes a per-angle unit, not one final file.
  // Remove those units before parsing an explicit overall file count.
  const value = text.replace(/\s+/g, "")
    .replace(/(?:每款|每种|每套|各款|各方案|每个方案|逐款|逐个方案)[：:，,]?(?:(?:都|各|只|仅|分别|单独|各自|生成|输出|对应|为|是))*[一1]张(?:图片|图|效果图|结果|方案)?/gi, "")
    .replace(/(?:每个|每种|各个|各种|每一|各|逐)(?:角度|视角|视图|配色|CMF)[：:，,]?(?:(?:都|各|只|仅|分别|单独|各自|生成|输出|对应|为|是))*[一1]张(?:图片|图|效果图|结果|方案)?/gi, "");
  const match = value.match(/(?:生成|出|做|要|给我)[^\d一二两三四五六七八九十。；，,]{0,16}(\d{1,3}|[一二两三四五六七八九十])张(?:图|图片|效果图|结果|方案)?/)
    || value.match(/(\d{1,3}|[一二两三四五六七八九十])张(?:图|图片|效果图|结果|方案)/);
  const count = match ? countToken(match[1]) : undefined;
  return count ? Math.max(1, Math.min(100, count)) : undefined;
}

export function requestedCmfVariantCount(text: string) {
  const compact = text.replace(/\s+/g, "");
  const match = compact.match(/(\d{1,2}|[一二两三四五六七八九十])(?:个|种|套)(?:不同)?(?:配色|CMF)(?:方案)?/i)
    || compact.match(/(?:生成|做|设计)(\d{1,2}|[一二两三四五六七八九十])(?:个|种|套)?(?:配色|CMF)(?:方案)?/i);
  const count = match ? countToken(match[1]) : undefined;
  return count ? Math.max(1, Math.min(12, count)) : undefined;
}

export function separatelyRequestedCmfCount(text: string) {
  const compact = text.replace(/\s+/g, "");
  if (!/(?:每个|每种|各个|各种)(?:配色|CMF).{0,10}(?:单独|分别|各自).{0,6}(?:一张|生成)|(?:单独|分别).{0,10}(?:每个|每种)(?:配色|CMF)/i.test(compact)) return undefined;
  return requestedCmfVariantCount(text);
}

/** “四款方案，每款单独一张” is four output files, never a four-up board. */
export function separatelyRequestedDesignVariantCount(text: string) {
  const compact = text.replace(/\s+/g, "");
  const splitInstruction = /(?:每(?:个|种|款|套)?(?:方案|外观|造型|设计|款式|配色)?|各(?:个|种|款|套)?(?:方案|外观|造型|设计|款式|配色)?|逐(?:个|种|款|套)?(?:方案|外观|造型|设计|款式|配色)?).{0,10}(?:单独|分别|各自).{0,6}(?:一张|生成|输出)|(?:单独|分别|各自).{0,10}(?:每|各|逐)(?:个|种|款|套)?(?:方案|外观|造型|设计|款式|配色)?/;
  if (!splitInstruction.test(compact)) return undefined;
  const token = "(\\d{1,2}|十二|十一|[一二两三四五六七八九十])";
  const match = compact.match(new RegExp(`${token}(?:个|种|款|套)(?:差异化|不同|全新)?(?:外观|造型|设计|配色|CMF)?(?:方案|款式)?`, "i"));
  const count = match ? countToken(match[1]) : undefined;
  return count ? Math.max(1, Math.min(100, count)) : undefined;
}

export function separatelyRequestedViewCount(text: string) {
  if (!requestsSeparateViews(text)) return undefined;
  const match = text.match(/([3-8三四五六七八])(?:视图|视角|(?:个|种)?(?:不同)?角度)/);
  return match ? countToken(match[1]) : undefined;
}

/** Final file count, not the number of concepts/colours placed inside one board. */
export function resolveFreeChatImageCount(text: string) {
  return explicitFreeChatImageCount(text) ?? separatelyRequestedViewCount(text) ?? separatelyRequestedCmfCount(text) ?? separatelyRequestedDesignVariantCount(text) ?? 1;
}

export function resolveFreeChatResolution(content: string, requested?: "1K" | "2K" | "4K", sixViewBoard = requestsSixViewBoard(content)): "1K" | "2K" | "4K" {
  const explicit = content.match(/(?:^|[^0-9])([124])\s*K/i)?.[1];
  return explicit ? `${explicit}K` as "1K" | "2K" | "4K" : requested || (sixViewBoard ? "4K" : "1K");
}

function chineseNumber(value: string) {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (!/[十百]/.test(value)) return Number([...value].map((item) => digits[item]).join(""));
  let total = 0;
  let current = 0;
  for (const char of value) {
    if (char in digits) current = digits[char];
    else if (char === "十") { total += (current || 1) * 10; current = 0; }
    else if (char === "百") { total += (current || 1) * 100; current = 0; }
  }
  return total + current;
}

export function explicitImageCount(content: string) {
  const number = "([0-9]{1,3}|[零〇一二两三四五六七八九十百]+)";
  const counter = "(?:张|个|套|款|幅|组|种)";
  const modifiers = "(?:(?:全新(?:的)?|新(?:的)?|不同(?:的)?|明显不同(?:的)?|差异(?:明显|化)?(?:的)?|独立(?:的)?|各不相同(?:的)?|多样(?:化)?(?:的)?|创新(?:的)?|创意(?:的)?|产品|使用)\\s*){0,6}";
  const target = "(?:外观(?:方案|设计|改款|变款)?|包装(?:设计|方案|效果图)?|设计方案|场景(?:图|效果图)?|图片|图像|效果图|方案|变款|款式(?:造型|方案)?|造型方案|角度(?:视图)?|视图)";
  const actionPattern = new RegExp(`(?:批量\\s*)?(?:生成|出图|出|做|创建|制作|产出|给我|需要|要)\\s*(?:至少|一共|共)?\\s*${number}\\s*${counter}?\\s*${modifiers}${target}`, "i");
  const directPattern = new RegExp(`${number}\\s*${counter}\\s*${modifiers}${target}`, "i");
  const match = content.match(actionPattern) || content.match(directPattern);
  if (!match?.[1]) return null;
  const parsed = /^\d+$/.test(match[1]) ? Number(match[1]) : chineseNumber(match[1]);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(Math.trunc(parsed), 100)) : null;
}

export function resolveParameterImageCount(agentId: AgentId, settings: Record<string, string | number | boolean>, content: string) {
  const clamp = (value: unknown, fallback: number, max: number) => {
    const parsed = Math.trunc(Number(value));
    return Math.max(1, Math.min(Number.isFinite(parsed) ? parsed : fallback, max));
  };
  const explicit = explicitImageCount(content);
  const separateViewCount = separatelyRequestedViewCount(content);
  if (agentId === "multi-view" && separateViewCount) return explicitFreeChatImageCount(content) ?? separateViewCount;
  if (agentId === "multi-view" && settings.multiViewBoard === true) return 1;
  if (agentId === "multi-view" && settings.multiViewBoard !== false && requestsSixViewBoard(content)) return 1;
  if (explicit) return explicit;
  if (settings.outputCount !== undefined) return clamp(settings.outputCount, 1, 100);
  if (agentId === "appearance-variants") return clamp(settings.variants, 1, 100);
  if (agentId === "render-studio" || agentId === "local-retouch" || agentId === "cmf-colorways" || agentId === "sketch-envelope" || agentId === "detail-view") return clamp(settings.outputs, 1, 100);
  if (agentId === "multi-view") return clamp(settings.viewCount, 6, 100);
  return 1;
}

export function explicitResolution(content: string) {
  const match = content.match(/(?:^|[^0-9])([124])\s*[Kk](?:\s*分辨率)?/);
  return match ? `${match[1]}K` as "1K" | "2K" | "4K" : null;
}

export function detectNaturalDesignIntent(value: string): NaturalDesignIntent {
  const text = value.replace(/\s+/g, "");
  const surface = /贴花|贴纸|花纹|图案|涂装|配色|颜色|色彩|材质|质感|纹理|光泽|表面工艺|磨砂|哑光|亮面|拉丝|烤漆|电镀|CMF/i.test(text)
    || /(?:改成|换成|变成|更换为|调整为|改为|换为|涂成|喷成|改用|换用|采用)[^，,。；;]{0,8}(?:(?:深|浅|亮|暗)?(?:红|橙|黄|绿|蓝|紫|黑|白|灰|粉|棕|褐|银|金)色|金属|木纹|皮革|陶瓷|玻璃|磨砂|哑光|拉丝)/.test(text);
  // Negated shape edits are locks, not permission to redesign. Positive geometry
  // changes still win over surface vocabulary (including a separate keep-angle request).
  const geometryText = text
    .replace(/(?:不(?:要|能|可以|需要|允许)?|禁止|无需|不得|严禁)[^，,。；;]{0,4}(?:重新设计|重塑|改变|改动|调整|更换|修改)[^，,。；;]{0,5}(?:造型|轮廓|结构|外形|体块)/g, "")
    .replace(/(?:造型|轮廓|结构|外形|体块)[^，,。；;]{0,4}(?:不(?:要|能|可以|需要|允许)?|禁止|无需|不得|严禁)[^，,。；;]{0,4}(?:重新设计|重塑|改变|改动|调整|更换|修改)/g, "");
  const geometryChange = /从零|全新产品|新款产品|(?:重新设计|重塑|改变|改动|调整|更换|修改).{0,5}(?:造型|轮廓|结构|外形|体块)|(?:造型|轮廓|结构|外形|体块).{0,5}(?:重新设计|重塑|改变|改动|调整|修改)/.test(geometryText);
  const viewRequestText = text.replace(/(?:保持|保留|沿用|维持)[^，,。；;]{0,12}(?:多角度|不同角度|[六八68]视[图角]|五视图|三视图|四视图|[左右]前?45[°度]?(?:视图)?|正视|侧视|背面|后视|俯视|仰视|视图布局)/g, "").replace(/(?:不|不要|禁止)[^，,。；;]{0,4}(?:改|动|换|生成|新增)[^，,。；;]{0,6}(?:角度|视角|视图)/g, "");
  const requestsNewViews = (requestsSeparateViews(viewRequestText) && /角度|视角|视图|正视|后视|左视|右视|顶视|底视/.test(viewRequestText))
    || /(?:生成|新增|制作|输出|换|改成|做)[^，,。；;]{0,8}(?:多角度|不同角度|[六八68]视[图角]|五视图|四视图|三视图|正视|侧视|背面|后视|俯视|仰视|[左右]前?45[°度]?|环绕视角)/.test(viewRequestText)
    // The six-view shortcut spells out canvas ratio, resolution and grid before
    // naming the requested board. Those rendering details are not surface edits.
    || /(?:生成|制作|输出)[^。；;]{0,80}(?:[六八68]视[图角]|[三四五]视图)(?:整版)?/.test(viewRequestText);
  if (surface && !requestsNewViews && !geometryChange) return "surface-only";
  if (requestsNewViews) return "multi-view";
  const withoutLockedViews = viewRequestText;
  if (/多角度|不同角度|换.{0,3}角度|正视|侧视|背面|后视|俯视|仰视|[六八68]视[图角]|五视图|三视图|四视图|[左右]前?45[°度]?|环绕视角/.test(withoutLockedViews)) return "multi-view";
  if (/(?:只|仅|不要动其他|其余不变|其他不变|保持其他).{0,40}(?:改|调整|缩小|放大|加宽|变窄|降低|提高|替换|删除)|(?:孔|按钮|屏幕|把手|接口|开口|支脚|轮子|旋钮).{0,20}(?:缩小|放大|加宽|变窄|调整|移动|降低|提高)/.test(text)) return "scoped-edit";
  return "standard";
}
