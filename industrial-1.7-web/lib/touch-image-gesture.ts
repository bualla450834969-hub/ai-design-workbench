import { clampImagePreviewScale, type ImagePreviewView } from "./image-preview-state";

export type ImageTouchPoint = { id: number; x: number; y: number };
export type ImageTouchTap = { x: number; y: number; time: number };
export type ImageTouchGesture = {
  pointers: ImageTouchPoint[];
  origin: { view: ImagePreviewView; x: number; y: number; distance: number };
  moved: boolean;
  pinched: boolean;
};

function origin(pointers: ImageTouchPoint[], view: ImagePreviewView) {
  const [first, second = first] = pointers;
  return {
    view,
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
    distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
  };
}

/** Keep at most two fingers; extra fingers cannot replace either gesture owner. */
export function beginImageTouch(gesture: ImageTouchGesture | null, pointer: ImageTouchPoint, view: ImagePreviewView): ImageTouchGesture {
  if (gesture && (gesture.pointers.some((item) => item.id === pointer.id) || gesture.pointers.length >= 2)) return gesture;
  const pointers = [...(gesture?.pointers || []), pointer];
  return { pointers, origin: origin(pointers, view), moved: gesture?.moved || false, pinched: Boolean(gesture?.pinched || pointers.length === 2) };
}

/** Coordinates are relative to the viewport centre, matching the image transform. */
export function moveImageTouch(gesture: ImageTouchGesture, pointer: ImageTouchPoint): { gesture: ImageTouchGesture; view: ImagePreviewView } | null {
  if (!gesture.pointers.some((item) => item.id === pointer.id)) return null;
  const pointers = gesture.pointers.map((item) => item.id === pointer.id ? pointer : item);
  const current = origin(pointers, gesture.origin.view);
  const scale = clampImagePreviewScale(gesture.origin.view.scale * (pointers.length === 2 ? current.distance / gesture.origin.distance : 1));
  const ratio = scale / gesture.origin.view.scale;
  const view = {
    scale,
    x: current.x - (gesture.origin.x - gesture.origin.view.x) * ratio,
    y: current.y - (gesture.origin.y - gesture.origin.view.y) * ratio,
  };
  const moved = gesture.moved || Math.hypot(current.x - gesture.origin.x, current.y - gesture.origin.y) > 3
    || Math.abs(current.distance - gesture.origin.distance) > 3;
  return { gesture: { ...gesture, pointers, moved }, view };
}

/** Rebase when one finger lifts so continuing to pan does not jump. */
export function endImageTouch(gesture: ImageTouchGesture, pointerId: number, view: ImagePreviewView): ImageTouchGesture | null {
  if (!gesture.pointers.some((item) => item.id === pointerId)) return gesture;
  const pointers = gesture.pointers.filter((item) => item.id !== pointerId);
  return pointers.length ? { ...gesture, pointers, origin: origin(pointers, view) } : null;
}

export function isImageDoubleTap(previous: ImageTouchTap | null, current: ImageTouchTap) {
  return Boolean(previous && current.time - previous.time >= 0 && current.time - previous.time <= 320
    && Math.hypot(current.x - previous.x, current.y - previous.y) <= 28);
}
