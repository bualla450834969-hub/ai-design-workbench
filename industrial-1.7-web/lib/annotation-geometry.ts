export type AnnotationPoint = { x: number; y: number };

export type AnnotationShape = {
  id: string;
  type: "freehand" | "rectangle" | "ellipse" | "arrow" | "text";
  color: string;
  strokeSize: number;
  x1: number;
  y1: number;
  x2?: number;
  y2?: number;
  points?: AnnotationPoint[];
  text?: string;
  fontSize?: number;
  /** Canvas pixels; absent in older single-line annotations. */
  textWidth?: number;
};

export type AnnotationResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "start" | "end";
export type AnnotationCanvasSize = { width: number; height: number };
export type AnnotationTextMeasure = (text: string, fontSize: number) => number;

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function annotationTextFontSize(shape: AnnotationShape) {
  return shape.fontSize ?? Math.max(24, shape.strokeSize * 4);
}

function textWidthUnits(value: string) {
  return Math.max(1, [...value].reduce((width, character) => width + (/[\u0000-\u00ff]/.test(character) ? 0.62 : 1), 0));
}

/** Keep explicit line breaks, and wrap even an unspaced Chinese sentence or URL. */
export function wrapAnnotationText(text: string, maxWidth: number, fontSize: number, measure: AnnotationTextMeasure = (value, size) => textWidthUnits(value) * size) {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const character of paragraph) {
      if (line && measure(line + character, fontSize) > maxWidth) { lines.push(line); line = character; }
      else line += character;
    }
    lines.push(line);
  }
  return lines;
}

/** The renderer, selection box, handles, and hit tests all use this layout. */
export function annotationTextLayout(shape: AnnotationShape, canvas?: AnnotationCanvasSize, measure: AnnotationTextMeasure = (value, size) => textWidthUnits(value) * size) {
  const fontSize = annotationTextFontSize(shape);
  const widthLimit = shape.textWidth ?? (canvas ? Math.max(fontSize, canvas.width * 0.55) : Infinity);
  const maxWidth = canvas ? Math.min(widthLimit, Math.max(1, canvas.width - annotationTextMargin(canvas) * 2)) : widthLimit;
  const lines = wrapAnnotationText(shape.text || "", maxWidth, fontSize, measure);
  const lineHeight = fontSize * 1.25;
  const width = Math.max(fontSize * 0.25, ...lines.map((line) => line ? measure(line, fontSize) : 0));
  return {
    lines, fontSize, lineHeight, maxWidth,
    bounds: { left: shape.x1, right: shape.x1 + width, top: shape.y1 - fontSize, bottom: shape.y1 + (lines.length - 1) * lineHeight + fontSize * 0.25 },
  };
}

function annotationTextMargin(canvas: AnnotationCanvasSize) { return Math.max(0, Math.min(6, canvas.width * 0.006, canvas.height * 0.006)); }

/** Avoid cutting off text at either edge, including old annotations and very long notes. */
export function fitAnnotationTextShape(shape: AnnotationShape, canvas?: AnnotationCanvasSize, measure?: AnnotationTextMeasure): AnnotationShape {
  if (shape.type !== "text" || !canvas) return shape;
  const margin = annotationTextMargin(canvas);
  const availableWidth = Math.max(1, canvas.width - margin * 2), availableHeight = Math.max(1, canvas.height - margin * 2);
  const textWidth = Math.min(shape.textWidth ?? Math.max(annotationTextFontSize(shape), canvas.width * 0.55), availableWidth);
  let fitted = { ...shape, textWidth };
  const fits = (size: number) => {
    const layout = annotationTextLayout({ ...fitted, fontSize: size }, canvas, measure);
    return layout.bounds.right - layout.bounds.left <= availableWidth && layout.bounds.bottom - layout.bounds.top <= availableHeight;
  };
  if (!fits(annotationTextFontSize(fitted))) {
    let low = 0, high = annotationTextFontSize(fitted);
    for (let attempt = 0; attempt < 24; attempt++) { const middle = (low + high) / 2; if (fits(middle)) low = middle; else high = middle; }
    fitted = { ...fitted, fontSize: Math.max(0.001, low) };
  }
  const layout = annotationTextLayout(fitted, canvas, measure);
  const width = layout.bounds.right - layout.bounds.left, height = layout.bounds.bottom - layout.bounds.top;
  return { ...fitted, x1: clamp(fitted.x1, margin, canvas.width - margin - width), y1: clamp(fitted.y1, margin + layout.fontSize, canvas.height - margin - height + layout.fontSize) };
}

export function annotationPointFromDisplay(input: {
  offsetX: number;
  offsetY: number;
  displayWidth: number;
  displayHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}): AnnotationPoint {
  const displayWidth = Math.max(1, input.displayWidth);
  const displayHeight = Math.max(1, input.displayHeight);
  return {
    x: clamp(input.offsetX * input.canvasWidth / displayWidth, 0, input.canvasWidth),
    y: clamp(input.offsetY * input.canvasHeight / displayHeight, 0, input.canvasHeight),
  };
}

export function annotationBounds(shape: AnnotationShape, canvas?: AnnotationCanvasSize, measure?: AnnotationTextMeasure) {
  if (shape.points?.length) {
    const xs = shape.points.map((item) => item.x);
    const ys = shape.points.map((item) => item.y);
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
  }
  const x2 = shape.x2 ?? shape.x1;
  const y2 = shape.y2 ?? shape.y1;
  if (shape.type === "text") {
    return annotationTextLayout(shape, canvas, measure).bounds;
  }
  return { left: Math.min(shape.x1, x2), right: Math.max(shape.x1, x2), top: Math.min(shape.y1, y2), bottom: Math.max(shape.y1, y2) };
}

export function annotationResizeHandles(shape: AnnotationShape, canvas?: AnnotationCanvasSize, measure?: AnnotationTextMeasure): Partial<Record<AnnotationResizeHandle, AnnotationPoint>> {
  if (shape.type === "text") {
    const box = annotationBounds(shape, canvas, measure);
    return { se: { x: box.right, y: box.bottom } };
  }
  if (shape.type === "arrow") {
    return {
      start: { x: shape.x1, y: shape.y1 },
      end: { x: shape.x2 ?? shape.x1, y: shape.y2 ?? shape.y1 },
    };
  }
  if (shape.type !== "rectangle" && shape.type !== "ellipse") return {};
  const box = annotationBounds(shape);
  const middleX = (box.left + box.right) / 2;
  const middleY = (box.top + box.bottom) / 2;
  return {
    nw: { x: box.left, y: box.top }, n: { x: middleX, y: box.top }, ne: { x: box.right, y: box.top },
    e: { x: box.right, y: middleY }, se: { x: box.right, y: box.bottom }, s: { x: middleX, y: box.bottom },
    sw: { x: box.left, y: box.bottom }, w: { x: box.left, y: middleY },
  };
}

export function hitAnnotationResizeHandle(shape: AnnotationShape, point: AnnotationPoint, tolerance: number, canvas?: AnnotationCanvasSize, measure?: AnnotationTextMeasure): AnnotationResizeHandle | null {
  const handles = annotationResizeHandles(shape, canvas, measure);
  let nearest: { handle: AnnotationResizeHandle; distance: number } | null = null;
  for (const [handle, position] of Object.entries(handles) as [AnnotationResizeHandle, AnnotationPoint][]) {
    const distance = Math.hypot(position.x - point.x, position.y - point.y);
    if (distance <= tolerance && (!nearest || distance < nearest.distance)) nearest = { handle, distance };
  }
  return nearest?.handle || null;
}

export function resizeAnnotationShape(shape: AnnotationShape, handle: AnnotationResizeHandle, point: AnnotationPoint, minimumSize = 8, canvas?: AnnotationCanvasSize, measure?: AnnotationTextMeasure): AnnotationShape {
  if (shape.type === "text") {
    if (handle !== "se") return shape;
    const box = annotationBounds(shape, canvas, measure);
    const previousSize = annotationTextFontSize(shape);
    const widthSize = previousSize * (point.x - box.left) / Math.max(1, box.right - box.left);
    const heightSize = previousSize * (point.y - box.top) / Math.max(1, box.bottom - box.top);
    const widthChange = Math.abs(widthSize - previousSize);
    const heightChange = Math.abs(heightSize - previousSize);
    const fontSize = clamp(widthChange >= heightChange ? widthSize : heightSize, minimumSize, 300);
    return fitAnnotationTextShape({ ...shape, fontSize, ...(shape.textWidth === undefined ? {} : { textWidth: shape.textWidth * fontSize / previousSize }) }, canvas, measure);
  }
  if (shape.type === "arrow") {
    if (handle === "start") return { ...shape, x1: point.x, y1: point.y };
    if (handle === "end") return { ...shape, x2: point.x, y2: point.y };
    return shape;
  }
  if (shape.type !== "rectangle" && shape.type !== "ellipse") return shape;
  const box = annotationBounds(shape);
  let { left, right, top, bottom } = box;
  if (handle.includes("w")) left = Math.min(point.x, right - minimumSize);
  if (handle.includes("e")) right = Math.max(point.x, left + minimumSize);
  if (handle === "n" || handle === "nw" || handle === "ne") top = Math.min(point.y, bottom - minimumSize);
  if (handle === "s" || handle === "sw" || handle === "se") bottom = Math.max(point.y, top + minimumSize);
  return { ...shape, x1: left, y1: top, x2: right, y2: bottom };
}

export function translateAnnotationShape(shape: AnnotationShape, dx: number, dy: number, canvas?: AnnotationCanvasSize, measure?: AnnotationTextMeasure): AnnotationShape {
  return fitAnnotationTextShape({
    ...shape,
    x1: shape.x1 + dx,
    y1: shape.y1 + dy,
    x2: shape.x2 === undefined ? undefined : shape.x2 + dx,
    y2: shape.y2 === undefined ? undefined : shape.y2 + dy,
    points: shape.points?.map((point) => ({ x: point.x + dx, y: point.y + dy })),
  }, canvas, measure);
}
