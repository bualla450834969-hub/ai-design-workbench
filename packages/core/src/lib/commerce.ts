export const COMMERCE_PLATFORM_OPTIONS = [
  { value: "amazon", label: "亚马逊" },
  { value: "tmall", label: "天猫 / 淘宝" },
  { value: "jd", label: "京东" },
  { value: "pdd", label: "拼多多" },
  { value: "douyin", label: "抖音电商" },
  { value: "xiaohongshu", label: "小红书" },
  { value: "independent", label: "独立站" },
  { value: "shopify", label: "Shopify" },
  { value: "shopee", label: "Shopee" }
] as const;

export type CommercePlatform = (typeof COMMERCE_PLATFORM_OPTIONS)[number]["value"];

export const COMMERCE_LOCALE_OPTIONS = [
  { value: "zh-CN", label: "简体中文", group: "常用语言", direction: "ltr" },
  { value: "zh-TW", label: "繁体中文", group: "常用语言", direction: "ltr" },
  { value: "en-US", label: "英文", group: "常用语言", direction: "ltr" },
  { value: "ja-JP", label: "日文", group: "常用语言", direction: "ltr" },
  { value: "ko-KR", label: "韩文", group: "常用语言", direction: "ltr" },
  { value: "th-TH", label: "泰文", group: "东南亚", direction: "ltr" },
  { value: "id-ID", label: "印度尼西亚语", group: "东南亚", direction: "ltr" },
  { value: "vi-VN", label: "越南语", group: "东南亚", direction: "ltr" },
  { value: "ms-MY", label: "马来语", group: "东南亚", direction: "ltr" },
  { value: "fil-PH", label: "菲律宾语", group: "东南亚", direction: "ltr" },
  { value: "de-DE", label: "德文", group: "欧洲与美洲", direction: "ltr" },
  { value: "fr-FR", label: "法文", group: "欧洲与美洲", direction: "ltr" },
  { value: "es-ES", label: "西班牙文", group: "欧洲与美洲", direction: "ltr" },
  { value: "pt-BR", label: "葡萄牙文（巴西）", group: "欧洲与美洲", direction: "ltr" },
  { value: "it-IT", label: "意大利文", group: "欧洲与美洲", direction: "ltr" },
  { value: "nl-NL", label: "荷兰文", group: "欧洲与美洲", direction: "ltr" },
  { value: "pl-PL", label: "波兰文", group: "欧洲与美洲", direction: "ltr" },
  { value: "ru-RU", label: "俄文", group: "欧洲与美洲", direction: "ltr" },
  { value: "tr-TR", label: "土耳其文", group: "中东与南亚", direction: "ltr" },
  { value: "ar-SA", label: "阿拉伯文（从右到左）", group: "中东与南亚", direction: "rtl" },
  { value: "hi-IN", label: "印地文", group: "中东与南亚", direction: "ltr" }
] as const;

export type CommerceLocale = (typeof COMMERCE_LOCALE_OPTIONS)[number]["value"];

export const COMMERCE_DETAIL_STYLE_OPTIONS = [
  { value: "platform-native", label: "平台原生", description: "自动贴合所选平台" },
  { value: "sales-focused", label: "转化导向", description: "卖点清楚、节奏更强" },
  { value: "brand-story", label: "品牌叙事", description: "克制、完整、有故事" },
  { value: "spec-focused", label: "功能参数", description: "结构、使用与规格优先" },
  { value: "social-editorial", label: "内容种草", description: "生活化、编辑感更强" }
] as const;

export type CommerceDetailStyle = (typeof COMMERCE_DETAIL_STYLE_OPTIONS)[number]["value"];

export const COMMERCE_COPY_DENSITY_OPTIONS = [
  { value: "light", label: "少文案", description: "大图 + 一句重点" },
  { value: "balanced", label: "均衡", description: "标题 + 短说明" },
  { value: "detailed", label: "信息丰富", description: "适合功能与参数型商品" }
] as const;

export type CommerceCopyDensity = (typeof COMMERCE_COPY_DENSITY_OPTIONS)[number]["value"];

export const COMMERCE_DETAIL_MODULE_ROLE_OPTIONS = [
  { value: "hero", label: "首屏主视觉", visual: "产品占据视觉中心，保留清晰标题区与简短副文案区" },
  { value: "problem", label: "痛点引入", visual: "用真实使用情境表现问题，不夸张、不制造虚假前后对比" },
  { value: "benefit", label: "核心利益点", visual: "一个页面只讲一个核心利益点，产品与证据同时出现" },
  { value: "feature", label: "功能说明", visual: "通过结构、动作或局部放大解释真实功能" },
  { value: "detail", label: "细节与工艺", visual: "可信的产品特写，突出可见材质、结构和做工" },
  { value: "usage", label: "使用方式 / 场景", visual: "展示真实使用步骤、姿态或生活场景，产品身份保持一致" },
  { value: "comparison", label: "对比 / 规格", visual: "使用清晰表格或对照结构，只呈现用户提供或图片可证实的信息" },
  { value: "trust", label: "信任与保障", visual: "用包装、配件、服务或细节建立信任，不伪造认证、评价和销量" },
  { value: "brand", label: "品牌故事", visual: "用克制的品牌语气连接产品理念、设计语言和目标人群" },
  { value: "closing", label: "收尾购买理由", visual: "总结真实优势并形成干净收尾，不放虚假价格、倒计时或平台徽章" }
] as const;

export type CommerceDetailModuleRole = (typeof COMMERCE_DETAIL_MODULE_ROLE_OPTIONS)[number]["value"];
export type CommerceTextPosition = "left" | "right" | "top" | "bottom" | "center";

export type CommerceDetailModule = {
  id?: string;
  role: CommerceDetailModuleRole;
  headline: string;
  body: string;
  visualDirection: string;
  textPosition: CommerceTextPosition;
};

export type CommercePlatformProfile = {
  label: string;
  summary: string;
  visualStyle: string;
  layoutRule: string;
  copyRule: string;
  caution: string;
  moduleOrder: CommerceDetailModuleRole[];
};

export const COMMERCE_PLATFORM_PROFILES: Record<CommercePlatform, CommercePlatformProfile> = {
  amazon: {
    label: "Amazon A+ 模块化",
    summary: "像 A+ 内容一样用独立模块逐项解释功能、细节、场景与品牌价值。",
    visualStyle: "专业、克制、留白充足，真实产品证据优先",
    layoutRule: "宽幅模块、左右图文、三到四项功能卡和比较模块；兼顾手机裁切",
    copyRule: "短标题、短段落、功能与用户利益对应，避免把重要文字烘焙成极小字号",
    caution: "不生成评分、评论、Prime、Best Seller、价格、折扣、认证或竞品贬损",
    moduleOrder: ["hero", "benefit", "feature", "detail", "usage", "comparison", "brand", "closing"]
  },
  tmall: {
    label: "天猫 / 淘宝移动长页",
    summary: "用强首屏建立记忆点，再以痛点、卖点、细节、场景和信任逐屏推进。",
    visualStyle: "视觉冲击明确、图文一体、长页节奏丰富但层级清楚",
    layoutRule: "手机优先的纵向分屏，大标题与产品大图交替，重要内容避免贴边",
    copyRule: "标题可更有营销感，但正文要短；一屏一个结论，避免密集小字",
    caution: "不编造销量、到手价、倒计时、平台活动、疗效、认证和绝对化承诺",
    moduleOrder: ["hero", "problem", "benefit", "feature", "detail", "usage", "trust", "closing"]
  },
  jd: {
    label: "京东理性功能页",
    summary: "强调功能结构、规格逻辑、耐用与可信体验，适合数码、家电和工具类。",
    visualStyle: "理性、可靠、清爽，技术信息与真实使用并重",
    layoutRule: "先价值再结构，穿插局部特写、操作步骤、规格或对比模块",
    copyRule: "标题直接说明功能，说明文字具体，参数仅使用用户提供的事实",
    caution: "不伪造检测、质保、认证、服务范围、性能数值或平台权益",
    moduleOrder: ["hero", "feature", "benefit", "detail", "comparison", "usage", "trust", "closing"]
  },
  pdd: {
    label: "拼多多快速转化页",
    summary: "首屏迅速说清产品和核心价值，后续用简明利益点与真实细节降低理解成本。",
    visualStyle: "识别快、对比强、文字醒目但不过度拥挤",
    layoutRule: "短屏快节奏，大图、大标题、单卖点卡与使用场景交替",
    copyRule: "句子短、结论前置，价值表达清楚，不依赖虚构低价信息",
    caution: "不生成虚假拼团价、限时、库存、赠品、销量、评价或夸大承诺",
    moduleOrder: ["hero", "benefit", "feature", "usage", "detail", "trust", "closing"]
  },
  douyin: {
    label: "抖音电商短内容节奏",
    summary: "像短视频分镜一样先抓注意，再用场景动作快速证明卖点。",
    visualStyle: "动态、生活化、强钩子，画面主体清楚",
    layoutRule: "竖屏思维、短句字幕、安全区明确，每屏一个动作或利益点",
    copyRule: "标题口语化、节奏快，避免长段正文；结论必须能被画面支持",
    caution: "不伪造达人背书、用户评价、热度、销量、直播价格和功效",
    moduleOrder: ["hero", "problem", "usage", "benefit", "feature", "detail", "closing"]
  },
  xiaohongshu: {
    label: "小红书编辑种草页",
    summary: "用真实生活方式、体验感和审美一致性建立兴趣，而不是硬广堆卖点。",
    visualStyle: "自然、编辑感、生活化、留白轻盈",
    layoutRule: "封面式首屏、场景体验、细节记录、使用心得与克制收尾",
    copyRule: "像真实笔记的短标题和体验描述，少用命令式购买话术",
    caution: "不伪造博主身份、使用见证、评价数据、前后疗效和热门标签",
    moduleOrder: ["hero", "usage", "problem", "benefit", "detail", "brand", "closing"]
  },
  independent: {
    label: "独立站品牌落地页",
    summary: "以品牌主张、产品价值、富媒体和清晰购买理由组成可响应式落地页。",
    visualStyle: "品牌一致、模块克制、适配桌面和移动端",
    layoutRule: "主视觉、品牌故事、功能卡、场景、细节、规格与收尾 CTA 的响应式结构",
    copyRule: "标题体现品牌语气，正文兼顾利益、证据和 SEO 可读性",
    caution: "不编造品牌历史、用户数量、媒体背书、认证、退款政策和物流承诺",
    moduleOrder: ["hero", "brand", "benefit", "feature", "usage", "detail", "comparison", "closing"]
  },
  shopify: {
    label: "Shopify 富媒体商品页",
    summary: "采用可重排的品牌模块、富文本、媒体和规格信息，兼顾多市场本地化。",
    visualStyle: "主题一致、图片高质量、富媒体友好、可响应式",
    layoutRule: "首图与描述后接品牌故事、功能、媒体、使用、规格和购买理由模块",
    copyRule: "标题与描述可用于富文本，强调利益、用途、证据和独特性",
    caution: "不编造规格、材质、库存、物流、退款政策、评论和合规声明",
    moduleOrder: ["hero", "brand", "benefit", "feature", "usage", "detail", "comparison", "closing"]
  },
  shopee: {
    label: "Shopee 移动跨境页",
    summary: "面向东南亚移动购物，用本地化短文案、图标化利益点和真实场景快速说明。",
    visualStyle: "明快、友好、移动端易读，本地语言优先",
    layoutRule: "竖向短模块，大产品图、图标卖点、场景、细节和信任信息依次展开",
    copyRule: "本地化短句、字号清楚，避免逐字机翻和一图塞入多种语言",
    caution: "不伪造平台补贴、免运、销量、评价、认证、赠品和到货承诺",
    moduleOrder: ["hero", "benefit", "feature", "usage", "detail", "trust", "closing"]
  }
};

export function commercePlatformLabel(platform: CommercePlatform) {
  return COMMERCE_PLATFORM_OPTIONS.find((option) => option.value === platform)?.label || "亚马逊";
}

export function commerceLocaleLabel(locale: CommerceLocale) {
  const labels: Record<CommerceLocale, string> = {
    "zh-CN": "Simplified Chinese",
    "zh-TW": "Traditional Chinese",
    "en-US": "English",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
    "th-TH": "Thai",
    "id-ID": "Indonesian",
    "vi-VN": "Vietnamese",
    "ms-MY": "Malay",
    "fil-PH": "Filipino",
    "de-DE": "German",
    "fr-FR": "French",
    "es-ES": "Spanish",
    "pt-BR": "Brazilian Portuguese",
    "it-IT": "Italian",
    "nl-NL": "Dutch",
    "pl-PL": "Polish",
    "ru-RU": "Russian",
    "tr-TR": "Turkish",
    "ar-SA": "Arabic",
    "hi-IN": "Hindi"
  };
  return labels[locale];
}

export function commerceLocaleDirection(locale: CommerceLocale) {
  return COMMERCE_LOCALE_OPTIONS.find((option) => option.value === locale)?.direction || "ltr";
}

export function commerceLocaleWritingRule(locale: CommerceLocale) {
  const language = commerceLocaleLabel(locale);
  return locale === "ar-SA"
    ? `All visible customer-facing copy must be natural ${language}, set right-to-left with right alignment, correct Arabic shaping, generous line spacing and no disconnected letters. Do not mix left-to-right layout into the Arabic copy block except unavoidable model numbers.`
    : `All visible customer-facing copy must be natural ${language}, not a literal machine translation. Use the correct script, punctuation and line breaking for that language, with large legible type and no pseudo-text.`;
}

export function commercePlatformProfilePrompt(platform: CommercePlatform) {
  const profile = COMMERCE_PLATFORM_PROFILES[platform];
  return [
    `PLATFORM-NATIVE PROFILE — ${profile.label}.`,
    `Visual style: ${profile.visualStyle}.`,
    `Layout: ${profile.layoutRule}.`,
    `Copy: ${profile.copyRule}.`,
    `Safety: ${profile.caution}.`
  ].join(" ");
}

export function commerceDetailStylePrompt(style: CommerceDetailStyle) {
  return style === "sales-focused"
    ? "Conversion-focused page: lead with one clear benefit per screen, fast hierarchy and evidence-led purchase reasons."
    : style === "brand-story"
      ? "Brand-story page: use restrained art direction, coherent narrative, emotional context and consistent brand voice."
      : style === "spec-focused"
        ? "Specification-focused page: prioritize structure, operation, verified data, close-ups and comparison clarity."
        : style === "social-editorial"
          ? "Social-editorial page: use authentic lifestyle framing, concise experience-led copy and an editorial rhythm rather than hard selling."
          : "Follow the selected platform's native content rhythm and module conventions.";
}

export function commerceCopyDensityPrompt(density: CommerceCopyDensity) {
  return density === "light"
    ? "Use one short headline and at most one short supporting sentence per module."
    : density === "detailed"
      ? "Use a clear headline plus two or three concise, scannable supporting lines; never create a wall of tiny text."
      : "Use a clear headline plus one or two concise supporting lines with balanced image-to-copy ratio.";
}

export function normalizeCommerceDetailStyle(value?: string): CommerceDetailStyle {
  return COMMERCE_DETAIL_STYLE_OPTIONS.some((option) => option.value === value) ? (value as CommerceDetailStyle) : "platform-native";
}

export function normalizeCommerceCopyDensity(value?: string): CommerceCopyDensity {
  return COMMERCE_COPY_DENSITY_OPTIONS.some((option) => option.value === value) ? (value as CommerceCopyDensity) : "balanced";
}

function normalizeModuleRole(value?: string): CommerceDetailModuleRole {
  return COMMERCE_DETAIL_MODULE_ROLE_OPTIONS.some((option) => option.value === value)
    ? (value as CommerceDetailModuleRole)
    : "feature";
}

function normalizeTextPosition(value?: string): CommerceTextPosition {
  return value === "right" || value === "top" || value === "bottom" || value === "center" ? value : "left";
}

function compact(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

export function normalizeCommerceDetailModules(value: unknown, maxCount = 20): CommerceDetailModule[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, Math.max(1, maxCount)).map((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const role = normalizeModuleRole(typeof record.role === "string" ? record.role : undefined);
    const roleOption = COMMERCE_DETAIL_MODULE_ROLE_OPTIONS.find((option) => option.value === role)!;
    return {
      id: compact(record.id, 80) || `detail-module-${index + 1}`,
      role,
      headline: compact(record.headline, 120),
      body: compact(record.body, 360),
      visualDirection: compact(record.visualDirection, 420) || roleOption.visual,
      textPosition: normalizeTextPosition(typeof record.textPosition === "string" ? record.textPosition : undefined)
    };
  });
}

export function buildDefaultCommerceDetailModules(platform: CommercePlatform, count: number): CommerceDetailModule[] {
  const profile = COMMERCE_PLATFORM_PROFILES[platform];
  const safeCount = Math.min(Math.max(Math.round(count) || 1, 1), 20);
  return Array.from({ length: safeCount }, (_, index) => {
    const role = profile.moduleOrder[index % profile.moduleOrder.length];
    const roleOption = COMMERCE_DETAIL_MODULE_ROLE_OPTIONS.find((option) => option.value === role)!;
    const positions: CommerceTextPosition[] = ["left", "right", "top", "bottom"];
    return {
      id: `detail-module-${index + 1}`,
      role,
      headline: "",
      body: "",
      visualDirection: roleOption.visual,
      textPosition: positions[index % positions.length]
    };
  });
}
