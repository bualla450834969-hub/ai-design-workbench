/** Reuse hydrated local Blobs without another read between a tap and native share.
 * Entries live exactly as long as the corresponding object URL; no image is
 * uploaded, persisted again, converted or fetched from its model supplier. */
const imageBlobs = new Map<string, Blob>();

export function rememberBrowserImageBlob(url: string, blob: Blob) {
  if (url.startsWith("blob:") && blob.type.toLowerCase().startsWith("image/")) imageBlobs.set(url, blob);
}

export function forgetBrowserImageBlob(url: string) { imageBlobs.delete(url); }
export function browserImageBlob(url: string | undefined) { return url ? imageBlobs.get(url) : undefined; }

const imageExtensions: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "image/avif": "avif", "image/heic": "heic", "image/heif": "heif", "image/svg+xml": "svg",
};

/** Blob MIME is authoritative; a historical .jpg label must not disguise PNG. */
export function browserImageFilename(filename: string, mimeType: string) {
  const extension = imageExtensions[mimeType.split(";", 1)[0].trim().toLowerCase()];
  if (!extension) return filename;
  const stem = filename.replace(/\.[a-z0-9]{1,12}$/i, "") || "工业设计图片";
  return `${stem}.${extension}`;
}

export function browserImageFile(blob: Blob, filename: string): File | undefined {
  if (!blob.size || !imageExtensions[blob.type.split(";", 1)[0].trim().toLowerCase()] || typeof File === "undefined") return undefined;
  return new File([blob], browserImageFilename(filename, blob.type), { type: blob.type.split(";", 1)[0].trim().toLowerCase() });
}

/** Touch browsers can offer Save Image directly in the system share sheet.
 * A website cannot silently write into the device's photo library. */
export function supportsNativeImageSave(file: File) {
  if (typeof window === "undefined" || window.desktopAPI || typeof navigator === "undefined") return false;
  if (!window.matchMedia?.("(any-pointer: coarse)").matches || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try { return navigator.canShare({ files: [file] }); } catch { return false; }
}

/** Must be called synchronously inside the original click, with a ready File. */
export async function shareBrowserImage(file: File): Promise<"share" | "cancelled"> {
  try {
    // Do not add text/title/URL: file-only data also avoids Safari share issues.
    const operation = navigator.share({ files: [file] });
    if (!operation || typeof operation.then !== "function") throw new Error("系统未打开图片保存选项，请长按图片选择保存，或使用下载到文件。");
    await operation;
    return "share";
  } catch (reason) {
    if (reason && typeof reason === "object" && "name" in reason && reason.name === "AbortError") return "cancelled";
    throw new Error("系统图片保存未能完成，请重试，或长按图片选择“保存图像”。也可使用“下载到文件”。", { cause: reason });
  }
}
