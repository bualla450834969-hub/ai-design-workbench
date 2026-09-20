"use client";

import { useEffect } from "react";
import { downloadImage } from "@/utils/file-save";
import { useToast } from "@/components/Toast";

export default function ImageLightbox({ 
  imageUrl, 
  title, 
  onClose,
  onUseAsOriginal 
}: { 
  imageUrl: string; 
  title?: string; 
  onClose: () => void;
  onUseAsOriginal?: (imageUrl: string) => void;
}) {
  const { showToast } = useToast();

  // ESC 键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  const handleDownload = async () => {
    const success = await downloadImage(imageUrl, `${title || "设计方案"}.png`);
    if (success) {
      showToast("图片已开始下载", "success");
    } else {
      showToast("下载失败，请重试", "error");
    }
  };

  const handleUseAsOriginal = () => {
    if (onUseAsOriginal) {
      onUseAsOriginal(imageUrl);
      showToast("已设为原图，跳转到生成页面", "success");
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/95 p-4"
      onClick={onClose}
    >
      {/* 关闭按钮 - 更明显 */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-xl text-white hover:bg-white/30 transition-all backdrop-blur-sm"
        aria-label="关闭"
      >
        ✕
      </button>

      {/* 提示文字 */}
      <div className="absolute top-4 left-4 text-xs text-white/50">
        点击空白处或按 ESC 关闭
      </div>

      {title && (
        <div className="mb-4 text-center text-base font-medium text-white/90">{title}</div>
      )}

      <img
        src={imageUrl}
        alt={title || "预览"}
        className="max-h-[75vh] max-w-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      <div className="mt-6 flex gap-3">
        {onUseAsOriginal && (
          <button
            onClick={handleUseAsOriginal}
            className="rounded-lg bg-indigo-500/80 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-all backdrop-blur-sm"
          >
            以此为原图
          </button>
        )}
        <button
          onClick={handleDownload}
          className="rounded-lg bg-white/15 px-6 py-2.5 text-sm font-medium text-white hover:bg-white/25 transition-all backdrop-blur-sm"
        >
          下载原图
        </button>
        <button
          onClick={onClose}
          className="rounded-lg bg-white/5 px-6 py-2.5 text-sm font-medium text-white/70 hover:bg-white/15 transition-all"
        >
          返回
        </button>
      </div>
    </div>
  );
}
