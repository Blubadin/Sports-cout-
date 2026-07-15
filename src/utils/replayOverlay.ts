export interface OverlayPoint {
  x: number;
  y: number;
}

export interface OverlaySize {
  width: number;
  height: number;
}

export interface OverlayInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const DEFAULT_INSETS: OverlayInsets = { top: 8, right: 8, bottom: 8, left: 8 };

export function clampReplayOverlayPosition(
  point: OverlayPoint,
  container: OverlaySize,
  overlay: OverlaySize,
  insets: OverlayInsets = DEFAULT_INSETS,
): OverlayPoint {
  const maxX = Math.max(insets.left, container.width - overlay.width - insets.right);
  const maxY = Math.max(insets.top, container.height - overlay.height - insets.bottom);
  return {
    x: Math.min(Math.max(insets.left, point.x), maxX),
    y: Math.min(Math.max(insets.top, point.y), maxY),
  };
}
