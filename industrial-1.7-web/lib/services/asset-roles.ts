import type { Asset, AssetRole } from "@/types/domain";

const rolePriority: Record<AssetRole, number> = {
  structure: 0,
  result: 0,
  style: 1,
  scene: 2,
  annotation: 3,
  mask: 3,
  brief: 4,
};

export function assetRoleLabel(role: AssetRole) {
  if (role === "structure" || role === "result") return "产品原图（决定品类、结构、功能与比例）";
  if (role === "style") return "设计参考图（只提供造型语言、配色、材质或风格）";
  if (role === "scene") return "场景参考图（只提供环境、构图与光线）";
  if (role === "annotation") return "局部修改标注图（方框、圆框、箭头、线条和文字用于说明要修改的位置，标记本身不得出现在结果图）";
  if (role === "mask") return "旧版局部蒙版（仅兼容历史项目）";
  return "需求资料（只提供项目事实）";
}

export function sortAssetsByRole(assets: Asset[], requestedIds: string[] = []) {
  const requestedOrder = new Map(requestedIds.map((id, index) => [id, index]));
  return [...assets].sort((left, right) => {
    const roleDifference = rolePriority[left.role] - rolePriority[right.role];
    if (roleDifference) return roleDifference;
    return (requestedOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (requestedOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER);
  });
}
