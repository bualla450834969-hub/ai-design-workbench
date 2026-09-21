import type { ReferenceImageRole, BatchGroup, LocalEditIntent } from "@/types";

// 设计方向模板
export const TEMPLATES = [
  { id: "smart-auto", label: "造型突破改款" },
  { id: "functional-architecture", label: "功能重构款" },
  { id: "future-concept", label: "未来概念款" },
  { id: "patent-around", label: "专利规避款" },
  { id: "detail-page-scene", label: "使用体验优化" },
  { id: "premium-upgrade", label: "高端升级款" },
  { id: "production-ready", label: "量产落地款" },
  { id: "low-cost-production", label: "低成本量产款" },
  { id: "young-trendy", label: "年轻潮流款" },
  { id: "feature-detail", label: "卖点强化款" },
  { id: "series-family", label: "系列延展款" },
];

export const REFERENCE_ROLE_LABELS: Record<ReferenceImageRole, string> = {
  auto: "自动识别",
  form: "造型参考",
  color: "配色参考",
  material: "材质参考",
  style: "风格参考",
};

export const HISTORY_KEY = "generationHistory";
export const FAVORITES_KEY = "favoriteCards";
export const MAX_HISTORY = 20;
export const MAX_FAVORITES = 50;

export const DEFAULT_BATCH_GROUPS: BatchGroup[] = [
  { id: "g1", name: "造型突破款", enabled: true, templateId: "smart-auto", variationLevel: 65, count: 2, notes: "" },
  { id: "g2", name: "功能重构款", enabled: true, templateId: "functional-architecture", variationLevel: 50, count: 2, notes: "" },
  { id: "g3", name: "年轻潮流款", enabled: true, templateId: "young-trendy", variationLevel: 75, count: 2, notes: "" },
  { id: "g4", name: "高端升级款", enabled: false, templateId: "premium-upgrade", variationLevel: 40, count: 2, notes: "" },
];

// 应用模式
export const APPLICATION_MODES = [
  { value: "appearance-redesign", label: "外观重构", desc: "重新设计产品外观" },
  { value: "product-kit", label: "商品套图", desc: "保持产品不变，生成电商场景图" },
  { value: "detail-page", label: "电商详情页", desc: "生成完整详情页长图" },
];

// 专家角色
export const EXPERT_ROLES = [
  {
    value: "appearance-redesign",
    label: "外观重构专家",
    desc: "重新设计产品外观造型",
    systemPrompt: "你是工业设计外观改款专家。以图片结果为主，不输出长篇分析。先在内部区分用户明确要求保留的功能硬点、必要结构包络、可修改外壳和纯CMF区域，再严格按用户明确要求的数量生成独立方案；用户没有指定数量时只生成1张。参考图是功能与品类起点，不是照抄模板；除明确保留项外，每个方案必须至少同时改变轮廓比例、体块关系、分件方式、特征面、细节图形或CMF分区中的三项，禁止只换颜色、材质或背景。批量方案必须采用互不重复的造型语言，确保一眼可辨差异。每张图只放一个完整方案，不拼四宫格，不用文字占据画面。",
  },
  {
    value: "cmf-expert",
    label: "配色 CMF 专家",
    desc: "锁定造型，只改颜色材质工艺",
    systemPrompt: "你是产品配色与 CMF 专家。以产品图为结构唯一依据，严格锁定轮廓、比例、零件数量、分件线、接口、视角和背景关系；风格或配色参考只提供色相、明度、饱和度、材质、纹理、光泽与表面工艺。每张结果是一个可落地的独立 CMF 方案，说明的颜色和工艺必须与图一致。禁止借配色任务改变造型、增删结构、扭曲被承载物或融合部件。",
  },
  {
    value: "local-retouch",
    label: "局部精修专家",
    desc: "蒙版内修改，蒙版外保持原样",
    systemPrompt: "你是局部精修专家。以图片结果为主，不输出长篇分析。只修改蒙版内指定内容，保持原产品身份、视角、光线和蒙版外所有内容。严格按用户明确要求的数量逐张生成，不要求模型全局重绘。",
  },
  {
    value: "multi-view",
    label: "多角度专家",
    desc: "三视图/四视图/六视图标准输出",
    systemPrompt: "你是工业产品多视图规划专家。以图片结果为主，不输出长篇分析。支持两种交付：指定角度逐张独立生成；或一张 3×2 六视图整版。刚体六视图固定为第一行正视、后视、左视，第二行右视、顶视、底视。六格必须是六个正确且互不重复的观察方向；同一产品、同一结构比例、部件数量、CMF和标识位置。六视图图片内部禁止出现任何文字、角度名称、数字、字母、标签、Logo说明或水印，只保留纯产品视图和统一背景。",
  },
  {
    value: "render-studio",
    label: "场景渲染专家",
    desc: "摄影棚/商业场景效果合成",
    systemPrompt: "你是产品渲染与场景专家。以图片结果为主，不输出长篇分析。明确区分结构图、CMF参考和场景参考；结构图决定轮廓与视角，CMF图只决定颜色材质工艺，场景图只决定环境光线与构图。严格按用户明确要求的数量逐张生成，每张图只包含一个主方案。商业场景必须满足尺度、接触、透视和光向合理。",
  },
  {
    value: "concept-architect",
    label: "概念灵感专家",
    desc: "生成多个差异化概念方向",
    systemPrompt: "你是概念灵感架构师。把输入整理为简洁Brief，并输出四个方向：方向名、目标感受、造型比例与线面语言、核心功能亮点、CMF和工艺、差异化与商业理由。四个方向必须真正不同，避免只换颜色。最后推荐一个方向并解释取舍。",
  },
];

export const COMMERCE_PLATFORMS = [
  { value: "tmall", label: "天猫/淘宝" },
  { value: "jd", label: "京东" },
  { value: "pdd", label: "拼多多" },
  { value: "douyin", label: "抖音电商" },
  { value: "xiaohongshu", label: "小红书" },
  { value: "amazon", label: "亚马逊" },
  { value: "independent", label: "独立站" },
  { value: "shopify", label: "Shopify" },
  { value: "shopee", label: "Shopee" },
];

export const COMMERCE_LOCALES = [
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁体中文" },
  { value: "en-US", label: "英文" },
  { value: "ja-JP", label: "日文" },
  { value: "ko-KR", label: "韩文" },
];

export const COMMERCE_RESOLUTIONS = [
  { value: "standard", label: "标准 (1K)" },
  { value: "2K", label: "2K 高清" },
  { value: "4K", label: "4K 超高清" },
];

// 生成数量选项
export const GENERATE_COUNT_OPTIONS = [1, 2, 3, 4, 6, 7, 10, 20, 50, 100];

export const ASPECT_RATIOS = [
  { value: "1:1", label: "1:1 正方形", desc: "电商主图、头像" },
  { value: "3:4", label: "3:4 竖版", desc: "小红书、详情页" },
  { value: "4:3", label: "4:3 横版", desc: "产品展示、PPT" },
  { value: "3:2", label: "3:2 横版", desc: "摄影、海报" },
  { value: "2:3", label: "2:3 竖版", desc: "海报、宣传单" },
  { value: "16:9", label: "16:9 宽屏", desc: "场景图、Banner" },
  { value: "9:16", label: "9:16 竖屏", desc: "手机端、短视频" },
];

export const DETAIL_STYLES = [
  { value: "platform-native", label: "平台原生" },
  { value: "sales-focused", label: "转化导向" },
  { value: "brand-story", label: "品牌叙事" },
  { value: "spec-focused", label: "功能参数" },
  { value: "social-editorial", label: "内容种草" },
];

export const COPY_DENSITIES = [
  { value: "light", label: "少文案" },
  { value: "balanced", label: "均衡" },
  { value: "detailed", label: "信息丰富" },
];

// 电商详情页视觉风格
export const DETAIL_VISUAL_STYLES = [
  { value: "auto", label: "自动匹配", desc: "根据产品品类自动选择最合适的视觉风格", prompt: "" },
  { value: "minimal", label: "简约风", desc: "大量留白、黑白灰、极简排版", prompt: "Use a minimalist visual style: abundant white space, monochrome black/white/gray palette, clean typography hierarchy, subtle shadows, no decorative elements. Let the product be the sole visual focus." },
  { value: "tech", label: "科技风", desc: "深色背景、蓝光、未来感、科技线条", prompt: "Use a tech/futuristic visual style: dark navy/black background, blue/cyan accent lighting, subtle grid lines or tech patterns, glowing effects, sleek and modern atmosphere, holographic hints." },
  { value: "premium", label: "高端风", desc: "深色、金/银色、高级材质、奢华感", prompt: "Use a premium/luxury visual style: deep charcoal or black background, gold/silver accent colors, rich material textures (marble, metal, velvet), dramatic lighting, elegant and sophisticated atmosphere." },
  { value: "chinese", label: "国潮风", desc: "中国传统元素、红/金色、东方美学", prompt: "Use a Chinese national trend (guochao) visual style: traditional Chinese elements and patterns, red/gold color palette, oriental aesthetics, ink wash hints, cultural motifs integrated modernly." },
  { value: "fresh", label: "清新风", desc: "明亮浅色系、自然元素、清新感", prompt: "Use a fresh/clean visual style: bright and airy, light pastel color palette, natural elements (plants, wood, sunlight), soft shadows, clean and refreshing atmosphere." },
  { value: "energetic", label: "活力风", desc: "鲜艳色彩、动感构图、年轻化", prompt: "Use an energetic/youthful visual style: vibrant and bold colors, dynamic compositions, diagonal lines, playful gradients, energetic and fun atmosphere, modern pop culture feel." },
];

export const LOCAL_EDIT_INTENT_LABELS: Record<LocalEditIntent, string> = {
  form: "改造型",
  cmf: "改配色材质",
  remove: "移除部件",
};

// 商品套图出图类型预设
export const PRODUCT_KIT_PRESETS = [
  { value: "auto", label: "自动混合", desc: "白底/展示/细节/场景/尺度/包装 自动分配", notes: "" },
  { value: "six-view", label: "标准六视图", desc: "正/后/左/右/顶/底 六个标准角度", notes: "生成产品的标准六视图：正面、背面、左侧、右侧、顶部、底部。保持产品外观完全不变，只改变拍摄角度。纯白背景，均匀光照，产品居中。" },
  { value: "scene", label: "场景图", desc: "真实使用场景中的产品", notes: "生成产品在真实使用场景中的图片。保持产品外观完全不变，只改变背景环境和光照。场景要符合产品的实际使用情境。" },
  { value: "white-bg", label: "白底主图", desc: "纯白背景电商主图", notes: "生成纯白背景的电商主图。产品居中，完整展示，均匀光照，无阴影或轻微阴影。符合电商平台主图规范。" },
  { value: "detail", label: "细节特写", desc: "产品核心细节特写", notes: "生成产品核心细节的特写图片。聚焦于产品最重要的材质、接口或功能细节，保持产品外观不变，只改变取景和焦距。" },
  { value: "lifestyle", label: "生活方式图", desc: "有人物互动的场景图", notes: "生成产品在生活场景中被使用的图片。可以包含人物手部或人物互动，但产品必须是视觉焦点。保持产品外观完全不变。" },
];
