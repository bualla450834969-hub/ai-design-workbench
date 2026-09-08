"use client";

import { useState } from "react";
import type { ResultCard, HistoryRecord, PendingGenerateConfig } from "@/types";
import { MAX_HISTORY } from "@/constants";
import { loadHistory, deleteHistoryRecord, clearHistory, formatTime } from "@/utils";
import CardDetailModal, { type GenerationContext } from "@/components/CardDetailModal";
import ImageLightbox from "@/components/ImageLightbox";
import { useToast } from "@/components/Toast";

export default function HistoryPanel({ onReuseConfig }: { onReuseConfig: (config: PendingGenerateConfig) => void }) {
  const [records, setRecords] = useState<HistoryRecord[]>(() => loadHistory());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<ResultCard | null>(null);
  const [selectedContext, setSelectedContext] = useState<GenerationContext | undefined>(undefined);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; title: string } | null>(null);
  const { showToast } = useToast();

  const refresh = () => setRecords(loadHistory());

  const handleDelete = (id: string) => {
    if (confirm("确定删除这条记录吗？")) {
      deleteHistoryRecord(id);
      refresh();
      showToast("已删除记录", "success");
    }
  };

  const handleClearAll = () => {
    if (confirm("确定清空全部历史记录吗？此操作不可恢复。")) {
      clearHistory();
      refresh();
      showToast("已清空全部历史记录", "success");
    }
  };

  const handleDownload = (card: ResultCard) => {
    if (card.imageUrl) {
      const a = document.createElement("a");
      a.href = card.imageUrl;
      a.download = `${card.title || "设计方案"}.png`;
      a.click();
    }
  };

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 text-5xl text-gray-300">◷</div>
        <h3 className="text-sm font-medium text-gray-600">暂无历史记录</h3>
        <p className="mt-1 text-xs text-gray-400">生成的方案会自动保存在这里</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">历史记录（{records.length}）</h2>
        <button
          onClick={handleClearAll}
          className="text-xs text-red-500 hover:text-red-600"
        >
          清空全部
        </button>
      </div>

      <div className="space-y-3">
        {records.map((record) => {
          const isExpanded = expandedId === record.id;
          return (
            <div key={record.id} className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <button
                onClick={() => setExpandedId(isExpanded ? null : record.id)}
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-gray-50"
              >
                {/* 缩略图 */}
                <div className="flex h-14 w-14 shrink-0 gap-0.5 overflow-hidden rounded-lg bg-gray-100">
                  {record.cards.slice(0, 4).map((card, i) => (
                    <div key={i} className="flex-1 overflow-hidden">
                      {card.imageUrl ? (
                        <img src={card.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full bg-gray-200" />
                      )}
                    </div>
                  ))}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {record.productName}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-gray-500">
                    <span>{record.templateLabel}</span>
                    <span>·</span>
                    <span>{record.variationLevel}%重构</span>
                    <span>·</span>
                    <span>{record.cards.length}张</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-gray-400">
                    {formatTime(record.createdAt)}
                  </div>
                </div>

                <span className={`text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}>›</span>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50 p-3 space-y-3">
                  {/* 生成上下文 */}
                  <div className="rounded-lg bg-white p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-gray-700">生成上下文</h4>
                      <span className="text-[10px] text-gray-400">{formatTime(record.createdAt)}</span>
                    </div>

                    {/* 参数标签 */}
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                        {record.templateLabel}
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                        重构 {record.variationLevel}%
                      </span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                        {record.count} 张
                      </span>
                      {record.applicationMode && record.applicationMode !== "appearance-redesign" && (
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-600">
                          {record.applicationMode === "product-kit" ? "商品套图" : "详情页"}
                        </span>
                      )}
                      {record.hasLocalEdit && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                          局部改款
                        </span>
                      )}
                      {record.referenceImageCount && record.referenceImageCount > 0 && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                          {record.referenceImageCount} 张参考图
                        </span>
                      )}
                    </div>

                    {/* 产品原图缩略图 */}
                    {record.productImageThumbnails && record.productImageThumbnails.length > 0 && (
                      <div>
                        <p className="mb-1 text-[10px] font-medium text-gray-500">产品原图</p>
                        <div className="flex gap-1.5">
                          {record.productImageThumbnails.map((thumb, i) => (
                            <div
                              key={i}
                              className="h-14 w-14 cursor-zoom-in overflow-hidden rounded border border-gray-200"
                              onClick={() => setLightboxImage({ url: thumb, title: `产品原图 ${i + 1}` })}
                            >
                              <img src={thumb} alt={`原图 ${i + 1}`} className="h-full w-full object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 设计需求 */}
                    {record.notes && (
                      <div>
                        <p className="mb-1 text-[10px] font-medium text-gray-500">设计需求 / 备注</p>
                        <p className="text-[11px] text-gray-600 leading-relaxed whitespace-pre-wrap line-clamp-4">{record.notes}</p>
                      </div>
                    )}

                    {/* 局部改款说明 */}
                    {record.hasLocalEdit && record.editRegionInstruction && (
                      <div>
                        <p className="mb-1 text-[10px] font-medium text-gray-500">局部改款说明</p>
                        <p className="text-[11px] text-gray-600">{record.editRegionInstruction}</p>
                      </div>
                    )}
                  </div>

                  {/* 生成结果 */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {record.cards.map((card, idx) => (
                      <div key={idx} className="overflow-hidden rounded-lg bg-white shadow-sm">
                        {card.imageUrl ? (
                          <div
                            className="aspect-square w-full cursor-zoom-in overflow-hidden"
                            onClick={() => setLightboxImage({ url: card.imageUrl!, title: card.title })}
                          >
                            <img src={card.imageUrl} alt={card.title} className="h-full w-full object-cover" loading="lazy" />
                          </div>
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center bg-gray-100 text-xs text-gray-400">
                            无图
                          </div>
                        )}
                        <div className="p-2">
                          <div className="truncate text-xs font-medium text-gray-800">{card.title}</div>
                          <div className="mt-1.5 flex gap-1">
                            <button
                              onClick={() => handleDownload(card)}
                              className="flex-1 rounded bg-brand-600 py-1 text-[10px] font-medium text-white hover:bg-brand-700"
                            >
                              下载
                            </button>
                            <button
                              onClick={() => {
                                setSelectedCard(card);
                                setSelectedContext({
                                  productName: record.productName,
                                  templateLabel: record.templateLabel,
                                  variationLevel: record.variationLevel,
                                  notes: record.notes,
                                  applicationMode: record.applicationMode,
                                  productImageThumbnails: record.productImageThumbnails,
                                  referenceImageCount: record.referenceImageCount,
                                  hasLocalEdit: record.hasLocalEdit,
                                  editRegionIntent: record.editRegionIntent,
                                  editRegionInstruction: record.editRegionInstruction,
                                  commercePlatform: record.commercePlatform,
                                  commerceLocale: record.commerceLocale,
                                  kitPreset: record.kitPreset,
                                });
                              }}
                              className="flex-1 rounded border border-gray-200 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50"
                            >
                              详情
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-between">
                    <button
                      onClick={() => {
                        onReuseConfig({
                          productName: record.productName,
                          templateId: record.templateId,
                          variationLevel: record.variationLevel,
                          count: record.count,
                          notes: record.notes || "",
                        });
                      }}
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      ↻ 复用参数重新生成
                    </button>
                    <button
                      onClick={() => handleDelete(record.id)}
                      className="text-xs text-red-500 hover:text-red-600"
                    >
                      删除此记录
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-[10px] text-gray-400">
        最多保存 {MAX_HISTORY} 条，超出自动删除最旧记录 · 数据仅保存在本地浏览器
      </p>

      {/* 详情弹窗 */}
      {selectedCard && (
        <CardDetailModal card={selectedCard} onClose={() => setSelectedCard(null)} context={selectedContext} />
      )}

      {/* 图片放大 */}
      {lightboxImage && (
        <ImageLightbox
          imageUrl={lightboxImage.url}
          title={lightboxImage.title}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
}
