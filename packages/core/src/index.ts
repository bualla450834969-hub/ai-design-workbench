/**
 * @workbench/core - AI 产品外观重构工作台核心引擎
 *
 * 从 AI-Design-Pro 学习源码抽取，v1.0.0 行为与原项目一致。
 * 包含：prompt 构建、生成 pipeline、质量校验、供应商适配。
 */

// 类型
export type {
  GenerateRequest,
  GenerateResponse,
  ProductPlanCard,
  ReferenceImageInput,
  GeneratedImage,
  PlanReview,
  OutputMode,
  FeasibilityMode,
  StyleMode,
  ReferenceImageRole,
  ReferenceTransferMode,
} from "./types/app";

// 设计模板
export {
  PRODUCT_TEMPLATES,
  getProductTemplate,
  normalizeProductTemplateId,
} from "./lib/templates";
export type { ProductTemplate } from "./lib/templates";

// 模型配置
export { BRAIN_MODELS, IMAGE_MODELS } from "./lib/models";

// 供应商
export {
  callGeekNowChatCompletion,
  generateGeekNowImageEdit,
} from "./providers/geeknow";
export {
  callAPIYIChatCompletion,
  generateAPIYIImageEdit,
} from "./providers/apiyi";
export {
  callAIHubMixChatCompletion,
  generateAIHubMixImageEdit,
} from "./providers/aihubmix";
export {
  callCustomOpenAIChatCompletion,
  generateCustomOpenAIImageEdit,
} from "./providers/custom-openai";

// 供应商弹性
export {
  callProviderChatWithRetry,
  logProviderImageFailure,
} from "./lib/provider-resilience";

// 服务端 API Key
export {
  getServerManagedApiConfig,
  resolveApiKey,
} from "./lib/server-api-key";

// 配色提取
export { buildReferenceColorPalette } from "./lib/reference-color-palette";

// 参考图证据
export { validateReferenceEvidence } from "./lib/reference-evidence";
export type { ValidatedReferenceEvidence } from "./lib/reference-evidence";

// 产品视图证据
export { validateProductViewEvidence } from "./lib/product-view-evidence";
export type { ValidatedProductViewEvidence } from "./lib/product-view-evidence";

// 局部编辑
export { normalizeLocalEditIntent } from "./lib/local-edit";
export type { LocalEditIntent } from "./lib/local-edit";

// 图片分辨率
export { ensureGeneratedImageResolution } from "./lib/image-resolution";

// 授权
export { requireLicense, activateLicense, LicenseError } from "./lib/license-auth";
export type { LicenseSession } from "./lib/license-auth";

// 核心生成引擎（完整 pipeline）
export { POST as runGenerationPipeline } from "./pipeline/generate-engine";
