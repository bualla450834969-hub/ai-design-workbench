import { APP_BASE_PATH, appPath } from "@/lib/app-path";
import { fetchWithTimeout } from "@/lib/client-operations";
import { readApiJson } from "@/lib/client-response";
import type { Asset } from "@/types/domain";
import { isBrowserLocalMode } from "@/lib/browser-local-mode";
import { browserImageBlob, browserImageFile, browserImageFilename, shareBrowserImage, supportsNativeImageSave } from "@/lib/browser-image-save";

type DirectoryHandle = FileSystemDirectoryHandle & { queryPermission(options: { mode: "readwrite" }): Promise<PermissionState> };
type PickerWindow = Window & { showDirectoryPicker?: (options: { id: string; mode: "readwrite"; startIn?: FileSystemDirectoryHandle }) => Promise<DirectoryHandle> };
type SavedDirectory = { handle: DirectoryHandle; remembered: boolean };
export type BrowserDownloadDirectory = { name: string; permission: PermissionState; remembered: boolean };
export type PreparedBrowserDownload = { mode: "prepared"; filename: string; blob: Blob };
export type BrowserDownloadResult = { mode: "directory" | "download" | "share" | "cancelled"; filename: string; directoryName?: string } | PreparedBrowserDownload;
const directories = new Map<string, SavedDirectory>();
const writes = new Map<string, Promise<void>>();
const databaseName = "idai-browser-downloads";
const storeName = "directories";

function scope(userId: string) {
  if (!userId.trim()) throw new Error("请先登录后选择下载文件夹。");
  return JSON.stringify([APP_BASE_PATH, userId]);
}

export function supportsBrowserDownloadDirectory() {
  return typeof window !== "undefined" && !window.desktopAPI && typeof (window as PickerWindow).showDirectoryPicker === "function";
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Directory persistence unavailable")); return; }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Directory persistence blocked"));
  });
}

async function savedHandle(key: string, write?: { handle?: DirectoryHandle; remove?: boolean }): Promise<DirectoryHandle | undefined> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, write ? "readwrite" : "readonly");
      const objectStore = transaction.objectStore(storeName);
      const request = write?.remove ? objectStore.delete(key) : write?.handle ? objectStore.put(write.handle, key) : objectStore.get(key);
      let value: DirectoryHandle | undefined;
      request.onsuccess = () => { value = write ? undefined : request.result; };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

/** Load a handle only for this signed-in account and deployment path; never request permission on load. */
export async function restoreBrowserDownloadDirectory(userId: string): Promise<BrowserDownloadDirectory | null> {
  if (!supportsBrowserDownloadDirectory()) return null;
  const key = scope(userId);
  let saved = directories.get(key);
  if (!saved) {
    const handle = await savedHandle(key).catch(() => undefined);
    if (!handle || handle.kind !== "directory" || typeof handle.queryPermission !== "function") return null;
    saved = { handle, remembered: true }; directories.set(key, saved);
  }
  const permission = await saved.handle.queryPermission({ mode: "readwrite" }).catch(() => "prompt" as PermissionState);
  return { name: saved.handle.name, permission, remembered: saved.remembered };
}

/** Call directly from a click. The picker runs before any asynchronous database work. */
export async function chooseBrowserDownloadDirectory(userId: string): Promise<BrowserDownloadDirectory> {
  const key = scope(userId);
  if (!supportsBrowserDownloadDirectory()) throw new Error("此浏览器不支持直接选择下载文件夹，请使用浏览器下载或系统“存储到文件”。");
  const handle = await (window as PickerWindow).showDirectoryPicker!({ id: "idai-results", mode: "readwrite", startIn: directories.get(key)?.handle });
  const permission = await handle.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") throw new Error("未获得文件夹写入权限，请重新选择并允许访问，或使用系统下载。");
  const saved = { handle, remembered: false }; directories.set(key, saved);
  try { await savedHandle(key, { handle }); saved.remembered = true; } catch { /* The current page can still use the explicitly chosen directory. */ }
  return { name: handle.name, permission, remembered: saved.remembered };
}

export async function forgetBrowserDownloadDirectory(userId: string) {
  const key = scope(userId); directories.delete(key);
  await savedHandle(key, { remove: true }).catch(() => undefined);
}

/** Forget this page's permissions on logout without deleting files or remembered per-account choices. */
export function clearBrowserDownloadSession() { directories.clear(); }

export function browserDownloadFilename(value: string, fallback = "工业设计图片.png") {
  let clean = value.replace(/[\\/<>:"|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, "-").replace(/^\.+|[. ]+$/g, "").trim();
  if (!clean) clean = fallback;
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean)) clean = `图片-${clean}`;
  if (clean.length > 180) { const extension = clean.match(/\.[a-z0-9]{1,12}$/i)?.[0] || ""; clean = clean.slice(0, 180 - extension.length) + extension; }
  return clean;
}

function nativeDownload(url: string, filename: string) {
  const link = document.createElement("a");
  // In particular, do not force local images into an iPad Quick Look window.
  link.href = url; link.download = filename; link.rel = "noopener noreferrer";
  document.body.appendChild(link); link.click(); link.remove();
}

function nativeZipDownload(projectId: string, options: object) {
  // A synchronous native form keeps Safari's user activation and streams the authenticated response.
  // POST also avoids a long URL when selecting hundreds of images. No cookie/token is put in the URL.
  const form = document.createElement("form");
  form.action = appPath(`/api/projects/${encodeURIComponent(projectId)}/export`);
  // noreferrer can turn a navigation POST's Origin into null and fail the same-origin check.
  form.method = "POST"; form.target = "_blank"; form.rel = "noopener"; form.style.display = "none";
  const input = document.createElement("input"); input.type = "hidden"; input.name = "options"; input.value = JSON.stringify(options);
  form.appendChild(input); document.body.appendChild(form); form.submit(); form.remove();
}

function queuedWrite<T>(key: string, action: () => Promise<T>): Promise<T> {
  const next = (writes.get(key) || Promise.resolve()).then(action);
  const settled = next.then(() => undefined, () => undefined); writes.set(key, settled);
  void settled.then(() => { if (writes.get(key) === settled) writes.delete(key); });
  return next;
}

async function writeDownload(saved: SavedDirectory, filename: string, fetchResponse: () => Promise<Response>, expectedType: string, preferResponseFilename = false): Promise<BrowserDownloadResult> {
  if (await saved.handle.queryPermission({ mode: "readwrite" }) !== "granted") throw new Error("下载文件夹需要重新授权，请点击“选择下载文件夹”，或切换为系统下载。");
  const response = await fetchResponse();
  if (!response.ok) await readApiJson(response, "下载失败");
  if (!(response.headers.get("Content-Type") || "").toLowerCase().startsWith(expectedType)) { await response.body?.cancel(); throw new Error("下载内容异常，请刷新项目后重试。"); }
  if (preferResponseFilename) {
    const encodedName = response.headers.get("Content-Disposition")?.match(/(?:^|;)\s*filename\*=UTF-8''([^;]+)/i)?.[1];
    if (encodedName) { try { filename = browserDownloadFilename(decodeURIComponent(encodedName)); } catch { /* Keep the safe suggested name for an invalid header. */ } }
  }
  let outputName = filename;
  const dot = filename.lastIndexOf("."); const stem = dot > 0 ? filename.slice(0, dot) : filename; const extension = dot > 0 ? filename.slice(dot) : "";
  for (let index = 0; index < 1000; index++) {
    outputName = index ? `${stem} (${index})${extension}` : filename;
    try { await saved.handle.getFileHandle(outputName); }
    catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") break;
      if (!(error instanceof DOMException) || error.name !== "TypeMismatchError") { await response.body?.cancel(); throw error; }
    }
    if (index === 999) { await response.body?.cancel(); throw new Error("同名文件过多，请更换下载文件夹或文件名称。"); }
  }
  let writable: FileSystemWritableFileStream | undefined;
  try {
    const file = await saved.handle.getFileHandle(outputName, { create: true });
    writable = await file.createWritable();
    if (!response.body) throw new Error("下载响应没有内容。");
    await response.body.pipeTo(writable);
    return { mode: "directory", filename: outputName, directoryName: saved.handle.name };
  } catch (error) {
    await writable?.abort().catch(() => undefined); await response.body?.cancel().catch(() => undefined);
    throw error;
  }
}

/** Only the owned asset API is downloaded; supplier URLs and their credentials are never reused. */
export async function downloadProjectAsset(asset: Pick<Asset, "id" | "name" | "type" | "localSaveError"> & { url?: string }, userId?: string, name = asset.name, options?: { preferFileDownload?: boolean }): Promise<BrowserDownloadResult> {
  if (asset.localSaveError) throw new Error("图片尚未保存到项目，请先点击“重新保存”已有图片，再下载；不会重新生图。");
  const filename = browserDownloadFilename(browserImageFilename(name, browserImageBlob(asset.url)?.type || asset.type));
  const url = appPath(`/api/assets/${encodeURIComponent(asset.id)}?download=1`);
  const key = userId ? scope(userId) : ""; const saved = key ? directories.get(key) : undefined;
  if (isBrowserLocalMode()) {
    if (saved) return queuedWrite(key, () => writeDownload(saved, filename, () => fetchWithTimeout(url), "image/"));
    const blob = browserImageBlob(asset.url);
    const file = blob && browserImageFile(blob, filename);
    // Hydration prepared this File's Blob before the tap; do not await a read
    // here or Safari can consume/expire the transient user activation.
    if (!options?.preferFileDownload && file && supportsNativeImageSave(file)) return { mode: await shareBrowserImage(file), filename: file.name };
    if (asset.url?.startsWith("blob:")) { nativeDownload(asset.url, filename); return { mode: "download", filename }; }
    const response = await fetchWithTimeout(url);
    if (!response.ok) await readApiJson(response, "读取本机图片失败");
    const blobUrl = URL.createObjectURL(await response.blob()); nativeDownload(blobUrl, filename); setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return { mode: "download", filename };
  }
  if (!saved) { nativeDownload(url, filename); return { mode: "download", filename }; }
  return queuedWrite(key, () => writeDownload(saved, filename, () => fetchWithTimeout(url, { cache: "no-store" }), "image/", true));
}

export async function exportProjectToBrowser(projectId: string, name: string, assetIds?: string[], favoritesOnly = false, userId?: string): Promise<BrowserDownloadResult> {
  const filename = browserDownloadFilename(`${name}-方案归档.zip`, "项目方案归档.zip");
  const options = { ...(assetIds ? { assetIds: [...new Set(assetIds)] } : {}), favoritesOnly, includeComparison: false };
  const key = userId ? scope(userId) : ""; const saved = key ? directories.get(key) : undefined;
  if (isBrowserLocalMode()) {
    const response = () => fetchWithTimeout(`/api/projects/${encodeURIComponent(projectId)}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options) }, 180_000);
    if (saved) return queuedWrite(key, () => writeDownload(saved, filename, response, "application/zip"));
    // The UI exposes a second, explicit download click after preparation. This
    // keeps Safari's user activation and works without any popup permission.
    const archive = await response(); if (!archive.ok) await readApiJson(archive, "本机打包失败");
    if (!(archive.headers.get("Content-Type") || "").startsWith("application/zip")) { await archive.body?.cancel(); throw new Error("本机打包内容异常，请重试。"); }
    return { mode: "prepared", filename, blob: await archive.blob() };
  }
  if (!saved) { nativeZipDownload(projectId, options); return { mode: "download", filename }; }
  return queuedWrite(key, () => writeDownload(saved, filename, () => fetchWithTimeout(`/api/projects/${encodeURIComponent(projectId)}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(options) }, 180_000), "application/zip"));
}

/** Call directly from the fresh download click, without awaiting anything. */
export function savePreparedBrowserDownload(prepared: PreparedBrowserDownload): BrowserDownloadResult {
  if (prepared.mode !== "prepared" || !(prepared.blob instanceof Blob) || !prepared.blob.size) throw new Error("图片包尚未准备好，请重新打包。");
  const url = URL.createObjectURL(prepared.blob);
  nativeDownload(url, prepared.filename);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { mode: "download", filename: prepared.filename };
}

export function browserDownloadMessage(result: BrowserDownloadResult) {
  if (result.mode === "prepared") return "图片包已准备好，尚未保存；请点击“下载已准备图片包”。";
  if (result.mode === "cancelled") return "已取消保存图片。";
  if (result.mode === "share") return "已交给系统保存；可选择“保存图像”存入图库，或“存储到文件”。";
  return result.mode === "directory" ? `已保存到下载文件夹“${result.directoryName}”：${result.filename}` : "已交给浏览器下载；请在下载列表中查看，或使用系统“存储到文件”选择位置。";
}
