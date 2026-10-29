import type { Metadata } from "sharp";

// Large presentation boards are common design inputs. Keep a finite decode
// limit while allowing a 107-megapixel board to be safely reduced for the API.
export const MAX_ASSET_IMAGE_PIXELS = 160_000_000;
export const MAX_PROVIDER_IMAGE_EDGE = 4096;
export const MAX_PROVIDER_IMAGE_BYTES = 8 * 1024 * 1024;

export function orientedImageDimensions(metadata: Pick<Metadata, "width" | "height" | "orientation">) {
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  return [5, 6, 7, 8].includes(metadata.orientation || 0)
    ? { width: height, height: width }
    : { width, height };
}
