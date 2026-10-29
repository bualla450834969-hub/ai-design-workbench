export const BOARD_ITEM_OPTIONS = [1, 4, 9] as const;

export type BoardItemCount = (typeof BOARD_ITEM_OPTIONS)[number];
export type BoardKind = "variants" | "cmf" | "local" | "scene";

const LEGACY_BOARD_ITEM_MIGRATIONS = new Map<number, BoardItemCount>([[3, 4], [6, 9]]);

const BOARD_LAYOUTS: Record<BoardItemCount, { rows: number; columns: number; label: string }> = {
  1: { rows: 1, columns: 1, label: "单方案" },
  4: { rows: 2, columns: 2, label: "2×2 四宫格" },
  9: { rows: 3, columns: 3, label: "3×3 九宫格" },
};

/**
 * Older project drafts offered 3- and 6-item boards.  Keep those drafts usable
 * by moving them to the next complete square grid instead of silently falling
 * back to a single concept.
 */
export function migrateLegacyBoardItemCount(value: unknown): unknown {
  const numeric = typeof value === "number" ? value : Number(value);
  return LEGACY_BOARD_ITEM_MIGRATIONS.get(numeric) ?? value;
}

/** Returns a canonical count when the input is supported (including legacy 3/6). */
export function canonicalBoardItemCount(value: unknown): BoardItemCount | undefined {
  const migrated = migrateLegacyBoardItemCount(value);
  const numeric = typeof migrated === "number" ? migrated : Number(migrated);
  return BOARD_ITEM_OPTIONS.includes(numeric as BoardItemCount) ? numeric as BoardItemCount : undefined;
}

export function normalizeBoardItemCount(value: unknown): BoardItemCount {
  return canonicalBoardItemCount(value) ?? 1;
}

export function normalizeNaturalBoardItemCount(value: unknown): BoardItemCount {
  return normalizeBoardItemCount(value);
}

export function boardLayout(value: unknown) {
  const count = normalizeBoardItemCount(value);
  const fixed = BOARD_LAYOUTS[count];
  return { ...fixed, rowCounts: Array.from({ length: fixed.rows }, () => fixed.columns) };
}

export function boardLayoutLabel(value: unknown) {
  return boardLayout(value).label;
}

/**
 * Shared hard constraint for every provider call that packs several concepts into one paid image.
 * The caller adds task-specific geometry or CMF rules around this common layout contract.
 */
export function boardPrompt(value: unknown, kind: BoardKind = "variants") {
  const count = normalizeNaturalBoardItemCount(value);
  if (count === 1) return "";
  const layout = boardLayout(count);
  const subject = kind === "cmf" ? "配色与材质方案"
    : kind === "local" ? "局部改款方案"
      : kind === "scene" ? "场景呈现方案"
        : "完整外观方案";
  const visualConsistency = kind === "scene"
    ? "所有网格使用统一画幅、统一观察角度、统一产品比例和整齐留白，产品本体必须一致，场景环境允许不同"
    : "所有网格使用统一画幅、统一背景、统一光线、统一观察角度、统一主体比例和整齐留白";
  const axes = kind === "cmf"
    ? ["主辅色比例", "色相与明度关系", "材质组合", "CMF 分区边界", "纹理尺度与方向", "光泽层级", "强调色位置", "冷暖倾向", "表面工艺"]
    : kind === "local"
      ? ["局部外轮廓", "局部尺寸比例", "边界与倒角", "凸出或嵌入关系", "开孔与负形", "触控或握持关系", "加强结构语言", "局部材质分区", "特征线连续性"]
      : kind === "scene"
        ? ["使用环境", "光照时段", "人物交互", "空间尺度", "环境材质", "氛围色温", "前后景层次", "使用情境", "陈列方式"]
        : ["整体长宽高比例", "外轮廓与视觉重心", "主次体块关系", "功能区布局", "分件与装配逻辑", "开孔与负形", "人机交互方式", "结构特征语言", "连续特征面"];
  const routeMatrix = Array.from({ length: count }, (_, index) => {
    const primary = axes[index % axes.length];
    const secondary = axes[(index + 4 + Math.floor(index / axes.length)) % axes.length];
    return `第${index + 1}格重点联合改变${primary}与${secondary}`;
  }).join("；");
  const rowRule = layout.rowCounts.join("+");
  return `本张图片必须且只能包含 ${count} 个${subject}，严格采用 ${layout.label}（自上而下每行格数为 ${rowRule}，合计必须正好为 ${count}）等尺寸分区排列。每个分区只放一个完整、清晰、无遮挡的方案，${visualConsistency}；不得缺少、合并、重叠、留空、凑数或重复方案，不得生成分区之外的额外产品。每一格都要独立保留相同的品类和已确认的关键结构，不得把其他品类或参考产品混入。以下序号只用于模型内部规划，严禁画进图片：${routeMatrix}。相邻方案必须至少在两个允许变化的维度上一眼可辨，生成前逐格自检数量、差异、品类和关键结构；若有近似重复或结构漂移，先在本次生成内部改写该格方案再输出。不得添加编号、标题、说明文字、标签、边框或水印。`;
}
