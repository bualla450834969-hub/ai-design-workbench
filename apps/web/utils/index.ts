import type { ResultCard, HistoryRecord } from "@/types";
import { HISTORY_KEY, FAVORITES_KEY, MAX_HISTORY, MAX_FAVORITES } from "@/constants";

// ========== 历史记录 ==========
export function loadHistory(): HistoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveHistory(records: HistoryRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
  } catch (e) {
    if (records.length > 1) {
      const half = records.slice(Math.floor(records.length / 2));
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(half));
      } catch {
        localStorage.removeItem(HISTORY_KEY);
      }
    }
  }
}

export function addHistoryRecord(record: Omit<HistoryRecord, "id" | "createdAt">): HistoryRecord {
  const fullRecord: HistoryRecord = {
    ...record,
    id: "hist-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
    createdAt: Date.now(),
  };
  const records = loadHistory();
  records.unshift(fullRecord);
  const trimmed = records.slice(0, MAX_HISTORY);
  saveHistory(trimmed);
  return fullRecord;
}

export function deleteHistoryRecord(id: string) {
  const records = loadHistory().filter((r) => r.id !== id);
  saveHistory(records);
}

export function clearHistory() {
  saveHistory([]);
}

// ========== 收藏 ==========
export function loadFavorites(): ResultCard[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(cards: ResultCard[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(cards));
  } catch {
    // localStorage 可能已满，忽略
  }
}

export function toggleFavorite(card: ResultCard): boolean {
  const favorites = loadFavorites();
  const idx = favorites.findIndex((c) => c.id === card.id);
  if (idx >= 0) {
    favorites.splice(idx, 1);
    saveFavorites(favorites);
    return false;
  } else {
    favorites.unshift(card);
    saveFavorites(favorites.slice(0, MAX_FAVORITES));
    return true;
  }
}

// ========== 辅助函数 ==========
export function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `今天 ${time}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function getProviderConfig() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("providerConfigs");
    if (!raw) return null;
    const configs = JSON.parse(raw);
    for (const [id, cfg] of Object.entries(configs)) {
      const c = cfg as { apiKey?: string; brainModel?: string; imageModel?: string; baseUrl?: string };
      if (c.apiKey && c.apiKey.length > 0) {
        return { provider: id, ...c };
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server-device";
  let deviceId = localStorage.getItem("deviceId");
  if (!deviceId) {
    deviceId = "device-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("deviceId", deviceId);
  }
  return deviceId;
}

// 压缩图片为缩略图（最大边长 512px，JPEG 0.7 质量）
export function compressImageToThumbnail(dataUrl: string, maxSize = 512, quality = 0.7): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// 费用估算配置
export type CostConfig = {
  brainCostPerCall: number; // 方案模型每次调用费用（元）
  imageCostPerCall: number; // 图片模型每次调用费用（元）
};

export function loadCostConfig(): CostConfig {
  const DEFAULT = { brainCostPerCall: 0.06, imageCostPerCall: 0.15 };
  if (typeof window === "undefined") return DEFAULT;
  try {
    const saved = localStorage.getItem("costConfig");
    if (saved) {
      const parsed = JSON.parse(saved);
      const brain = typeof parsed.brainCostPerCall === "number" && parsed.brainCostPerCall > 0 ? parsed.brainCostPerCall : DEFAULT.brainCostPerCall;
      const image = typeof parsed.imageCostPerCall === "number" && parsed.imageCostPerCall > 0 ? parsed.imageCostPerCall : DEFAULT.imageCostPerCall;
      return { brainCostPerCall: brain, imageCostPerCall: image };
    }
  } catch {}
  return DEFAULT;
}

export function saveCostConfig(config: CostConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem("costConfig", JSON.stringify(config));
}

// 计算单次生成的预估费用
export function estimateCost(count: number, config: CostConfig): number {
  return config.brainCostPerCall * 1 + config.imageCostPerCall * count;
}

// 授权码管理
export function getLicenseCode(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("licenseCode") || "";
}

export function saveLicenseCode(code: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem("licenseCode", code);
}

export function clearLicenseCode() {
  if (typeof window === "undefined") return;
  localStorage.removeItem("licenseCode");
}
