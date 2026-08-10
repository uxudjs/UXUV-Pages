export type FloatingAnchor = "left" | "right";

export interface FloatingButtonPosition {
  x: number;
  y: number;
}

export interface FloatingButtonViewport {
  width: number;
  height: number;
}

export interface FloatingButtonRatios {
  xRatio: number;
  yRatio: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function travelDistance(size: number, buttonSize: number, margin: number) {
  return Math.max(0, size - buttonSize - margin * 2);
}

export function clampFloatingButtonPosition(
  position: FloatingButtonPosition,
  viewport: FloatingButtonViewport,
  buttonSize = 56,
  margin = 16,
): FloatingButtonPosition {
  return {
    x: clamp(position.x, margin, Math.max(margin, viewport.width - buttonSize - margin)),
    y: clamp(position.y, margin, Math.max(margin, viewport.height - buttonSize - margin)),
  };
}

export function getDefaultFloatingButtonPosition(
  viewport: FloatingButtonViewport,
  anchor: FloatingAnchor,
  defaultYRatio = 0.5,
  buttonSize = 56,
  margin = 16,
): FloatingButtonPosition {
  return clampFloatingButtonPosition({
    x: anchor === "left" ? margin : Math.max(margin, viewport.width - buttonSize - margin),
    y: viewport.height * defaultYRatio - buttonSize / 2,
  }, viewport, buttonSize, margin);
}

export function getFloatingButtonRatios(
  position: FloatingButtonPosition,
  viewport: FloatingButtonViewport,
  buttonSize = 56,
  margin = 16,
): FloatingButtonRatios {
  const safe = clampFloatingButtonPosition(position, viewport, buttonSize, margin);
  const travelX = travelDistance(viewport.width, buttonSize, margin);
  const travelY = travelDistance(viewport.height, buttonSize, margin);
  return {
    xRatio: travelX === 0 ? 0 : clamp((safe.x - margin) / travelX, 0, 1),
    yRatio: travelY === 0 ? 0 : clamp((safe.y - margin) / travelY, 0, 1),
  };
}

export function getPositionFromFloatingButtonRatios(
  ratios: FloatingButtonRatios,
  viewport: FloatingButtonViewport,
  buttonSize = 56,
  margin = 16,
): FloatingButtonPosition {
  const travelX = travelDistance(viewport.width, buttonSize, margin);
  const travelY = travelDistance(viewport.height, buttonSize, margin);
  return clampFloatingButtonPosition({
    x: margin + clamp(ratios.xRatio, 0, 1) * travelX,
    y: margin + clamp(ratios.yRatio, 0, 1) * travelY,
  }, viewport, buttonSize, margin);
}
