// 生成结果卡片类型
export type ResultCard = {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  variationLabel?: string;
  sellingPoints?: string[];
  materialProcess?: string;
  difference?: string;
  qualityWarning?: string;
  designDirectionLabel?: string;
};

// 生成进度状态
export type GenerationState = {
  isGenerating: boolean;
  phase: string;
  message: string;
  percent: number;
  completed: number;
  total: number;
  cards: ResultCard[];
  error?: string;
  context?: {
    productName?: string;
    templateLabel?: string;
    variationLevel?: number;
    notes?: string;
    applicationMode?: string;
    productImageThumbnails?: string[];
    referenceImageCount?: number;
    hasLocalEdit?: boolean;
    editRegionIntent?: string;
    editRegionInstruction?: string;
    commercePlatform?: string;
    commerceLocale?: string;
    kitPreset?: string;
  };
};

// 参考图角色
export type ReferenceImageRole = "auto" | "form" | "color" | "material" | "style";

// 历史记录
export type HistoryRecord = {
  id: string;
  createdAt: number;
  productName: string;
  templateId: string;
  templateLabel: string;
  variationLevel: number;
  count: number;
  notes: string;
  cards: ResultCard[];
  // 生成上下文（用于复盘）
  applicationMode?: string;
  productImageThumbnails?: string[]; // 产品原图缩略图（压缩后）
  referenceImageCount?: number; // 参考图数量
  referenceImageRoles?: string[]; // 参考图角色
  hasLocalEdit?: boolean; // 是否使用了局部改款
  editRegionIntent?: string; // 局部改款意图
  editRegionInstruction?: string; // 局部改款说明
  commercePlatform?: string; // 电商平台
  commerceLocale?: string; // 电商语言
  kitPreset?: string; // 商品套图预设
};

// 复用的生成参数
export type PendingGenerateConfig = {
  productName: string;
  templateId: string;
  variationLevel: number;
  count: number;
  notes: string;
} | null;

// 分组批量生成
export type BatchGroup = {
  id: string;
  name: string;
  enabled: boolean;
  templateId: string;
  variationLevel: number;
  count: number;
  notes: string;
};

export type BatchResultGroup = {
  groupId: string;
  groupName: string;
  cards: ResultCard[];
};

// 局部改款意图
export type LocalEditIntent = "form" | "cmf" | "remove";
