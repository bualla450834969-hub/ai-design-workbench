"use client";

import { useState, useRef, useEffect } from "react";

export default function LocalEditMask({
  backgroundImage,
  onMaskChange,
}: {
  backgroundImage: string;
  onMaskChange: (maskDataUrl: string | null, guideDataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(30);
  const [mode, setMode] = useState<"brush" | "eraser">("brush");
  const [hasMask, setHasMask] = useState(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const maxWidth = container.clientWidth;
      const scale = Math.min(maxWidth / img.width, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    img.src = backgroundImage;
  }, [backgroundImage]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const draw = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = brushSize;

    if (mode === "brush") {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0, 0, 0, 1)";
    }

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    lastPos.current = pos;
    draw(pos, pos);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    if (lastPos.current) {
      draw(lastPos.current, pos);
    }
    lastPos.current = pos;
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    lastPos.current = null;
    updateMask();
  };

  const updateMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let hasContent = false;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 0) {
        hasContent = true;
        break;
      }
    }

    setHasMask(hasContent);
    if (hasContent) {
      // 1. 生成黑白蒙版
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext("2d");
      if (maskCtx) {
        maskCtx.fillStyle = "#000000";
        maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        maskCtx.drawImage(canvas, 0, 0);
      }
      const maskDataUrl = maskCanvas.toDataURL("image/png");

      // 2. 生成青蓝色半透明位置引导图
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const guideCanvas = document.createElement("canvas");
        guideCanvas.width = canvas.width;
        guideCanvas.height = canvas.height;
        const guideCtx = guideCanvas.getContext("2d");
        if (guideCtx) {
          guideCtx.drawImage(img, 0, 0, guideCanvas.width, guideCanvas.height);

          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const tempCtx = tempCanvas.getContext("2d");
          if (tempCtx) {
            tempCtx.drawImage(canvas, 0, 0);
            tempCtx.globalCompositeOperation = "source-in";
            tempCtx.fillStyle = "#00b4ff";
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
          }

          guideCtx.globalAlpha = 0.45;
          guideCtx.drawImage(tempCanvas, 0, 0);
          guideCtx.globalAlpha = 1;
        }
        const guideDataUrl = guideCanvas.toDataURL("image/png");
        onMaskChange(maskDataUrl, guideDataUrl);
      };
      img.src = backgroundImage;
    } else {
      onMaskChange(null, null);
    }
  };

  const clearMask = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasMask(false);
    onMaskChange(null, null);
  };

  return (
    <div className="space-y-3">
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            onClick={() => setMode("brush")}
            className={`px-3 py-1.5 text-xs font-medium ${mode === "brush" ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            画笔
          </button>
          <button
            onClick={() => setMode("eraser")}
            className={`px-3 py-1.5 text-xs font-medium ${mode === "eraser" ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
          >
            橡皮
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">笔刷</span>
          <input
            type="range"
            min={10}
            max={80}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-20 accent-brand-600"
          />
          <span className="text-xs text-gray-500 w-6">{brushSize}</span>
        </div>
        <button
          onClick={clearMask}
          className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-red-500"
        >
          清空
        </button>
        {hasMask && (
          <span className="text-xs text-green-600 font-medium">✓ 已标记区域</span>
        )}
      </div>

      {/* 画布区域 */}
      <div ref={containerRef} className="relative w-full overflow-hidden rounded-lg border border-gray-200">
        <img
          src={backgroundImage}
          alt="产品图"
          className="w-full object-contain"
          style={{ display: "block" }}
        />
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="absolute inset-0 w-full h-full cursor-crosshair touch-none"
          style={{ pointerEvents: "auto" }}
        />
      </div>
      <p className="text-[10px] text-gray-400">
        在需要修改的区域涂抹（白色区域），AI 只会修改涂抹范围内的部分
      </p>
    </div>
  );
}
