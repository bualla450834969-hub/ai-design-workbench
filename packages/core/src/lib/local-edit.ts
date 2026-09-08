export type LocalEditIntent = "form" | "cmf" | "remove";

const REMOVE_PATTERN =
  /去掉|去除|删除|删掉|移除|拿掉|消除|擦掉|抹掉|清除|拆掉|取消这个|不要这个|不要该|不要此|不要原有|不要现有|\b(?:remove|delete|erase|eliminate|take\s+off)\b/i;
const CMF_PATTERN =
  /改色|换色|配色|颜色|色彩|色号|材质|材料|纹理|质感|表面处理|表面工艺|喷涂|喷漆|电镀|阳极|拉丝|磨砂|哑光|亮光|高光|半透明|透明材质|\b(?:recolou?r|colou?r|palette|cmf|material|finish|texture|gloss|matte|metallic|coating)\b/i;
const CMF_REMOVAL_PATTERN =
  /(?:去掉|去除|消除|取消|删除|清除)\s*(?:原有|原来|现有|当前|表面)?的?\s*(?:颜色|色彩|配色|色号|材质|材料|纹理|质感|光泽|反光|涂层|喷涂|表面工艺)|\b(?:remove|strip)\s+(?:the\s+)?(?:old\s+|existing\s+|current\s+)?(?:colou?r|material|finish|texture|coating|gloss)\b/i;
const FORM_PATTERN =
  /改造型|调整造型|改变造型|造型修改|造型优化|结构修改|结构调整|形态修改|形态调整|轮廓修改|轮廓调整|\b(?:reshape|restyle|redesign|change\s+(?:the\s+)?shape|change\s+(?:the\s+)?form)\b/i;
const NEGATED_REMOVE_PATTERN =
  /不(?:要|得|可|能|应)?\s*(?:去掉|去除|删除|删掉|移除|拿掉|消除|擦掉|抹掉|清除|拆掉)|\b(?:do\s+not|don't|must\s+not|never)\s+(?:remove|delete|erase|eliminate|take\s+off)\b/i;

function withoutNegatedRemoval(text: string) {
  return text
    .replace(/不(?:要|得|可|能|应)?\s*(?:去掉|去除|删除|删掉|移除|拿掉|消除|擦掉|抹掉|清除|拆掉)[^，。；;\n]*/gi, "")
    .replace(/\b(?:do\s+not|don't|must\s+not|never)\s+(?:remove|delete|erase|eliminate|take\s+off)\b[^,.;\n]*/gi, "");
}

function withoutNegatedCmf(text: string) {
  return text
    .replace(/不(?:要|得|可|能|应)?\s*(?:改|换|调整|改变)?\s*(?:颜色|色彩|配色|材质|材料|纹理|质感|表面处理|表面工艺)[^，。；;\n]*/gi, "")
    .replace(/\b(?:do\s+not|don't|must\s+not|never)\s+(?:recolou?r|change\s+(?:the\s+)?colou?r|change\s+(?:the\s+)?material)[^,.;\n]*/gi, "");
}

export function inferLocalEditIntent(text?: string, fallback: LocalEditIntent = "form"): LocalEditIntent {
  const value = String(text || "").trim();
  if (!value) return fallback;
  if (CMF_REMOVAL_PATTERN.test(value)) return "cmf";
  if (REMOVE_PATTERN.test(withoutNegatedRemoval(value))) return "remove";
  if (CMF_PATTERN.test(withoutNegatedCmf(value))) return "cmf";
  if (FORM_PATTERN.test(value) || NEGATED_REMOVE_PATTERN.test(value)) return "form";
  return fallback;
}

export function normalizeLocalEditIntent(value?: string, instruction?: string): LocalEditIntent {
  if (value === "form" || value === "cmf" || value === "remove") {
    return value;
  }
  return inferLocalEditIntent(instruction);
}

export function localEditIntentLabel(intent: LocalEditIntent) {
  if (intent === "cmf") return "改颜色/材质";
  if (intent === "remove") return "去掉部件";
  return "改造型";
}
