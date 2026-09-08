"use client";

import type { ResultCard } from "@/types";

export type GenerationContext = {
  productName?: string;
  templateLabel?: string;
  variationLevel?: number;
  notes?: string;
  applicationMode?: string;
  productImageThumbnails?: string[];
  referenceImageCount?: number;
  hasLocalEdit?: boolean;
  editRegionIntent?: string;
  editRegionInstruction?: string;
  commercePlatform?: string;
  commerceLocale?: string;
  kitPreset?: string;
};

export default function CardDetailModal({
  card,
  onClose,
  context,
}: {
  card: ResultCard;
  onClose: () => void;
  context?: GenerationContext;
}) {
  const hasContext =
    context &&
    (context.productImageThumbnails?.length ||
      context.notes ||
      context.templateLabel ||
      context.variationLevel !== undefined ||
      context.referenceImageCount ||
      context.hasLocalEdit);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{card.title}</h3>
            {card.designDirectionLabel && (
              <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                {card.designDirectionLabel}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 大图 */}
          {card.imageUrl && (
            <div className="overflow-hidden rounded-xl bg-gray-100">
              <img src={card.imageUrl} alt={card.title} className="w-full object-contain" />
            </div>
          )}

          {/* 生成上下文 */}
          {hasContext && context && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
              <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-500"></span>
                生成上下文
              </h4>

              {/* 参数标签 */}
              <div className="flex flex-wrap gap-1.5">
                {context.templateLabel && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                    {context.templateLabel}
                  </span>
                )}
                {context.variationLevel !== undefined && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                    重构 {context.variationLevel}%
                  </span>
                )}
                {context.applicationMode && context.applicationMode !== "appearance-redesign" && (
                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-600">
                    {context.applicationMode === "product-kit" ? "商品套图" : "详情页"}
                  </span>
                )}
                {context.hasLocalEdit && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-600">
                    局部改款
                  </span>
                )}
                {context.referenceImageCount && context.referenceImageCount > 0 && (
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                    {context.referenceImageCount} 张参考图
                  </span>
                )}
              </div>

              {/* 产品原图缩略图 */}
              {context.productImageThumbnails && context.productImageThumbnails.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium text-gray-500">产品原图</p>
                  <div className="flex gap-2">
                    {context.productImageThumbnails.map((thumb, i) => (
                      <div
                        key={i}
                        className="h-16 w-16 overflow-hidden rounded-lg border border-gray-200 bg-white"
                      >
                        <img src={thumb} alt={`原图 ${i + 1}`} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 设计需求 */}
              {context.notes && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium text-gray-500">设计需求 / 备注</p>
                  <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">{context.notes}</p>
                </div>
              )}

              {/* 局部改款说明 */}
              {context.hasLocalEdit && context.editRegionInstruction && (
                <div>
                  <p className="mb-1.5 text-[10px] font-medium text-gray-500">局部改款说明</p>
                  <p className="text-xs text-gray-600">{context.editRegionInstruction}</p>
                </div>
              )}
            </div>
          )}

          {/* 质量警告 */}
          {card.qualityWarning && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
              <span className="font-medium">质量提示：</span>{card.qualityWarning}
            </div>
          )}

          {/* 设计说明 */}
          {card.description && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-gray-700">设计说明</h4>
              <p className="text-sm text-gray-600 leading-relaxed">{card.description}</p>
            </div>
          )}

          {/* 卖点 */}
          {card.sellingPoints && card.sellingPoints.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-gray-700">核心卖点</h4>
              <ul className="space-y-1.5">
                {card.sellingPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-600">
                      {i + 1}
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 材质工艺 */}
          {card.materialProcess && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-gray-700">材质与工艺</h4>
              <p className="text-sm text-gray-600 leading-relaxed">{card.materialProcess}</p>
            </div>
          )}

          {/* 与原图差异 */}
          {card.difference && (
            <div>
              <h4 className="mb-2 text-xs font-semibold text-gray-700">与原图的核心差异</h4>
              <p className="text-sm text-gray-600 leading-relaxed">{card.difference}</p>
            </div>
          )}

          {/* 下载按钮 */}
          {card.imageUrl && (
            <button
              onClick={() => {
                const a = document.createElement("a");
                a.href = card.imageUrl!;
                a.download = `${card.title}.png`;
                a.click();
              }}
              className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white hover:bg-brand-700"
            >
              下载高清图
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
