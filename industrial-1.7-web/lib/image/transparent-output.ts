import sharp from "sharp";

/** Verify actual transparent pixels, then return a PNG without changing dimensions. */
export async function verifiedTransparentPng(bytes: Buffer): Promise<Buffer> {
  const image = sharp(bytes, { failOn: "error" });
  const metadata = await image.metadata();
  if (!metadata.hasAlpha) throw new Error("图片模型返回了不透明背景，未得到可用的透明 PNG。请先核对供应商任务和扣费情况，再更换支持透明背景的模型。");
  const sample = await sharp(bytes).resize(96, 96, { fit: "fill" }).toColourspace("srgb").ensureAlpha().raw().toBuffer();
  let transparent = 0;
  let opaque = 0;
  let borderTransparent = 0;
  for (let pixel = 0; pixel < 96 * 96; pixel += 1) {
    const alpha = sample[pixel * 4 + 3];
    if (alpha <= 16) {
      transparent += 1;
      const x = pixel % 96, y = Math.floor(pixel / 96);
      if (x === 0 || y === 0 || x === 95 || y === 95) borderTransparent += 1;
    }
    if (alpha >= 240) opaque += 1;
  }
  if (transparent < Math.ceil(96 * 96 * 0.01) || opaque < Math.ceil(96 * 96 * 0.01) || borderTransparent < Math.ceil((96 * 4 - 4) * 0.5)) {
    throw new Error("图片模型未提供足够的真实透明区域，无法作为透明 PNG 保存。请先核对供应商任务和扣费情况，再更换支持透明背景的模型。");
  }
  return sharp(bytes).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}
