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
