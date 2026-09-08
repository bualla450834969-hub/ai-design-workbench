"use client";

export default function ImageLightbox({ imageUrl, title, onClose }: { imageUrl: string; title?: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        ✕
      </button>
      {title && (
        <div className="mb-4 text-center text-sm font-medium text-white/80">{title}</div>
      )}
      <img
        src={imageUrl}
        alt={title || "预览"}
        className="max-h-[80vh] max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <a
        href={imageUrl}
        download={`${title || "设计方案"}.png`}
        className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-xs font-medium text-white hover:bg-white/20"
        onClick={(e) => e.stopPropagation()}
      >
        下载原图
      </a>
    </div>
  );
}
