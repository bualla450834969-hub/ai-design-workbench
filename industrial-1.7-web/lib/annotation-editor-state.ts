import { fitAnnotationTextShape, type AnnotationCanvasSize, type AnnotationPoint, type AnnotationShape, type AnnotationTextMeasure } from "@/lib/annotation-geometry";

export type AnnotationTextDraft = AnnotationPoint & { value: string; id?: string };
export const ANNOTATION_TEXT_MAX_LENGTH = 2000;

/** Use the same finalized list for the preview, saved image, and editable data. */
export function commitAnnotationText(shapes: AnnotationShape[], draft: AnnotationTextDraft | null, style: { color: string; strokeSize: number; canvas?: AnnotationCanvasSize; measure?: AnnotationTextMeasure }, makeId: () => string = () => crypto.randomUUID()) {
  if (!draft) return shapes;
  const text = [...draft.value.replace(/\r\n?/g, "\n").trim()].slice(0, ANNOTATION_TEXT_MAX_LENGTH).join("");
  if (!text) return shapes;
  if (draft.id) return shapes.map((shape) => shape.id === draft.id ? fitAnnotationTextShape({ ...shape, text }, style.canvas, style.measure) : shape);
  return [...shapes, fitAnnotationTextShape({ id: makeId(), type: "text", color: style.color, strokeSize: style.strokeSize, fontSize: Math.max(24, style.strokeSize * 4), x1: draft.x, y1: draft.y, text }, style.canvas, style.measure)];
}

export function annotationTextPosition(point: AnnotationPoint, canvas: { width: number; height: number }, display: { width: number; height: number }, box: { width: number; height: number }) {
  const margin = 6;
  const width = Math.max(1, display.width);
  const height = Math.max(1, display.height);
  const x = point.x / Math.max(1, canvas.width) * width;
  const y = point.y / Math.max(1, canvas.height) * height - box.height / 2;
  return {
    left: Math.max(margin, Math.min(x, Math.max(margin, width - box.width - margin))) / width * 100,
    top: Math.max(margin, Math.min(y, Math.max(margin, height - box.height - margin))) / height * 100,
  };
}
