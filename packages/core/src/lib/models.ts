export const BRAIN_MODELS = [
  { label: "GPT-5（默认，OpenAI 多模态读图，约¥0.02-0.07/次）", value: "gpt-5" },
  { label: "Gemini 2.5 Pro（多模态读图，约¥0.02-0.06/次）", value: "gemini-2.5-pro" },
  { label: "Gemini 3 Pro Preview（高质量读图，约¥0.03-0.08/次）", value: "gemini-3-pro-preview" },
  { label: "Gemini 3.1 Pro Preview（复杂方案读图，约¥0.03-0.08/次）", value: "gemini-3.1-pro-preview" }
] as const;

export const IMAGE_MODELS = [
  { label: "Gemini 3.1 Flash Image Preview（默认，Nano Banana 2，约¥0.15/张）", value: "gemini-3.1-flash-image-preview" },
  { label: "Gemini 2.5 Flash Image（支持参考图，约¥0.06/张）", value: "gemini-2.5-flash-image" },
  { label: "Gemini 2.5 Flash Image Preview（多参考图，约¥0.06/张）", value: "gemini-2.5-flash-image-preview" },
  { label: "Gemini 3 Pro Image（高质量生成/编辑，约¥0.22/张）", value: "gemini-3-pro-image-preview" },
  { label: "GPT Image 2（高保真图片输入与编辑，约¥0.04/张）", value: "gpt-image-2" },
  { label: "GPT Image 2 Pro（高质量备选，约¥0.10/张）", value: "gpt-image-2-pro" }
] as const;
