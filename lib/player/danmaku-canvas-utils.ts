export interface DanmakuCanvasSizeCandidates {
  computedWidth?: number;
  computedHeight?: number;
  clientWidth?: number;
  clientHeight?: number;
  offsetWidth?: number;
  offsetHeight?: number;
  boundingWidth?: number;
  boundingHeight?: number;
  devicePixelRatio?: number;
}

export interface DanmakuCanvasMetrics {
  width: number;
  height: number;
  dpr: number;
  bitmapWidth: number;
  bitmapHeight: number;
}

export const MAX_DANMAKU_LANES = 20;
const LANE_HEIGHT_FACTOR = 1.4;
const METRIC_EPSILON = 0.5;

function firstPositive(values: Array<number | undefined>): number | null {
  return values.find((value) => typeof value === "number" && Number.isFinite(value) && value > 0) ?? null;
}

export function resolveDanmakuCanvasMetrics(candidates: DanmakuCanvasSizeCandidates): DanmakuCanvasMetrics | null {
  const width = firstPositive([candidates.computedWidth, candidates.clientWidth, candidates.offsetWidth, candidates.boundingWidth]);
  const height = firstPositive([candidates.computedHeight, candidates.clientHeight, candidates.offsetHeight, candidates.boundingHeight]);
  if (width === null || height === null) return null;
  const dpr = typeof candidates.devicePixelRatio === "number" && Number.isFinite(candidates.devicePixelRatio)
    && candidates.devicePixelRatio > 0 ? candidates.devicePixelRatio : 1;
  return {
    width, height, dpr,
    bitmapWidth: Math.max(1, Math.round(width * dpr)),
    bitmapHeight: Math.max(1, Math.round(height * dpr)),
  };
}

export function haveDanmakuCanvasMetricsChanged(previous: DanmakuCanvasMetrics | null,
  next: DanmakuCanvasMetrics): boolean {
  return !previous || Math.abs(previous.width - next.width) > METRIC_EPSILON
    || Math.abs(previous.height - next.height) > METRIC_EPSILON
    || Math.abs(previous.dpr - next.dpr) > 0.01
    || previous.bitmapWidth !== next.bitmapWidth || previous.bitmapHeight !== next.bitmapHeight;
}

export function scaleDanmakuCoordinate(value: number, previousSize: number, nextSize: number): number {
  return Number.isFinite(value) && previousSize > 0 && nextSize > 0 ? value * (nextSize / previousSize) : value;
}

export function clampDanmakuY(value: number, fontSize: number, effectiveHeight: number): number {
  const minimum = Math.max(0, fontSize);
  const maximum = Math.max(minimum, effectiveHeight - fontSize * 0.4);
  return Math.min(maximum, Math.max(minimum, value));
}

export function resolveDanmakuLaneCount(height: number, fontSize: number, displayArea: number): number {
  if (![height, fontSize, displayArea].every((value) => Number.isFinite(value) && value > 0)) return 0;
  return Math.min(MAX_DANMAKU_LANES, Math.max(1, Math.floor((height * displayArea) / (fontSize * LANE_HEIGHT_FACTOR))));
}

