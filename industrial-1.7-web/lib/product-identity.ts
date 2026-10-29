import type { DesignPlan } from "@/lib/providers/types";

const IDENTITY_FEATURES = {
  wheel: { label: "轮子与轮组", pattern: /车轮|轮子|轮组|前轮|后轮|三轮|四轮|轮距/ },
  doorsWindows: { label: "门窗", pattern: /门窗|车门|车窗|窗户|侧门|(?:单|双|两|二|三|四|五|六|七|八|九|\d+)(?:扇)?门/ },
  seat: { label: "座椅", pattern: /座椅|座位|坐垫|乘员座|(?:单|双|两|二|三|四|五|六|七|八|九|\d+)人?座/ },
  handle: { label: "把手", pattern: /把手|车把|手柄|握把/ },
  opening: { label: "开口", pattern: /开口|开孔|孔位|进风口|出风口/ },
  hatch: { label: "舱门", pattern: /舱门|仓门|检修门/ },
  workHead: { label: "工作头", pattern: /工作头|刀头|刷头|吸头|执行头/ },
  support: { label: "支撑点", pattern: /支撑点|支架|支腿|支撑结构/ },
  foot: { label: "足与机脚", pattern: /机脚|底脚|支脚|脚垫|足部/ },
  screen: { label: "屏幕", pattern: /屏幕|显示屏|显示器/ },
  port: { label: "接口", pattern: /接口|插口|端口/ },
} as const;

type IdentityFeature = keyof typeof IDENTITY_FEATURES;

const CHANGE_VERB = /改成|变成|调整为|更改为|转换为|增加|新增|添加|减少|删去|删除|移除|去掉|拆除|取消|改为|换成|替换为|扩大|缩小|移动|重新设计|重做|改动|修改|调整|改/;
const NEGATION = /(?:不(?:要|得|能|准|允许)?|禁止|严禁|别|无需|保持不变|维持不变)/;

/** Migrate only text with the exact signatures emitted by older app versions. */
export function stripGeneratedPromptBoilerplate(value: string) {
  return value
    .replace(/品类与关键结构约束：用户本轮明确要求的结构变化具有最高优先级；[\s\S]*?禁止生成四轮、少轮、重复轮、隐藏轮或把多个轮合并成一个。/g, "")
    .replace(/界面输出硬参数：共输出\d+张图片，每张图片包含\d+个方案。/g, "")
    .replace(/品类核对（仅内部执行，不复制到整理文案）：[^\n]*?(?:每一格都要独立保留相同的品类和已确认的关键结构。|最终方案必须满足已确认的产品定义。)(?:目标为三轮车：每个子方案的实际结构必须恰好3个车轮并保持原始前后轮组布局，不得增轮、少轮、重轮或合并轮；允许正常透视遮挡，不得为了同时露出3轮而增加车轮或改变视角。)?/g, "")
    .replace(/(?:三轮车逐格硬约束：\d+个子方案中的每一格都必须|三轮车硬约束：结果必须)恰好3轮并保持原始前后轮组布局，不得有?任?一?格?变成四轮、少轮、重复轮、隐藏轮或合并轮。/g, "")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type ProductIdentityContext = { productCategory?: string; hasProductImage?: boolean };

function targetIsTricycle(category: string, userRequirements: string) {
  const pattern = /三轮(?:车|车辆|底盘)|3\s*轮(?:车|车辆|底盘)/;
  if (category && !/待|由本轮|依据/.test(category)) return pattern.test(category);
  return stripGeneratedPromptBoilerplate(userRequirements).split(/[，,。；;\n]/)
    .some((clause) => pattern.test(clause) && !/参考|例如|比如|若目标产品|不要(?:设计|生成|变成)/.test(clause));
}

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

/** A feature is unlocked only by a positive instruction in the same clause. */
function explicitlyChangesFeature(userRequirements: string, feature: IdentityFeature) {
  const definition = IDENTITY_FEATURES[feature];
  const clauses = compact(userRequirements).split(/[，,。；;！？!?\n]+/).filter(Boolean);
  return clauses.some((clause) => {
    // A category name next to “改款/修改造型” is not permission to change its wheel count.
    const featureClause = feature === "wheel"
      ? clause.replace(/(?:三|四|3|4)轮车/g, (category, offset: number) => {
        const before = clause.slice(Math.max(0, offset - 5), offset);
        const after = clause.slice(offset + category.length, offset + category.length + 9);
        return /(?:改成|变成|改为|换成|转换为)$/.test(before) || /^(?:改成|变成|改为|换成|转换为).{0,3}(?:三|四|3|4)轮/.test(after) ? category : "目标产品";
      })
      : clause;
    if (!definition.pattern.test(featureClause) || !CHANGE_VERB.test(featureClause)) return false;
    for (const match of featureClause.matchAll(new RegExp(CHANGE_VERB.source, "g"))) {
      const verbIndex = match.index ?? 0;
      const nearbyBefore = featureClause.slice(Math.max(0, verbIndex - 12), verbIndex);
      const nearbyAfter = featureClause.slice(verbIndex + match[0].length, verbIndex + match[0].length + 18);
      if (NEGATION.test(nearbyBefore)) continue;
      if (definition.pattern.test(nearbyBefore) || definition.pattern.test(nearbyAfter)) return true;
    }
    return false;
  });
}

export function explicitlyChangedIdentityFeatures(userRequirements: string): IdentityFeature[] {
  userRequirements = stripGeneratedPromptBoilerplate(userRequirements);
  return (Object.keys(IDENTITY_FEATURES) as IdentityFeature[])
    .filter((feature) => explicitlyChangesFeature(userRequirements, feature));
}

export function explicitlyChangesWheelTopology(userRequirements: string) {
  return explicitlyChangesFeature(stripGeneratedPromptBoilerplate(userRequirements), "wheel");
}

export function productIdentityContract(boardItems = 1, userRequirements = "", context: ProductIdentityContext = {}) {
  userRequirements = stripGeneratedPromptBoilerplate(userRequirements);
  const unlocked = new Set(explicitlyChangedIdentityFeatures(userRequirements));
  const definitions = Object.entries(IDENTITY_FEATURES) as Array<[IdentityFeature, (typeof IDENTITY_FEATURES)[IdentityFeature]]>;
  const unlockedLabels = definitions.filter(([feature]) => unlocked.has(feature)).map(([, definition]) => definition.label);
  const perScheme = boardItems > 1
    ? "每一格都要独立保留相同的品类和已确认的关键结构。"
    : "最终方案必须满足已确认的产品定义。";
  const unlockRule = unlockedLabels.length
    ? `本轮只解除用户明确点名的${unlockedLabels.join("、")}约束；这些项目按用户要求改变，不能连带解除其他结构。`
    : "用户明确要求的结构变化优先，其余已确认结构保持一致。";
  const evidence = context.hasProductImage === false
    ? "仅以本轮目标品类和用户明确要求确定结构；风格参考不提供部件数量或结构证据。"
    : "只约束用户明确要求及产品原图中可确认的实际结构；看不清的数量不猜测，风格参考不提供结构证据。";
  const tricycle = targetIsTricycle(context.productCategory || "", userRequirements) && !unlocked.has("wheel")
    ? "目标为三轮车：每个子方案的实际结构必须恰好3个车轮并保持原始前后轮组布局，不得增轮、少轮、重轮或合并轮；允许正常透视遮挡，不得为了同时露出3轮而增加车轮或改变视角。"
    : "";
  return ["品类核对（仅内部执行，不复制到整理文案）：", unlockRule, evidence, perScheme, tricycle].join("");
}

function mentionedFeatures(value: string) {
  return (Object.keys(IDENTITY_FEATURES) as IdentityFeature[])
    .filter((feature) => IDENTITY_FEATURES[feature].pattern.test(value));
}

/** Remove only the explicitly unlocked fragment from a compound constraint. */
function keepLockedConstraintParts(constraint: string, unlocked: Set<IdentityFeature>) {
  if (![...unlocked].some((feature) => IDENTITY_FEATURES[feature].pattern.test(constraint))) return constraint;
  const prefix = constraint.match(/^(?:必须|严格)?(?:保持|保留|维持|锁定|不得改变|禁止改变)/)?.[0] || "保持";
  const pieces = constraint.split(/(?:、|，|,|；|;|。|以及|并且|和|与|及)/).map((part) => part.trim()).filter(Boolean);
  const kept = pieces.filter((part) => {
    const features = mentionedFeatures(part);
    return !features.length || features.some((feature) => !unlocked.has(feature));
  });
  if (!kept.length) return "";
  const rebuilt = kept.join("、");
  return /^(?:必须|严格)?(?:保持|保留|维持|锁定|不得改变|禁止改变)/.test(rebuilt) ? rebuilt : `${prefix}${rebuilt}`;
}

export function enforceProductIdentityPlan(plan: DesignPlan, userRequirements: string, boardItems = 1, context: ProductIdentityContext = {}): DesignPlan {
  userRequirements = stripGeneratedPromptBoilerplate(userRequirements);
  const changedFeatures = explicitlyChangedIdentityFeatures(userRequirements);
  const unlocked = new Set(changedFeatures);
  const filtered = plan.mandatoryConstraints
    .map(stripGeneratedPromptBoilerplate)
    .filter((constraint) => !constraint.startsWith("品类核对（仅内部执行") && !constraint.startsWith("目标为三轮车：") && !constraint.startsWith("用户已明确要求改变轮数或轮组布局：") && !/^仅按用户要求调整.+，不能连带解除其他已确认的结构约束。$/.test(constraint) && constraint !== "每个子方案均须满足以上已确认的产品结构要求。")
    .map((constraint) => keepLockedConstraintParts(constraint, unlocked))
    .filter(Boolean);
  const constraints = [...filtered];
  if (changedFeatures.length) {
    const labels = changedFeatures.map((feature) => IDENTITY_FEATURES[feature].label).join("、");
    constraints.push(`仅按用户要求调整${labels}，不能连带解除其他已确认的结构约束。`);
  }

  if (targetIsTricycle(plan.productCategory, userRequirements)) {
    const tricycleRule = productIdentityContract(boardItems, userRequirements, { ...context, productCategory: plan.productCategory }).split("目标为三轮车：")[1];
    constraints.push(unlocked.has("wheel")
      ? "用户已明确要求改变轮数或轮组布局：只按用户点名的轮组变化执行，其他已确认的关键结构仍保持原产品一致。"
      : tricycleRule
        ? `目标为三轮车：${tricycleRule}`
        : ""
    );
  }
  if (boardItems > 1) constraints.push("每个子方案均须满足以上已确认的产品结构要求。");
  return {
    ...plan,
    analysisSummary: stripGeneratedPromptBoilerplate(plan.analysisSummary),
    mandatoryConstraints: [...new Set(constraints.filter(Boolean))],
  };
}
