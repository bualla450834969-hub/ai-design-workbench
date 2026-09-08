import sharp from "sharp";

export const STANDARD_SIX_VIEW_IDS = ["front", "rear", "left", "right", "top", "bottom"] as const;

export type StandardSixViewId = (typeof STANDARD_SIX_VIEW_IDS)[number];
export type SixViewCellMap = Record<StandardSixViewId, number>;

// Gemini-family image models commonly render a requested six-view board as:
// FRONT, REAR, LEFT, duplicate LEFT / RIGHT, duplicate RIGHT, TOP, BOTTOM.
// This fallback is used only when the lightweight vision layout reader is unavailable.
export const COMMON_FOUR_COLUMN_SIX_VIEW_MAP: SixViewCellMap = {
  front: 0,
  rear: 1,
  left: 2,
  right: 4,
  top: 6,
  bottom: 7
};

function boundaryScore(data: Buffer, width: number, height: number, fraction: number) {
  const center = Math.round(width * fraction);
  const searchRadius = Math.max(2, Math.round(width * 0.012));
  let best = 0;

  for (let x = Math.max(2, center - searchRadius); x <= Math.min(width - 3, center + searchRadius); x += 1) {
    let total = 0;
    let samples = 0;
    for (let y = 0; y < height; y += 2) {
      const offset = y * width + x;
      const centerValue = data[offset];
      const leftValue = data[offset - 2];
      const rightValue = data[offset + 2];
      total += Math.abs(centerValue - leftValue) + Math.abs(centerValue - rightValue);
      samples += 2;
    }
    best = Math.max(best, samples ? total / samples : 0);
  }

  return best;
}

export async function detectSixViewBoardColumns(input: Buffer): Promise<3 | 4 | 0> {
  const { data, info } = await sharp(input)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .resize({ width: 720, height: 480, fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const fourColumnScores = [0.25, 0.5, 0.75].map((fraction) => boundaryScore(data, info.width, info.height, fraction));
  const threeColumnScores = [1 / 3, 2 / 3].map((fraction) => boundaryScore(data, info.width, info.height, fraction));
  const fourColumnFloor = Math.min(...fourColumnScores);
  const threeColumnFloor = Math.min(...threeColumnScores);

  if (fourColumnFloor >= 3 && fourColumnFloor > threeColumnFloor * 1.18) return 4;
  if (threeColumnFloor >= 3 && threeColumnFloor > fourColumnFloor * 1.12) return 3;
  return 0;
}

export function isValidFourColumnSixViewMap(value: unknown): value is SixViewCellMap {
  if (!value || typeof value !== "object") return false;
  const indexes = STANDARD_SIX_VIEW_IDS.map((id) => (value as Partial<SixViewCellMap>)[id]);
  return indexes.every((index) => Number.isInteger(index) && Number(index) >= 0 && Number(index) < 8)
    && new Set(indexes).size === STANDARD_SIX_VIEW_IDS.length;
}

export async function composeStandardSixViewBoardFromFourColumns(
  input: Buffer,
  cellMap: SixViewCellMap = COMMON_FOUR_COLUMN_SIX_VIEW_MAP
) {
  if (!isValidFourColumnSixViewMap(cellMap)) throw new Error("Invalid six-view cell map");
  const metadata = await sharp(input).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (width < 256 || height < 128) throw new Error("Six-view board is too small");

  const sourceCellWidth = Math.floor(width / 4);
  const sourceCellHeight = Math.floor(height / 2);
  const squareCellSize = Math.max(sourceCellWidth, sourceCellHeight);
  const cells = await Promise.all(
    STANDARD_SIX_VIEW_IDS.map(async (viewId) => {
      const sourceIndex = cellMap[viewId];
      const column = sourceIndex % 4;
      const row = Math.floor(sourceIndex / 4);
      const cell = await sharp(input)
        .extract({
          left: column * sourceCellWidth,
          top: row * sourceCellHeight,
          width: sourceCellWidth,
          height: sourceCellHeight
        })
        .flatten({ background: "#ffffff" })
        .toBuffer();
      return sharp(cell)
        .resize({
          width: squareCellSize,
          height: squareCellSize,
          fit: "contain",
          background: "#ffffff",
          withoutEnlargement: true
        })
        .png()
        .toBuffer();
    })
  );

  return sharp({
    create: {
      width: squareCellSize * 3,
      height: squareCellSize * 2,
      channels: 3,
      background: "#ffffff"
    }
  })
    .composite(
      cells.map((cell, index) => ({
        input: cell,
        left: (index % 3) * squareCellSize,
        top: Math.floor(index / 3) * squareCellSize
      }))
    )
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
