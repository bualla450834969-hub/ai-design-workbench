const MAX_ANNOTATION_BYTES = 20 * 1024 * 1024;

export const ANNOTATION_STROKE_MIN = 1;
export const ANNOTATION_STROKE_DEFAULT = 12;
export const ANNOTATION_STROKE_MAX = 24;

// The slider describes a visual size. Store canvas pixels so images with different
// source resolutions produce the same apparent stroke width in the editor.
export function annotationCanvasStrokeSize(value: number, canvasWidth: number, displayWidth: number) {
  return value * 0.64 * canvasWidth / Math.max(1, displayWidth);
}

function encode(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片导出失败，请重试。")), type, quality);
  });
}

export async function exportAnnotationImage(canvas: HTMLCanvasElement, sourceType: string) {
  if (sourceType === "image/png") {
    const png = await encode(canvas, "image/png");
    if (png.size <= MAX_ANNOTATION_BYTES) return { blob: png, type: "image/png", extension: "png" };
  }

  // JPG sources often inflate substantially when re-encoded as PNG. White is
  // intentional for transparent PNG fallbacks, instead of a black matte.
  let output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;
  let context = output.getContext("2d");
  if (!context) throw new Error("无法处理标注图片，请重试。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(canvas, 0, 0);

  for (const quality of [0.92, 0.85, 0.76]) {
    const blob = await encode(output, "image/jpeg", quality);
    if (blob.size <= MAX_ANNOTATION_BYTES) return { blob, type: "image/jpeg", extension: "jpg" };
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const resized = document.createElement("canvas");
    resized.width = Math.max(1, Math.round(output.width * 0.85));
    resized.height = Math.max(1, Math.round(output.height * 0.85));
    context = resized.getContext("2d");
    if (!context) throw new Error("无法处理标注图片，请重试。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, resized.width, resized.height);
    context.drawImage(output, 0, 0, resized.width, resized.height);
    output.width = 0;
    output.height = 0;
    output = resized;
    const blob = await encode(output, "image/jpeg", 0.82);
    if (blob.size <= MAX_ANNOTATION_BYTES) return { blob, type: "image/jpeg", extension: "jpg" };
  }
  throw new Error("标注图片仍超过 20 MB，请使用较小的原图后重试。");
}
