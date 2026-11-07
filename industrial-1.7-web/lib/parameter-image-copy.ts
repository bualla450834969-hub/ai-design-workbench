import type { Asset } from "@/types/domain";

export const PARAMETER_IMAGE_DRAG_TYPE = "application/x-idai-parameter-image-id";
export type ParameterImageCopyRole = "structure" | "style";
export type ParameterImageCopyContext = {
  projectId: string;
  assets: readonly Asset[];
  selectedIds: readonly string[];
  localEdit?: boolean;
  maxImageBytes?: number;
};

const product = (asset: Asset) => asset.type.startsWith("image/") && (asset.role === "structure" || asset.role === "result");
export function parameterImageHasRole(asset: Asset, role: ParameterImageCopyRole) {
  return role === "structure" ? product(asset) : asset.role === "style";
}

/** A copy appends a new role-specific asset; it never changes the source role or primary order. */
export function parameterImageCopyIssue(asset: Asset, role: ParameterImageCopyRole, context: ParameterImageCopyContext) {
  const current = context.assets.find((item) => item.id === asset.id && item.projectId === context.projectId);
  if (!context.projectId || asset.projectId !== context.projectId || !current
    || !context.selectedIds.includes(asset.id)) return "待复制图片已不在当前项目选用区，请重新拖拽。";
  if (!asset.type.startsWith("image/") || !["structure", "style", "result"].includes(asset.role)) return "只能复制产品原图或设计参考图，标注图和资料不能作为原图复制。";
  if (current.role !== asset.role) return "图片角色已改变，请重新拖拽。";
  if (parameterImageHasRole(asset, role)) return "";
  if (context.selectedIds.length >= 9) return "每次生成最多选用 9 张图片，请先取消选用一张再复制。";
  const selected = new Set(context.selectedIds);
  const productCount = context.assets.filter((item) => selected.has(item.id) && product(item)).length;
  if (role === "structure" && productCount >= (context.localEdit ? 1 : 4)) {
    return context.localEdit ? "局部改款只能使用一张产品原图，请先取消当前原图再复制。" : "产品原图最多选用 4 张，请先取消选用一张原图再复制。";
  }
  return "";
}

export async function copyParameterImage(
  asset: Asset,
  role: ParameterImageCopyRole,
  dependencies: {
    context: () => ParameterImageCopyContext;
    read: (asset: Asset) => Promise<Blob>;
    upload: (file: File, role: ParameterImageCopyRole) => Promise<Asset | undefined>;
  },
) {
  const check = () => {
    const issue = parameterImageCopyIssue(asset, role, dependencies.context());
    if (issue) throw new Error(issue);
  };
  check();
  if (parameterImageHasRole(asset, role)) return asset;
  const bytes = await dependencies.read(asset);
  check();
  const type = bytes.type || asset.type;
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)) throw new Error("这张图片暂不支持拖拽复制，请使用 JPG、PNG 或 WebP 图片。");
  if (!bytes.size || bytes.size > (dependencies.context().maxImageBytes || 20 * 1024 * 1024)) throw new Error("待复制图片为空或超过上传大小限制，请压缩后重新添加。");
  // Only the pixels and filename cross the role boundary. Tags, annotations,
  // notes and result metadata belong to the original and are never inherited.
  const copied = await dependencies.upload(new File([bytes], asset.name, { type }), role);
  if (!copied) throw new Error("图片复制未完成，请稍后重试。");
  if (copied.id === asset.id || copied.projectId !== asset.projectId || copied.role !== role) throw new Error("未收到独立的图片副本，请刷新项目后重试。");
  return copied;
}
