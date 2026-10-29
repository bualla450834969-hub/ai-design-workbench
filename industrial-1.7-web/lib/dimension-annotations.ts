export type ProductDimensions = { width: string; depth: string; height: string; unit: "mm" | "cm" };

/** Parse a complete user-supplied size; incomplete dimensions are not treated as measured. */
export function parseProductDimensions(text: string): ProductDimensions | null {
  const match = text.match(/宽(?:度)?\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|毫米|厘米)?\s*[×xX*、，,;；\s]+深(?:度)?\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|毫米|厘米)?\s*[×xX*、，,;；\s]+高(?:度)?\s*[:：=]?\s*(\d+(?:\.\d+)?)\s*(mm|cm|毫米|厘米)?/i);
  if (!match) return null;
  const unit = (value?: string) => value === "厘米" ? "cm" : value === "毫米" ? "mm" : value?.toLowerCase();
  const units = [unit(match[2]), unit(match[4]), unit(match[6])].filter(Boolean);
  if (!units.length || new Set(units).size !== 1) return null;
  if ([match[1], match[3], match[5]].some((value) => !Number.isFinite(Number(value)) || Number(value) <= 0)) return null;
  return { width: match[1], depth: match[3], height: match[5], unit: units[0] as "mm" | "cm" };
}

export type SixViewDimensionOptions = { showDimensions?: boolean; category?: string };

/** Used only when a clean six-view sheet must omit explicit measurement requests. */
export function containsDimensionInstruction(clause: string) {
  return /尺寸|实测|(?:宽|深|高)(?:度)?\s*[:：=]?\s*\d+(?:\.\d+)?\s*(?:mm|cm|毫米|厘米)?|\d+(?:\.\d+)?\s*(?:mm|cm|毫米|厘米)/i.test(clause);
}

/** Category scale is a design reference, not a measurement extracted from photo pixels. */
export function categoryReferenceDimensions(category: string): ProductDimensions | null {
  const label = category.toLowerCase();
  const known: Array<[RegExp, [string, string, string]]> = [
    [/打窝船|投饵船|饵料船|遥控船|bait\s*boat/, ["320", "680", "230"]],
    [/摩托车.*尾灯|电动车.*尾灯|尾灯/, ["220", "105", "85"]],
    [/手电钻|电钻/, ["80", "220", "235"]],
    [/水龙头/, ["55", "190", "260"]],
    [/头灯|前照灯/, ["170", "120", "105"]],
    [/玩具跑道|轨道玩具|赛车轨道|太空轨道/, ["450", "600", "180"]],
    [/礼盒|包装盒|纸盒/, ["300", "200", "120"]],
    [/手电筒/, ["45", "160", "45"]],
    [/蓝牙音箱|便携音箱/, ["210", "85", "95"]],
    [/电动牙刷/, ["32", "32", "230"]],
  ];
  const match = known.find(([pattern]) => pattern.test(label));
  return match ? { width: match[1][0], depth: match[1][1], height: match[1][2], unit: "mm" } : null;
}

/** The source fixes geometry and color; orthographic projection only changes the camera. */
export function sixViewSourceFidelityContract() {
  return "主产品原图是唯一形态与颜色基准。先锁定原产品外轮廓、真实长宽高相对比例、结构拓扑、分件边界、关键部件的数量与位置、色块分布、主色相与材质，再投影到六个相机方向。绝不把主体横向拉长或纵向压扁，不按通用品类重新造型，不增删原有部件，也不改动原图主色相和色块位置。正交投影允许透视外观变化，但同一产品的物理宽、深、高比例和颜色在六格必须一致；正后宽度一致、左右长度一致、俯底外轮廓互相对应。只对原图确实看不到的面做最保守补全，不臆造复杂机械结构。";
}

/** One axis receives one numeric label across the board. */
export function sixViewDimensionContract(content: string, options: SixViewDimensionOptions = {}) {
  if (options.showDimensions === false) return "本轮选择不加尺寸：六格只写视角名称，不绘制任何尺寸线、箭头、比例尺、数字尺寸或测量占位文字；为后续建模保留干净轮廓。";
  const measured = parseProductDimensions(content);
  const size = measured || categoryReferenceDimensions(`${options.category || ""} ${content}`);
  const toMillimeters = (value: string) => Number(value) * (size?.unit === "cm" ? 10 : 1);
  const labels = measured
    ? `用户给出的宽×深×高换算为毫米后是 ${toMillimeters(size!.width)}×${toMillimeters(size!.depth)}×${toMillimeters(size!.height)} mm。正视与后视标宽 ${toMillimeters(size!.width)} mm、高 ${toMillimeters(size!.height)} mm；左视与右视标深 ${toMillimeters(size!.depth)} mm、高 ${toMillimeters(size!.height)} mm；俯视与底视标宽 ${toMillimeters(size!.width)} mm、深 ${toMillimeters(size!.depth)} mm。若输入数字与原图视觉比例冲突，不得拉伸或重新设计产品来迎合数字，保留原图形态供用户复核。`
    : size
      ? `以“${options.category || "当前产品"}”的品类常见实体尺度作为参考起点，建议宽×深×高为 ${size.width}×${size.depth}×${size.height} mm。正视与后视标宽 ${size.width} mm、高 ${size.height} mm；左视与右视标深 ${size.depth} mm、高 ${size.height} mm；俯视与底视标宽 ${size.width} mm、深 ${size.depth} mm。先观察原图的长宽高相对比例，若建议值与原图比例明显冲突，应按原图比例调整三个数字并保证六格一致，绝不可拉长、压扁或改色产品来迎合建议值。这些是估计值，不冒充测量结果。`
      : `识别“${options.category || "产品原图对应的品类"}”与原图相对比例，选取该品类合理的一组圆整的宽×深×高毫米估计数值，并把实际数字写进图中。正视与后视均标相同的宽、高数字；左视与右视均标相同的深、高数字；俯视与底视均标相同的宽、深数字。三个轴的数字必须与原图外形比例基本一致，不能为了迎合数字拉伸或改色产品，也不能把照片像素冒充测量结果。`;
  return `本轮选择加尺寸：六视图须以正投影风格绘制整齐的尺寸界线、箭头和数字尺寸，所有尺寸单位统一为 mm；正/后为宽×高，左/右为深×高，俯/底为宽×深。${labels}每条主要尺寸线旁都必须有可读的毫米数字，不得留空或以文字占位。只在整版顶部写一次“仅供参考”；尺寸线放在各格产品外侧，不遮挡结构；除此之外图片内只有角度名称、尺寸线及数字尺寸，不添加品牌或水印。量产尺寸和公差仍须实物或 CAD 校核。`;
}
