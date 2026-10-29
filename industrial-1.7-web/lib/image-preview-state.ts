export type ImagePreviewView = { scale: number; x: number; y: number };
export type ImagePreviewBounds = { viewportWidth: number; viewportHeight: number; imageWidth: number; imageHeight: number };

export const IMAGE_PREVIEW_MIN_SCALE = 1;
export const IMAGE_PREVIEW_MAX_SCALE = 6;
export const IMAGE_PREVIEW_CLICK_STEP = 1.5;

export function clampImagePreviewScale(scale: number) {
  return Math.max(IMAGE_PREVIEW_MIN_SCALE, Math.min(IMAGE_PREVIEW_MAX_SCALE, scale));
}

export function imagePreviewScaleFromWheel(scale: number, deltaY: number) {
  return clampImagePreviewScale(scale * Math.exp(-deltaY * 0.0015));
}

export function nextImagePreviewClickScale(scale: number) {
  return clampImagePreviewScale(scale * IMAGE_PREVIEW_CLICK_STEP);
}

export function zoomImagePreviewAt(current: ImagePreviewView, nextScale: number, focalX: number, focalY: number): ImagePreviewView {
  const scale = clampImagePreviewScale(nextScale);
  if (scale === IMAGE_PREVIEW_MIN_SCALE) return { scale, x: 0, y: 0 };
  if (scale === current.scale) return current;
  const ratio = scale / current.scale;
  return {
    scale,
    x: focalX - (focalX - current.x) * ratio,
    y: focalY - (focalY - current.y) * ratio,
  };
}

export function clampImagePreviewView(current: ImagePreviewView, bounds: ImagePreviewBounds): ImagePreviewView {
  const scale = clampImagePreviewScale(current.scale);
  if (scale === IMAGE_PREVIEW_MIN_SCALE) return { scale, x: 0, y: 0 };
  const viewportWidth = Math.max(0, bounds.viewportWidth);
  const viewportHeight = Math.max(0, bounds.viewportHeight);
  const imageWidth = Math.max(0, bounds.imageWidth);
  const imageHeight = Math.max(0, bounds.imageHeight);
  const maxX = Math.max(0, (imageWidth * scale - viewportWidth) / 2);
  const maxY = Math.max(0, (imageHeight * scale - viewportHeight) / 2);
  return {
    scale,
    x: Math.max(-maxX, Math.min(maxX, current.x)),
    y: Math.max(-maxY, Math.min(maxY, current.y)),
  };
}
