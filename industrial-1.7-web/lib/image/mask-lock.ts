import sharp from "sharp";

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

/** 保留原图亮度结构和边线，仅从模型结果迁移色彩信息，供 0% 重构使用。 */
export async function lockGeometryWithGeneratedColor(original: Buffer, generated: Buffer): Promise<Buffer> {
  const originalImage = sharp(original).removeAlpha();
  const meta = await originalImage.metadata();
  if (!meta.width || !meta.height) throw new Error("无法读取原图尺寸");
  const { width, height } = meta;
  const originalRaw = await originalImage.raw().toBuffer();
  const generatedRaw = await sharp(generated).resize(width, height, { fit: "fill" }).removeAlpha().raw().toBuffer();
  const output = Buffer.alloc(originalRaw.length);
  for (let offset = 0; offset < originalRaw.length; offset += 3) {
    const originalLuma = originalRaw[offset] * 0.299 + originalRaw[offset + 1] * 0.587 + originalRaw[offset + 2] * 0.114;
    const generatedLuma = generatedRaw[offset] * 0.299 + generatedRaw[offset + 1] * 0.587 + generatedRaw[offset + 2] * 0.114;
    output[offset] = clampChannel(originalLuma + (generatedRaw[offset] - generatedLuma));
    output[offset + 1] = clampChannel(originalLuma + (generatedRaw[offset + 1] - generatedLuma));
    output[offset + 2] = clampChannel(originalLuma + (generatedRaw[offset + 2] - generatedLuma));
  }
  return sharp(output, { raw: { width, height, channels: 3 } }).png().toBuffer();
}
