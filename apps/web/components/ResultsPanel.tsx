"use client";

import { useState, useEffect } from "react";
import type { ResultCard, BatchResultGroup } from "@/types";
import { loadFavorites, toggleFavorite } from "@/utils";
import CardDetailModal, { type GenerationContext } from "@/components/CardDetailModal";
import ImageLightbox from "@/components/ImageLightbox";

export default function ResultsPanel({ cards, batchGroups, isGenerating, context }: { cards: ResultCard[]; batchGroups: BatchResultGroup[]; isGenerating: boolean; context?: GenerationContext }) {
  const [selectedCard, setSelectedCard] = useState<ResultCard | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showCompareView, setShowCompareView] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  useEffect(() => {
    const favs = loadFavorites();
    setFavorites(new Set(favs.map((c) => c.id)));
  }, []);

  const toggleCompareSelect = (cardId: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId);
      }
      if (prev.length >= 4) return prev;
      return [...prev, cardId];
    });
  };

  const exitCompareMode = () => {
    setCompareMode(false);
    setSelectedForCompare([]);
  };

  const isBatchResult = batchGroups.length > 0;
  const totalCards = isBatchResult ? batchGroups.reduce((sum, g) => sum + g.cards.length, 0) : cards.length;
  const allCards = isBatchResult ? batchGroups.flatMap((g) => g.cards) : cards;
  const compareCards = allCards.filter((c) => selectedForCompare.includes(c.id));

  if (isGenerating && totalCards === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <h3 className="text-sm font-medium text-gray-600">正在生成...</h3>
        <p className="mt-1 text-xs text-gray-400">完成后将自动跳转到结果页</p>
      </div>
    );
  }

  if (totalCards === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 text-5xl text-gray-300">▢</div>
        <h3 className="text-sm font-medium text-gray-600">暂无生成结果</h3>
        <p className="mt-1 text-xs text-gray-400">去生成页上传图片开始创作</p>
      </div>
    );
  }

  const displayGroups: { name: string; cards: ResultCard[] }[] = isBatchResult
    ? batchGroups.map((g) => ({ name: g.groupName, cards: g.cards }))
    : [{ name: "全部方案", cards }];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">
          {compareMode ? `选择对比图片（${selectedForCompare.length}/4）` : `生成结果（${totalCards}）${isBatchResult ? ` · ${batchGroups.length}组` : ""}`}
        </h2>
        {compareMode ? (
          <div className="flex gap-2">
            <button
              onClick={exitCompareMode}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={() => setShowCompareView(true)}
              disabled={selectedForCompare.length < 2}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              开始对比
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            {totalCards >= 2 && (
              <button
                onClick={() => setCompareMode(true)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                对比
              </button>
            )}
            {totalCards > 0 && (
              <button
                onClick={() => {
                  let idx = 0;
                  displayGroups.forEach((group) => {
                    group.cards.forEach((card) => {
                      if (card.imageUrl) {
                        const currentIdx = idx;
                        setTimeout(() => {
                          const a = document.createElement("a");
                          a.href = card.imageUrl!;
                          const prefix = isBatchResult ? `${group.name}-` : "";
                          a.download = `${prefix}${card.title || "方案"}-${currentIdx + 1}.png`;
                          a.click();
                        }, currentIdx * 300);
                        idx++;
                      }
                    });
                  });
                }}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                全部下载
              </button>
            )}
          </div>
        )}
      </div>
      {displayGroups.map((group, groupIdx) => (
        <div key={groupIdx} className="space-y-3">
          {isBatchResult && (
            <div className="flex items-center gap-2">
              <div className="h-4 w-1 rounded-full bg-brand-600" />
              <h3 className="text-sm font-semibold text-gray-900">{group.name}</h3>
              <span className="text-xs text-gray-400">({group.cards.length}张)</span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {group.cards.map((card) => {
              const isSelected = selectedForCompare.includes(card.id);
              return (
              <div
                key={card.id}
                className={`overflow-hidden rounded-2xl bg-white shadow-sm transition-all ${
                  compareMode ? "cursor-pointer" : ""
                } ${isSelected ? "ring-2 ring-brand-500 ring-offset-2" : ""}`}
                onClick={() => compareMode && toggleCompareSelect(card.id)}
              >
                {card.imageUrl && (
                  <div
                    className={`relative aspect-square w-full overflow-hidden bg-gray-100 ${
                      compareMode ? "" : "cursor-zoom-in"
                    }`}
                    onClick={(e) => {
                      if (!compareMode) {
                        e.stopPropagation();
                        setLightboxImage({ url: card.imageUrl!, title: card.title });
                      }
                    }}
                  >
                    <img src={card.imageUrl} alt={card.title} className="h-full w-full object-cover" loading="lazy" />
                    {isSelected && (
                      <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">
                        ✓
                      </div>
                    )}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">{card.title}</h3>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const isFav = toggleFavorite(card);
                          setFavorites((prev) => {
                            const next = new Set(prev);
                            if (isFav) next.add(card.id);
                            else next.delete(card.id);
                            return next;
                          });
                        }}
                        className={`text-lg ${favorites.has(card.id) ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"}`}
                      >
                        {favorites.has(card.id) ? "★" : "☆"}
                      </button>
                      {card.variationLabel && (
                        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                          {card.variationLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  {card.description && (
                    <p className="mt-2 text-xs text-gray-500 line-clamp-3">{card.description}</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => {
                        if (card.imageUrl) {
                          const a = document.createElement("a");
                          a.href = card.imageUrl;
                          a.download = `${card.title}.png`;
                          a.click();
                        }
                      }}
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
              );
            })}
          </div>
        </div>
      ))}

      {/* 详情弹窗 */}
      {selectedCard && (
        <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} context={context} />
      )}

      {/* 图片放大 */}
      {lightboxImage && (
        <ImageLightbox
          imageUrl={lightboxImage.url}
          title={lightboxImage.title}
          onClose={() => setLightboxImage(null)}
        />
      )}

      {/* 对比视图 */}
      {showCompareView && compareCards.length >= 2 && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" onClick={() => setShowCompareView(false)}>
          <div className="flex items-center justify-between p-4">
            <h3 className="text-sm font-semibold text-white">方案对比（{compareCards.length}）</h3>
            <button
              onClick={() => setShowCompareView(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-2 gap-4">
              {compareCards.map((card) => (
                <div key={card.id} className="flex flex-col items-center">
                  {card.imageUrl && (
                    <img src={card.imageUrl} alt={card.title} className="w-full rounded-lg object-contain" style={{ maxHeight: "60vh" }} />
                  )}
                  <p className="mt-2 text-center text-xs text-white/80">{card.title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
