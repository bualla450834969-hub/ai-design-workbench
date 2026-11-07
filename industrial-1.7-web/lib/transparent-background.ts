/** Only expose native transparency for models with a documented alpha output option. */
export function supportsTransparentBackgroundModel(providerType: string, imageModel: string): boolean {
  const provider = providerType.trim().toLowerCase();
  if (!["geekai", "apiyi", "aihubmix", "relayrouter", "openai-compatible"].includes(provider)) return false;
  return /^gpt-image-2\.5-(?:flare|sunburst)(?:-2026-09-08)?$/i.test(imageModel.trim());
}

export const TRANSPARENT_BACKGROUND_PROMPT =
  "本轮透明背景选项优先于普通任务里的背景保持要求。输出必须是带真实透明像素的 PNG：产品以外的画布完全透明，不能画白底、灰底、棋盘格、场景或假透明纹理。产品主体完整入镜，保留细小零件、半透明材质与自然边缘，不添加阴影地台或其他物体。";

export const TRANSPARENT_EXPORT_PROMPT =
  "本轮只把选中产品图片的背景去除，制作一张透明背景 PNG。以输入图片为唯一产品身份依据，保留产品的造型、零件数量与位置、视角、比例、颜色、材质、标识和可见细节；产品在画布中的位置、大小和方向也保持不变，不得重新设计、补造看不见的背面或添加任何零件。只做精细抠图，保留完整产品和必要的细小部件；画布其余区域具有真实透明像素，不绘制白底、棋盘格或场景。";
