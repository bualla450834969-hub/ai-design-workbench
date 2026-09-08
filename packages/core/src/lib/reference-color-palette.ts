import sharp from "sharp";

export type ReferenceColorPalette = {
  dataUrl: string;
  colors: string[];
  weights: number[];
};

type SampledColor = {
  red: number;
  green: number;
  blue: number;
  count: number;
};

function decodeImageDataUrl(input: string) {
  const match = input.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,([\s\S]+)$/);
  if (!match) throw new Error("Color reference must be a data image");
  return Buffer.from(match[1], "base64");
}

function parseGuideHexColors(guide: string) {
  const matches = guide.match(/#[0-9a-f]{6}\b/gi) || [];
  return Array.from(new Set(matches.map((color) => color.toUpperCase())));
}

function rgbToHex({ red, green, blue }: SampledColor) {
  return `#${[red, green, blue]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function rgbSaturation({ red, green, blue }: SampledColor) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  return max <= 0 ? 0 : (max - min) / max;
}

function rgbToLab({ red, green, blue }: SampledColor) {
  const linearize = (value: number) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const r = linearize(red);
  const g = linearize(green);
  const b = linearize(blue);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const pivot = (value: number) => value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116;
  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)] as const;
}

function perceptualDistance(left: SampledColor, right: SampledColor) {
  const a = rgbToLab(left);
  const b = rgbToLab(right);
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

function mergePerceptuallySimilarColors(colors: SampledColor[]) {
  const clusters: SampledColor[] = [];
  for (const color of [...colors].sort((left, right) => right.count - left.count)) {
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    clusters.forEach((cluster, index) => {
      const distance = perceptualDistance(color, cluster);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    if (nearestIndex < 0 || nearestDistance > 16) {
      clusters.push({ ...color });
      continue;
    }
    const cluster = clusters[nearestIndex];
    const total = cluster.count + color.count;
    cluster.red = (cluster.red * cluster.count + color.red * color.count) / total;
    cluster.green = (cluster.green * cluster.count + color.green * color.count) / total;
    cluster.blue = (cluster.blue * cluster.count + color.blue * color.count) / total;
    cluster.count = total;
  }
  return clusters;
}

async function sampleReferenceColors(referenceImage: string) {
  const { data, info } = await sharp(decodeImageDataUrl(referenceImage))
    .rotate()
    .resize(180, 180, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number }>();
  const channels = Math.max(info.channels, 3);
  for (let offset = 0; offset + 2 < data.length; offset += channels * 2) {
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    // Ignore only near-white photographic backgrounds. Neutral product colors remain valid.
    if (min > 242 && max - min < 10) continue;
    const key = `${Math.round(red / 24)}-${Math.round(green / 24)}-${Math.round(blue / 24)}`;
    const current = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
    current.count += 1;
    current.red += red;
    current.green += green;
    current.blue += blue;
    buckets.set(key, current);
  }
  const totalCount = Array.from(buckets.values()).reduce((sum, bucket) => sum + bucket.count, 0);
  const clustered = mergePerceptuallySimilarColors(
    Array.from(buckets.values()).map((bucket) => ({
      red: bucket.red / bucket.count,
      green: bucket.green / bucket.count,
      blue: bucket.blue / bucket.count,
      count: bucket.count
    }))
  ).filter((color) => color.count >= Math.max(4, totalCount * 0.003));
  return clustered
    .sort((left, right) => {
      const leftImportance = left.count * (1 + rgbSaturation(left) * 2.5);
      const rightImportance = right.count * (1 + rgbSaturation(right) * 2.5);
      return rightImportance - leftImportance;
    })
    .slice(0, 5)
    .sort((left, right) => right.count - left.count);
}

export async function buildReferenceColorPalette(
  referenceImages: string[],
  guide = ""
): Promise<ReferenceColorPalette | null> {
  const sampledByReference = await Promise.all(
    referenceImages.map((image) => sampleReferenceColors(image).catch(() => []))
  );
  const guideColors = parseGuideHexColors(guide);
  const sampledColors = mergePerceptuallySimilarColors(sampledByReference.flatMap((colors) => colors));
  const sampledTotal = sampledColors.reduce((sum, color) => sum + color.count, 0);
  const sampledHexColors = sampledColors.map(rgbToHex);
  const colors = Array.from(new Set([...guideColors, ...sampledHexColors])).slice(0, 8);
  if (!colors.length) return null;

  const rawWeights = colors.map((color) => {
    const sampledIndex = sampledHexColors.indexOf(color);
    return sampledIndex >= 0 && sampledTotal > 0 ? sampledColors[sampledIndex].count / sampledTotal : 1 / colors.length;
  });
  const weightTotal = rawWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  const weights = rawWeights.map((weight) => weight / weightTotal);

  const width = 960;
  const height = 192;
  let usedWidth = 0;
  const swatch = await sharp({
    create: { width, height, channels: 3, background: "#ffffff" }
  })
    .composite(
      colors.map((color, index) => {
        const remaining = width - usedWidth;
        const bandWidth = index === colors.length - 1
          ? remaining
          : Math.max(1, Math.min(remaining, Math.round(width * weights[index])));
        const left = usedWidth;
        usedWidth += bandWidth;
        return {
          input: { create: { width: bandWidth, height, channels: 3, background: color } },
          left,
          top: 0
        };
      })
    )
    .png()
    .toBuffer();

  return {
    dataUrl: `data:image/png;base64,${swatch.toString("base64")}`,
    colors,
    weights
  };
}
