"use client";

// 将跨域图片URL转为本地代理URL
function getProxyImageUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/api/") || url.startsWith("data:")) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

import { useState, useEffect } from "react";
import type { ResultCard } from "@/types";
import { loadFavorites, saveFavorites } from "@/utils";
import { downloadImage } from "@/utils/file-save";
import CardDetailModal from "@/components/CardDetailModal";
import ImageLightbox from "@/components/ImageLightbox";
import { useToast } from "@/components/Toast";

export default function FavoritesPanel({ visible, onUseAsOriginal }: { visible?: boolean; onUseAsOriginal?: (imageUrl: string) => void }) {
  const [favorites, setFavorites] = useState<ResultCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<ResultCard | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  // 当面板变为可见时，重新加载收藏数据
  useEffect(() => {
    if (visible) {
      setFavorites(loadFavorites());
    }
  }, [visible]);

  const handleRemove = (cardId: string) => {
    const next = favorites.filter((c) => c.id !== cardId);
    setFavorites(next);
    saveFavorites(next);
    showToast("已取消收藏", "info");
  };

  const handleClearAll = () => {
    if (confirm("确定清空全部收藏吗？此操作不可恢复。")) {
      setFavorites([]);
      saveFavorites([]);
      showToast("已清空全部收藏", "success");
    }
  };

  const handleDownload = async (card: ResultCard) => {
    if (card.imageUrl) {
      const success = await downloadImage(card.imageUrl, `${card.title || "设计方案"}.png`);
      if (success) {
        showToast("图片已开始下载", "success");
      } else {
        showToast("下载失败，请重试", "error");
      }
    }
  };

  const handleDownloadAll = async () => {
    showToast(`开始下载 ${favorites.length} 张图片`, "success");
    for (let idx = 0; idx < favorites.length; idx++) {
      const card = favorites[idx];
      if (card.imageUrl) {
        await downloadImage(card.imageUrl, `${card.title || "方案"}-${idx + 1}.png`);
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  };

  if (favorites.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 text-5xl text-gray-300">★</div>
        <h3 className="text-sm font-medium text-gray-600">暂无收藏</h3>
        <p className="mt-1 text-xs text-gray-400">在结果页点击星标即可收藏方案</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">我的收藏（{favorites.length}）</h2>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadAll}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            全部下载
          </button>
          <button
            onClick={handleClearAll}
            className="text-xs text-red-500 hover:text-red-600"
          >
            清空
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {favorites.map((card) => (
          <div
            key={card.id}
            className="glass-card overflow-hidden rounded-2xl"
          >
            {card.imageUrl && (
              <div
                className="relative aspect-square w-full cursor-zoom-in overflow-hidden bg-gray-100"
                onClick={() => setLightboxImage({ url: card.imageUrl!, title: card.title })}
              >
                <img src={getProxyImageUrl(card.imageUrl)} alt={card.title} className="h-full w-full object-cover" loading="lazy" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(card.id);
                  }}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-sm text-yellow-400 hover:bg-black/70"
                >
                  ★
                </button>
              </div>
            )}
            <div className="p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">{card.title}</h3>
                {card.variationLabel && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                    {card.variationLabel}
                  </span>
                )}
              </div>
              {card.description && (
                <p className="mt-2 text-xs text-gray-500 line-clamp-2">{card.description}</p>
              )}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleDownload(card)}
                  className="flex-1 rounded-lg bg-brand-600 py-2 text-xs font-medium text-white hover:bg-brand-700"
                >
                  下载
                </button>
                <button
                  onClick={() => setSelectedCard(card)}
                  className="flex-1 rounded-lg border border-gray-200 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  详情
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-[10px] text-gray-400">
        最多保存 50 张收藏 · 数据仅保存在本地浏览器
      </p>

      {/* 详情弹窗 */}
      {selectedCard && (
        <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}

      {/* 图片放大 */}
      {lightboxImage && (
        <ImageLightbox
          imageUrl={lightboxImage.url}
          title={lightboxImage.title}
          onClose={() => setLightboxImage(null)}
          onUseAsOriginal={onUseAsOriginal ? (url) => {
            onUseAsOriginal(url);
            setLightboxImage(null);
          } : undefined}
        />
      )}
    </div>
  );
}
