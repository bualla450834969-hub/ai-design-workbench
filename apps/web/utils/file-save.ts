// 本地文件保存工具
// 使用 File System Access API 保存生成结果到用户选择的本地目录

// File System Access API 类型声明
declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: string; id?: string }) => Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemDirectoryHandle {
    requestPermission?: (options?: { mode?: string }) => Promise<string>;
  }
}

const DB_NAME = "ai-design-workbench";
const DB_VERSION = 1;
const STORE_NAME = "file-handles";

// 打开 IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 保存目录句柄到 IndexedDB
async function saveDirectoryHandle(handle: FileSystemDirectoryHandle) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(handle, "saveDirectory");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

// 从 IndexedDB 获取目录句柄
export async function getSavedDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get("saveDirectory");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

// 检查是否支持 File System Access API
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

// 选择保存目录
export async function selectSaveDirectory(): Promise<string | null> {
  if (!isFileSystemAccessSupported() || !window.showDirectoryPicker) {
    throw new Error("当前浏览器不支持本地目录保存，请使用 Chrome 或 Edge 浏览器");
  }

  try {
    const handle = await window.showDirectoryPicker({
      mode: "readwrite",
      id: "ai-design-save-dir",
    });
    await saveDirectoryHandle(handle);
    return handle.name;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return null; // 用户取消
    }
    throw e;
  }
}

// 清除保存的目录
export async function clearSavedDirectory() {
  try {
    const db = await openDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.delete("saveDirectory");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // ignore
  }
}

// 获取保存的目录名称
export async function getSavedDirectoryName(): Promise<string | null> {
  const handle = await getSavedDirectoryHandle();
  return handle?.name || null;
}

// 将 dataURL 转换为 Blob
function dataURLToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(",");
  const mime = arr[0]?.match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(arr[1] || "");
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// 下载图片（兼容不支持 File System Access API 的浏览器）
export function downloadImage(imageUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = imageUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 保存单张图片到目录
export async function saveImageToDirectory(
  imageUrl: string,
  filename: string,
  directoryHandle?: FileSystemDirectoryHandle | null
): Promise<boolean> {
  const handle = directoryHandle || (await getSavedDirectoryHandle());
  if (!handle) return false;

  try {
    // 请求权限
    if (!handle.requestPermission) return false;
    const permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") return false;

    // 获取图片数据
    let blob: Blob;
    if (imageUrl.startsWith("data:")) {
      blob = dataURLToBlob(imageUrl);
    } else {
      const response = await fetch(imageUrl);
      blob = await response.blob();
    }

    // 创建文件
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (e) {
    console.error("保存图片失败:", e);
    return false;
  }
}

// 批量保存生成结果到目录
export async function saveResultsToDirectory(
  cards: Array<{ imageUrl?: string; title?: string }>,
  productName: string,
  templateLabel?: string
): Promise<{ saved: number; total: number }> {
  const handle = await getSavedDirectoryHandle();
  if (!handle) return { saved: 0, total: cards.length };

  // 请求权限
  if (!handle.requestPermission) return { saved: 0, total: cards.length };
  const permission = await handle.requestPermission({ mode: "readwrite" });
  if (permission !== "granted") return { saved: 0, total: cards.length };

  // 创建子目录（产品名_时间戳）
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const folderName = `${productName || "未命名产品"}_${timestamp}`;
  let subDirHandle: FileSystemDirectoryHandle;
  try {
    subDirHandle = await handle.getDirectoryHandle(folderName, { create: true });
  } catch {
    subDirHandle = handle; // 如果创建失败，保存到根目录
  }

  let saved = 0;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card?.imageUrl) continue;

    const ext = card.imageUrl.startsWith("data:image/jpeg") ? "jpg" : "png";
    const filename = `${String(i + 1).padStart(2, "0")}_${card.title || `方案${i + 1}`}.${ext}`.replace(/[\\/:*?"<>|]/g, "_");

    try {
      let blob: Blob;
      if (card.imageUrl.startsWith("data:")) {
        blob = dataURLToBlob(card.imageUrl);
      } else {
        const response = await fetch(card.imageUrl);
        blob = await response.blob();
      }

      const fileHandle = await subDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      saved++;
    } catch (e) {
      console.error(`保存第 ${i + 1} 张图片失败:`, e);
    }
  }

  return { saved, total: cards.length };
}

// 检查是否启用了自动保存
export function isAutoSaveEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("autoSaveToLocal") === "true";
}

// 设置自动保存
export function setAutoSaveEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem("autoSaveToLocal", enabled ? "true" : "false");
}
