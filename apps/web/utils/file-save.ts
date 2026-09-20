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

// 下载图片（使用 Blob 方式，确保直接下载而不是在浏览器中打开）
export async function downloadImage(imageUrl: string, filename: string): Promise<boolean> {
  try {
    let blob: Blob;
    
    if (imageUrl.startsWith("data:")) {
      // base64 data URL 转换为 Blob
      blob = dataURLToBlob(imageUrl);
    } else {
      // 普通 URL，使用图片代理避免跨域问题
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        console.error("下载图片失败:", response.status);
        // 降级：直接尝试 fetch 原 URL
        try {
          const directResponse = await fetch(imageUrl);
          if (!directResponse.ok) return false;
          blob = await directResponse.blob();
        } catch {
          return false;
        }
      } else {
        blob = await response.blob();
      }
    }

    // 创建 Object URL
    const objectUrl = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // 释放 Object URL
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    
    return true;
  } catch (e) {
    console.error("下载图片失败:", e);
    // 降级方案：直接用链接下载
    try {
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = filename;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return true;
    } catch {
      return false;
    }
  }
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
      // 使用图片代理避免跨域问题
      const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) return false;
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
): Promise<{ saved: number; total: number; error?: string }> {
  const handle = await getSavedDirectoryHandle();
  if (!handle) {
    return { saved: 0, total: cards.length, error: "未选择保存目录，请在设置页选择" };
  }

  // 创建子目录（只用产品名称，相同产品自动归类到同一文件夹）
  const folderName = (productName || "未命名产品").replace(/[\\/:*?"<>|]/g, "_");
  let subDirHandle: FileSystemDirectoryHandle;
  try {
    subDirHandle = await handle.getDirectoryHandle(folderName, { create: true });
  } catch (e: any) {
    // 如果创建子目录失败，可能是权限问题
    if (e.name === "NotAllowedError" || e.name === "SecurityError") {
      return { saved: 0, total: cards.length, error: "目录权限已过期，请在设置页重新选择保存目录" };
    }
    console.error("创建子目录失败:", e);
    subDirHandle = handle; // 如果创建失败，保存到根目录
  }

  // 用时间戳区分不同批次，避免文件名冲突
  const batchTimestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  let saved = 0;
  let lastError: string | undefined;
  
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (!card?.imageUrl) {
      lastError = "图片URL为空";
      continue;
    }

    const ext = card.imageUrl.startsWith("data:image/jpeg") ? "jpg" : "png";
    const filename = `${batchTimestamp}_${String(i + 1).padStart(2, "0")}_${card.title || `方案${i + 1}`}.${ext}`.replace(/[\\/:*?"<>|]/g, "_");

    try {
      let blob: Blob;
      if (card.imageUrl.startsWith("data:")) {
        blob = dataURLToBlob(card.imageUrl);
      } else {
        // 使用图片代理避免跨域问题
        const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(card.imageUrl)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          lastError = `下载图片失败: ${response.status}`;
          continue;
        }
        blob = await response.blob();
      }

      const fileHandle = await subDirHandle.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      saved++;
    } catch (e: any) {
      console.error(`保存第 ${i + 1} 张图片失败:`, e);
      if (e.name === "NotAllowedError" || e.name === "SecurityError") {
        lastError = "目录权限已过期，请在设置页重新选择保存目录";
        break; // 权限问题，不需要继续尝试
      }
      lastError = e.message || "保存失败";
    }
  }

  const result: { saved: number; total: number; error?: string } = { saved, total: cards.length };
  if (saved === 0 && lastError) {
    result.error = lastError;
  }
  return result;
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
