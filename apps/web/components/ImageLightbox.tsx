"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] overflow-y-auto overscroll-contain bg-black/50"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="fixed right-3 top-3 z-[81] flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl text-white hover:bg-black/80"
        aria-label="关闭"
      >
        ✕
      </button>

      <div className="pointer-events-none fixed left-4 top-4 z-[81] text-xs text-white/80">
        点击空白处或按 ESC 关闭
      </div>

      {/*
        Portaled to document.body so the fade-in transform on the history/results
        panel cannot trap this fixed layer inside a narrower column.
        The image is exactly the viewport width; height follows the bitmap.
      */}
      <div className="flex min-h-full w-full flex-col">
        {title && (
          <div
            className="px-14 py-3 text-center text-sm font-medium text-white sm:text-base"
            onClick={(e) => e.stopPropagation()}
          >
            {title}
          </div>
        )}

        <img
          src={imageUrl}
          alt={title || "预览"}
          draggable={false}
          className="block h-auto w-full max-w-none"
          style={{ width: "100%", height: "auto" }}
          onClick={(e) => e.stopPropagation()}
        />

        <div
          className="flex w-full flex-wrap items-center justify-center gap-3 px-4 py-4"
          onClick={(e) => e.stopPropagation()}
        >
          {onUseAsOriginal && (
            <button
              type="button"
              onClick={handleUseAsOriginal}
              className="rounded-lg bg-indigo-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-400"
            >
              以此为原图
            </button>
          )}
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-gray-900 hover:bg-white/90"
          >
            下载原图
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/15 px-6 py-2.5 text-sm font-medium text-white hover:bg-white/25"
          >
            返回
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
