"use client";

import { useCallback, useEffect, useState } from "react";
import { downloadImage } from "@/utils/file-save";
import { useToast } from "@/components/Toast";

type FrameSize = { width: number; height: number };

/** Largest on-screen size that keeps the picture's own aspect ratio. */
function fitFrame(naturalWidth: number, naturalHeight: number): FrameSize {
  const maxWidth = Math.max(160, window.innerWidth - 48);
  const maxHeight = Math.max(160, window.innerHeight - 168);
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight);
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

function sizeFromSvg(url: string): FrameSize | null {
  if (!url.startsWith("data:image/svg+xml")) return null;
  const comma = url.indexOf(",");
  if (comma < 0) return null;
  const payload = url.slice(comma + 1);
  let text = "";
  try {
    text = url.includes(";base64") ? atob(payload) : decodeURIComponent(payload);
  } catch {
    return null;
  }
  const width = Number(text.match(/\bwidth=["']([\d.]+)/)?.[1] || 0);
  const height = Number(text.match(/\bheight=["']([\d.]+)/)?.[1] || 0);
  if (width > 0 && height > 0) return { width, height };
  const viewBox = text.match(/viewBox=["']\s*[\d.+-]+\s+[\d.+-]+\s+([\d.]+)\s+([\d.]+)/);
  if (!viewBox) return null;
  return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
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
  const [natural, setNatural] = useState<FrameSize | null>(null);
  const [frame, setFrame] = useState<FrameSize | null>(null);

  const applySize = useCallback((width: number, height: number) => {
    if (!width || !height) return;
    const next = { width, height };
    setNatural(next);
    setFrame(fitFrame(width, height));
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-xl text-white hover:bg-black/70 transition-all backdrop-blur-sm"
        aria-label="关闭"
      >
        ✕
      </button>

      <div className="absolute top-4 left-4 z-10 text-xs text-white/70">
        点击空白处或按 ESC 关闭
      </div>

      <div
        className="flex max-h-full max-w-full flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-3 max-w-[calc(100vw-2rem)] text-center text-base font-medium text-white drop-shadow">
            {title}
          </div>
        )}

        {/* Width and height are the fitted image size, so the box cannot letterbox. */}
        <img
          src={imageUrl}
          alt={title || "预览"}
          width={frame?.width}
          height={frame?.height}
          style={frame ? { width: frame.width, height: frame.height } : undefined}
          className={
            frame
              ? "block max-w-none rounded-lg shadow-2xl"
              : "block h-auto w-auto max-h-[min(75vh,calc(100vh-11rem))] max-w-[calc(100vw-3rem)] rounded-lg shadow-2xl"
          }
          onLoad={(e) => {
            const img = e.currentTarget;
            const fromElement =
              img.naturalWidth > 0 && img.naturalHeight > 0
                ? { width: img.naturalWidth, height: img.naturalHeight }
                : null;
            const size = fromElement || sizeFromSvg(imageUrl);
            if (size) applySize(size.width, size.height);
          }}
        />

        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          {onUseAsOriginal && (
            <button
              onClick={handleUseAsOriginal}
              className="rounded-lg bg-indigo-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-400 transition-all"
            >
              以此为原图
            </button>
          )}
          <button
            onClick={handleDownload}
            className="rounded-lg bg-white/90 px-6 py-2.5 text-sm font-medium text-gray-900 hover:bg-white transition-all"
          >
            下载原图
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-white/15 px-6 py-2.5 text-sm font-medium text-white hover:bg-white/25 transition-all"
          >
            返回
          </button>
        </div>
      </div>
    </div>
  );
}
