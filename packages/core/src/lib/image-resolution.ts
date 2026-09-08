import sharp from "sharp";
import type { GeneratedImage } from "../types/app";

export type NativeImageTarget = "2K" | "4K";

const TARGET_LONG_EDGE: Record<NativeImageTarget, number> = {
  "2K": 2048,
  "4K": 4096
};

async function generatedImageBuffer(image: GeneratedImage, signal?: AbortSignal) {
  if (image.base64) return Buffer.from(image.base64, "base64");
  const url = image.url?.trim();
  if (!url) throw new Error("生图服务没有返回可校验的图片。");
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`无法下载生成图用于分辨率校验：${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Provider-native 2K/4K is requested first. This final gate inspects the actual
 * returned pixels and only enlarges when the provider silently returns less.
 */
export async function ensureGeneratedImageResolution(
  image: GeneratedImage,
  target: NativeImageTarget,
  signal?: AbortSignal
): Promise<GeneratedImage> {
  const input = await generatedImageBuffer(image, signal);
  const metadata = await sharp(input).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new Error("生成图分辨率无法校验，本次不会冒充 2K/4K 结果。");

  const targetLongEdge = TARGET_LONG_EDGE[target];
  if (Math.max(width, height) >= targetLongEdge) return image;

  const resized = await sharp(input)
    .resize({
      width: width >= height ? targetLongEdge : undefined,
      height: height > width ? targetLongEdge : undefined,
      fit: "inside",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  const verified = await sharp(resized).metadata();
  if (Math.max(verified.width ?? 0, verified.height ?? 0) < targetLongEdge) {
    throw new Error(`${target} 像素校验未通过，本次结果已拦截。`);
  }

  return {
    ...image,
    base64: resized.toString("base64"),
    url: undefined,
    mimeType: "image/png"
  };
}
