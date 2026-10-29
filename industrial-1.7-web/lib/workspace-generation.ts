import type { AgentId, Asset, AssetRole, Message } from "@/types/domain";
import { appPath } from "@/lib/app-path";

type GenerationAssetSnapshot = Pick<Asset, "id" | "role" | "sha256" | "annotationData"> & { tags: string[] };

export type GenerationRetry = {
  endpoint: "/api/messages" | "/api/free-chat";
  payload: { projectId: string; content: string; assetIds: string[]; agentId?: AgentId; resolution?: "1K" | "2K" | "4K"; aspectRatio?: "auto" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16"; boardItems?: number; settings?: Record<string, string | number | boolean> };
  providerId: string;
  textModel: string;
  imageModel: string;
  assetSnapshots?: GenerationAssetSnapshot[];
};

export function retryMismatch(request: GenerationRetry, projectId: string, provider: { id: string; textModel: string; imageModel: string } | null, assets?: Asset[]) {
  if (request.payload.projectId !== projectId) return "请回到原项目后再重试。";
  if (!provider || provider.id !== request.providerId || provider.textModel !== request.textModel || provider.imageModel !== request.imageModel) return "当前供应商或模型已改变，请先恢复原供应商和模型后再重试，以免误用其他模型计费。";
  if (assets && request.assetSnapshots) {
    for (const snapshot of request.assetSnapshots) {
      const asset = assets.find((item) => item.id === snapshot.id && item.projectId === projectId);
      if (!asset) return "原任务的附件已被删除，无法按原参数重试。请重新选择附件后发起新任务。";
      if (asset.role !== snapshot.role || asset.sha256 !== snapshot.sha256 || asset.annotationData !== snapshot.annotationData || JSON.stringify([...(asset.tags || [])].sort()) !== JSON.stringify(snapshot.tags)) return "原任务附件的角色、参考标签或标注已改变，不能按原参数重试。请按当前素材重新发起任务；不会自动修改你的素材设置。";
    }
  }
  return "";
}

export function annotationSourceId(asset: Asset) {
  try {
    const source = (JSON.parse(asset.annotationData || "{}") as { sourceAssetId?: unknown }).sourceAssetId;
    return typeof source === "string" ? source : undefined;
  } catch { return undefined; }
}

export function generationAssetSnapshots(assets: Asset[], selectedIds: string[]): GenerationAssetSnapshot[] {
  const ids = new Set(selectedIds);
  for (const asset of assets) {
    if (ids.has(asset.id) && asset.role === "annotation") { const source = annotationSourceId(asset); if (source) ids.add(source); }
  }
  return assets.filter((asset) => ids.has(asset.id)).map(({ id, role, sha256, annotationData, tags }) => ({ id, role, sha256, annotationData, tags: [...(tags || [])].sort() }));
}

function isProduct(asset: Asset) { return asset.type.startsWith("image/") && (asset.role === "structure" || asset.role === "result"); }
function primaryProductId(selectedIds: string[], assets: Asset[]) { return selectedIds.find((id) => assets.some((asset) => asset.id === id && isProduct(asset))); }

export function appendFreeChatAttachment(selectedIds: string[], assetId: string) {
  if (selectedIds.includes(assetId) || selectedIds.length >= 9) return selectedIds;
  return [...selectedIds, assetId];
}

export function freeChatSelectionAfterAnnotation(selectedIds: string[], assets: Asset[], sourceId: string, annotationId: string) {
  const oldAnnotationIds = new Set(assets
    .filter((asset) => asset.role === "annotation" && annotationSourceId(asset) === sourceId)
    .map((asset) => asset.id));
  const sourceIndex = selectedIds.indexOf(sourceId);
  const oldAnnotationIndex = selectedIds.findIndex((id) => oldAnnotationIds.has(id));
  const replacementIndex = sourceIndex >= 0 ? sourceIndex : oldAnnotationIndex;
  const keptBeforeReplacement = replacementIndex < 0
    ? selectedIds.length
    : selectedIds.slice(0, replacementIndex).filter((id) => id !== sourceId && id !== annotationId && !oldAnnotationIds.has(id)).length;
  const next = selectedIds.filter((id) => id !== sourceId && id !== annotationId && !oldAnnotationIds.has(id));
  next.splice(Math.min(keptBeforeReplacement, next.length), 0, annotationId);
  return next.slice(0, 9);
}

export function selectionAfterRoleChange(selectedIds: string[], assets: Asset[], assetId: string, role: AssetRole) {
  const nextAssets = assets.map((asset) => asset.id === assetId ? { ...asset, role } : asset);
  if (primaryProductId(selectedIds, assets) === primaryProductId(selectedIds, nextAssets)) return selectedIds;
  return selectedIds.filter((id) => !assets.some((asset) => asset.id === id && (asset.role === "annotation" || asset.role === "mask")));
}

export function selectionForPrimaryProduct(selectedIds: string[], assets: Asset[], assetId: string, replaceOtherProducts = false) {
  const next = [assetId, ...selectedIds.filter((id) => id !== assetId && (!replaceOtherProducts || !assets.some((asset) => asset.id === id && isProduct(asset))))].slice(0, 9);
  if (primaryProductId(selectedIds, assets) === assetId) return next;
  return next.filter((id) => !assets.some((asset) => asset.id === id && (asset.role === "annotation" || asset.role === "mask")));
}

export function localRetouchSelectionAfterAnnotation(selectedIds: string[], assets: Asset[], sourceId: string, annotationId: string) {
  const references = selectedIds.filter((id) => assets.some((asset) => asset.id === id && asset.role === "style" && asset.type.startsWith("image/")));
  return [sourceId, ...references, annotationId];
}

export function parameterSelectedAssetsForSubmission(selected: Asset[], mode: string, primaryProductId?: string) {
  return selected.filter((asset) => mode === "local"
    ? asset.id === primaryProductId || asset.role === "annotation" || (asset.role === "style" && asset.type.startsWith("image/"))
    : mode === "source"
      ? !["annotation", "mask"].includes(asset.role)
      : mode === "reference"
        ? asset.role === "style" || asset.role === "brief" || asset.role === "scene"
        : asset.role === "brief");
}

export function productRoleChangeError(asset: Asset, role: AssetRole, assets: Asset[], selectedIds: string[]) {
  if (role !== "structure" && role !== "result" || !asset.type.startsWith("image/") || !selectedIds.includes(asset.id) || isProduct(asset)) return "";
  const count = assets.filter((item) => selectedIds.includes(item.id) && isProduct(item)).length;
  return count >= 4 ? "产品原图最多选用 4 张，请先取消选用一张原图，再修改这张素材的角色。" : "";
}

export function parameterAssetError(assets: Asset[], mode: string) {
  if (assets.filter((asset) => asset.type.startsWith("image/")).length > 9) return "本轮最多选用 9 张图片（含局部标注图），请移除多余参考图；本次不会调用模型。";
  const products = assets.filter(isProduct);
  if (products.length > 4) return "产品原图最多选用 4 张，请先取消多余原图；本次不会调用模型。";
  if (mode !== "local") return "";
  if (products.length !== 1) return "局部改款需要且只能使用一张干净产品原图，请重新选择；本次不会调用模型。";
  const annotations = assets.filter((asset) => asset.role === "annotation" && asset.type.startsWith("image/"));
  if (annotations.some((asset) => !annotationSourceId(asset))) return "标注缺少对应产品信息，请在当前产品原图上重新标注；本次不会调用模型。";
  if (annotations.some((asset) => annotationSourceId(asset) !== products[0].id)) return "标注不属于当前产品原图，请在当前原图上重新标注；本次不会调用模型。";
  return "";
}

export function sixViewPrompt() {
  return "生成六视图。以附件中的产品原图为唯一产品身份依据，生成一张 16:9 横向、4K 分辨率的纯图片 3×2 六视图整版。第一行依次为正视、后视、左侧视，第二行依次为右侧视、俯视、底视。六格各为一个互不重复的标准正交方向，使用相同产品坐标系，左右以产品自身为准；禁止把斜侧视或同一个角度翻转、镜像、微调后充当不同方向。各视图保持同一产品、几何、结构比例、部件数量、配色材质及标识，仅改变观察方向；统一尺度、背景和留白。底面不可见的结构不得凭空臆造。画面不加文字、角度名称、数字、标签、说明或水印。";
}

export function reconstructionControl(mode: string, ratio: number) {
  const enabled = mode === "source" || mode === "local";
  return { enabled, value: enabled ? ratio : 0, hint: enabled ? "" : "添加产品原图后可调" };
}

/** Signed supplier links must never have a query string appended or rewritten. */
export function assetDownloadHref(url: string) {
  return url.startsWith("/api/assets/") ? appPath(`${url}${url.includes("?") ? "&" : "?"}download=1`) : url;
}

export function replaceAssetReference(message: Message, asset: Asset): Message {
  const replace = (items?: Asset[]) => items?.map((item) => item.id === asset.id ? asset : item);
  const generation = message.generation;
  const nextAssets = replace(generation?.imageAssets);
  const hasResult = generation?.imageAssets?.some((item) => item.id === asset.id);
  return {
    ...message,
    assets: replace(message.assets),
    generation: generation && hasResult ? {
      ...generation, imageAssets: nextAssets,
      imageUrls: generation.imageUrls.map((url, index) => generation.imageAssets?.[index]?.id === asset.id ? asset.url : url),
      savedCount: nextAssets?.filter((item) => !item.localSaveError && item.url.startsWith("/api/assets/")).length,
      note: nextAssets?.every((item) => !item.localSaveError) ? generation.note?.split(/(?<=。)/).filter((part) => !/本地保存失败|临时链接/.test(part)).join("") || undefined : generation.note,
    } : generation,
  };
}

export function clipboardImageFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  const files = Array.from(data.files).filter((file) => file.type.startsWith("image/"));
  if (files.length) return files;
  return Array.from(data.items).filter((item) => item.kind === "file" && item.type.startsWith("image/")).map((item) => item.getAsFile()).filter((file): file is File => file !== null);
}

export function removeAssetReference(message: Message, asset: Asset): Message {
  const generation = message.generation;
  const index = generation?.imageAssets?.findIndex((item) => item.id === asset.id) ?? -1;
  return {
    ...message, assets: message.assets?.filter((item) => item.id !== asset.id),
    generation: generation && index >= 0 ? {
      ...generation,
      imageAssets: generation.imageAssets?.filter((item) => item.id !== asset.id),
      imageUrls: generation.imageUrls.filter((_, imageIndex) => imageIndex !== index),
      variants: generation.variants?.filter((variant, variantIndex) => variant.assetId ? variant.assetId !== asset.id : variantIndex !== index),
    } : generation,
  };
}
