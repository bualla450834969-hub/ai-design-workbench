import { downloadBlob, fetchWithTimeout } from "@/lib/client-operations";
import type { Asset } from "@/types/domain";

/** Flatten an already transparent result onto white without calling a model. */
export async function downloadWhiteBackgroundPng(asset: Asset) {
  if (!asset.tags?.includes("透明背景")) throw new Error("这张图片还不是透明背景，请先生成透明背景图片。");
  const response = asset.url.startsWith("blob:") || asset.url.startsWith("data:")
    ? await globalThis.fetch(asset.url)
    : await fetchWithTimeout(asset.url, { cache: "no-store" });
  if (!response.ok) throw new Error("读取透明图片失败，请先重新保存图片后重试。");
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法合成白底图片，请重新打开软件后重试。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("白底图片导出失败，请稍后重试。")), "image/png"));
    downloadBlob(png, `${asset.name.replace(/\.[^.]+$/, "")}-白底.png`);
  } finally { bitmap.close(); }
}
