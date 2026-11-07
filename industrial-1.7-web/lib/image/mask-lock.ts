import sharp from "sharp";

const clampChannel = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

/** 保留原图亮度结构和边线，仅从模型结果迁移色彩信息，供 0% 重构使用。 */
export async function lockGeometryWithGeneratedColor(original: Buffer, generated: Buffer, preserveGeneratedAlpha = false): Promise<Buffer> {
  const originalImage = sharp(original).removeAlpha();
  const meta = await originalImage.metadata();
  if (!meta.width || !meta.height) throw new Error("无法读取原图尺寸");
  const { width, height } = meta;
  const originalRaw = await originalImage.raw().toBuffer();
  const generatedRaw = await (preserveGeneratedAlpha
    ? sharp(generated).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer()
    : sharp(generated).resize(width, height, { fit: "fill" }).removeAlpha().raw().toBuffer());
  const channels = preserveGeneratedAlpha ? 4 : 3;
  const output = Buffer.alloc(width * height * channels);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const originalOffset = pixel * 3;
    const generatedOffset = pixel * channels;
    const originalLuma = originalRaw[originalOffset] * 0.299 + originalRaw[originalOffset + 1] * 0.587 + originalRaw[originalOffset + 2] * 0.114;
    const generatedLuma = generatedRaw[generatedOffset] * 0.299 + generatedRaw[generatedOffset + 1] * 0.587 + generatedRaw[generatedOffset + 2] * 0.114;
    output[generatedOffset] = clampChannel(originalLuma + (generatedRaw[generatedOffset] - generatedLuma));
    output[generatedOffset + 1] = clampChannel(originalLuma + (generatedRaw[generatedOffset + 1] - generatedLuma));
    output[generatedOffset + 2] = clampChannel(originalLuma + (generatedRaw[generatedOffset + 2] - generatedLuma));
    if (preserveGeneratedAlpha) output[generatedOffset + 3] = generatedRaw[generatedOffset + 3];
  }
  return sharp(output, { raw: { width, height, channels } }).png().toBuffer();
}
