"use client";

// 将跨域图片URL转为本地代理URL
function getProxyImageUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/api/") || url.startsWith("data:")) return url;
  return `/api/image-proxy?url=${encodeURIComponent(url)}`;
}

import { useState, useEffect } from "react";
import type { ResultCard, BatchResultGroup } from "@/types";
import { loadFavorites, toggleFavorite } from "@/utils";
import { downloadImage } from "@/utils/file-save";
import CardDetailModal, { type GenerationContext } from "@/components/CardDetailModal";
import ImageLightbox from "@/components/ImageLightbox";
import { useToast } from "@/components/Toast";

export default function ResultsPanel({ cards, batchGroups, isGenerating, context, onUseAsOriginal }: { cards: ResultCard[]; batchGroups: BatchResultGroup[]; isGenerating: boolean; context?: GenerationContext; onUseAsOriginal?: (imageUrl: string) => void }) {
  const { showToast } = useToast();
  const [selectedCard, setSelectedCard] = useState<ResultCard | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [showCompareView, setShowCompareView] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [isGenerating3D, setIsGenerating3D] = useState(false);
  const [progress3D, setProgress3D] = useState(0);
  const [model3DUrl, setModel3DUrl] = useState<string | null>(null);
  const [error3D, setError3D] = useState<string | null>(null);

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

  const generate3DModel = async () => {
    const apiKey = localStorage.getItem("tripoApiKey") || "";
    if (!apiKey) {
      showToast("请先在设置页面配置 Tripo API Key", "error");
      return;
    }

    // Tripo multiview-to-model 需要的顺序是 [front, left, back, right]
    // 我们的六视图顺序是 [正面, 背面, 左侧, 右侧, 顶部, 底部, 纯正交正面]
    // 所以需要重新排序：取第1张(front)、第3张(left)、第2张(back)、第4张(right)
    const getUrl = (i: number): string => allCards[i]?.imageUrl || "";
    const images: string[] = allCards.length >= 4
      ? [getUrl(0), getUrl(2), getUrl(1), getUrl(3)].filter((u): u is string => !!u)
      : allCards.map((c) => c.imageUrl).filter((u): u is string => !!u);
    if (images.length < 4) {
      showToast("需要至少4张图片才能生成3D模型", "error");
      return;
    }

    setIsGenerating3D(true);
    setProgress3D(0);
    setError3D(null);
    setModel3DUrl(null);

    try {
      // 提交生成任务
      const res = await fetch("/api/3d/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, images }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提交失败");

      const taskId = data.taskId;
      showToast("3D模型生成任务已提交，约需1-3分钟", "info");

      // 轮询任务状态
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/3d/status?apiKey=${encodeURIComponent(apiKey)}&taskId=${taskId}`);
          const statusData = await statusRes.json();

          if (statusData.progress) {
            setProgress3D(statusData.progress);
          }

          if (statusData.status === "success") {
            clearInterval(pollInterval);
            setModel3DUrl(statusData.modelUrl);
            setIsGenerating3D(false);
            showToast("3D模型生成成功！", "success");
          } else if (statusData.status === "failed" || statusData.status === "cancelled") {
            clearInterval(pollInterval);
            setError3D(statusData.error || "生成失败");
            setIsGenerating3D(false);
          }
        } catch (e) {
          // 忽略轮询错误，继续
        }
      }, 3000);

      // 5分钟超时
      setTimeout(() => {
        clearInterval(pollInterval);
        if (isGenerating3D) {
          setError3D("生成超时，请稍后重试");
          setIsGenerating3D(false);
        }
      }, 300000);

    } catch (error) {
      setError3D(error instanceof Error ? error.message : "生成失败");
      setIsGenerating3D(false);
      showToast(error instanceof Error ? error.message : "3D模型生成失败", "error");
    }
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
                onClick={async () => {
                  let idx = 0;
                  let successCount = 0;
                  for (const group of displayGroups) {
                    for (const card of group.cards) {
                      if (card.imageUrl) {
                        const prefix = isBatchResult ? `${group.name}-` : "";
                        const filename = `${prefix}${card.title || "方案"}-${idx + 1}.png`;
                        const success = await downloadImage(card.imageUrl, filename);
                        if (success) successCount++;
                        idx++;
                        await new Promise((r) => setTimeout(r, 300));
                      }
                    }
                  }
                  showToast(`已下载 ${successCount}/${idx} 张图片`, successCount > 0 ? "success" : "error");
                }}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                全部下载
              </button>
            )}
            {false && totalCards >= 4 && (
              <button
                onClick={generate3DModel}
                disabled={isGenerating3D}
                className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {isGenerating3D ? `生成3D中 ${progress3D}%` : "生成3D模型"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 3D模型生成结果 */}
      {false && (isGenerating3D || model3DUrl || error3D) && (
        <div className="mb-4 rounded-xl border border-purple-200 bg-purple-50 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-purple-900">3D 模型生成</h3>
            <button
              onClick={() => { setModel3DUrl(null); setError3D(null); setIsGenerating3D(false); }}
              className="text-xs text-purple-500 hover:text-purple-700"
            >
              关闭
            </button>
          </div>
          {isGenerating3D && (
            <div className="mt-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-purple-200">
                <div
                  className="h-full bg-purple-600 transition-all duration-500"
                  style={{ width: `${progress3D}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-purple-600">正在生成3D模型，约需1-3分钟...</p>
            </div>
          )}
          {error3D && (
            <p className="mt-2 text-xs text-red-600">{error3D}</p>
          )}
          {model3DUrl && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-purple-700">3D模型生成成功！</p>
              <div className="flex gap-2">
                <a
                  href={model3DUrl || undefined}
                  download="3d-model.glb"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
                >
                  下载 .glb 模型
                </a>
                <a
                  href={model3DUrl || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-lg border border-purple-300 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-100"
                >
                  在新标签页打开
                </a>
              </div>
              <p className="text-[10px] text-purple-500">提示：.glb 文件可在 Blender、Unity、Unreal 等3D软件中打开</p>
            </div>
          )}
        </div>
      )}
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
                className={`glass-card overflow-hidden rounded-2xl transition-all ${
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
                    <img src={getProxyImageUrl(card.imageUrl)} alt={card.title} className="h-full w-full object-cover" loading="lazy" />
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
                      onClick={async () => {
                        if (card.imageUrl) {
                          const success = await downloadImage(card.imageUrl, `${card.title || "设计方案"}.png`);
                          if (success) {
                            showToast("图片已开始下载", "success");
                          } else {
                            showToast("下载失败，请重试", "error");
                          }
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
          onUseAsOriginal={onUseAsOriginal ? (url) => {
            onUseAsOriginal(url);
            setLightboxImage(null);
          } : undefined}
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
                    <img src={getProxyImageUrl(card.imageUrl)} alt={card.title} className="w-full rounded-lg object-contain" style={{ maxHeight: "60vh" }} />
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
