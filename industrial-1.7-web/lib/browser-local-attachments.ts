export const BROWSER_LOCAL_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
export const BROWSER_LOCAL_DOCUMENT_HINT = "本地网页版仅支持 PNG、JPEG、WebP 或 GIF 图片。PDF、Word 或文字文件请将正文粘贴到输入框，或先转成支持的图片；尚未调用模型。";
const imageTypes = new Set(BROWSER_LOCAL_IMAGE_ACCEPT.split(","));

/** Validate the whole selection before any file is read or any model is called. */
export function browserLocalAttachmentIssue(assets: ReadonlyArray<{ type: string }>): string | null {
  return assets.some((asset) => !imageTypes.has(asset.type.toLowerCase())) ? BROWSER_LOCAL_DOCUMENT_HINT : null;
}
