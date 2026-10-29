"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { downloadImage } from "@/utils/file-save";
import { useToast } from "@/components/Toast";

type FrameSize = { width: number; height: number };

function fitFrame(naturalWidth: number, naturalHeight: number): FrameSize {
  const maxWidth = Math.max(120, window.innerWidth - 24);
  const maxHeight = Math.max(120, window.innerHeight - 132);
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

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
  const [natural, setNatural] = useState<FrameSize | null>(null);
  const [frame, setFrame] = useState<FrameSize | null>(null);

  const applySize = useCallback((width: number, height: number) => {
    if (!width || !height) return;
    setNatural({ width, height });
    setFrame(fitFrame(width, height));
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setNatural(null);
    setFrame(null);
  }, [imageUrl]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  useEffect(() => {
    if (!natural) return;
    const onResize = () => setFrame(fitFrame(natural.width, natural.height));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [natural]);

  const handleDownload = async () => {
    const success = await downloadImage(imageUrl, `${title || "设计方案"}.png`);
    showToast(success ? "图片已开始下载" : "下载失败，请重试", success ? "success" : "error");
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-3"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="fixed right-3 top-3 z-[81] flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-xl text-white"
        aria-label="关闭"
      >
        ✕
      </button>

      <div
        className="flex max-h-full max-w-full flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-2 max-w-full px-2 text-center text-sm font-medium text-white sm:text-base">
            {title}
          </div>
        )}

        <img
          src={imageUrl}
          alt={title || "预览"}
          draggable={false}
          width={frame?.width}
          height={frame?.height}
          style={
            frame
              ? { width: frame.width, height: frame.height, maxWidth: "none", flex: "0 0 auto" }
              : { width: "auto", height: "auto", maxWidth: "calc(100vw - 24px)", maxHeight: "calc(100vh - 132px)" }
          }
          className="block rounded-lg shadow-2xl"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0 && img.naturalHeight > 0) {
              applySize(img.naturalWidth, img.naturalHeight);
            }
          }}
        />

        <div className="mt-3 flex max-w-full flex-wrap items-center justify-center gap-2">
          {onUseAsOriginal && (
            <button
              type="button"
              onClick={() => {
                onUseAsOriginal(imageUrl);
                showToast("已设为原图，跳转到生成页面", "success");
              }}
              className="rounded-lg bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white"
            >
              以此为原图
            </button>
          )}
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-gray-900"
          >
            下载原图
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/15 px-5 py-2.5 text-sm font-medium text-white"
          >
            返回
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
