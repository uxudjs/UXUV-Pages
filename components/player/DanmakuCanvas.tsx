"use client";

import { useCallback, useEffect, useRef } from "react";
import { clampDanmakuY, haveDanmakuCanvasMetricsChanged, resolveDanmakuCanvasMetrics,
  resolveDanmakuLaneCount, scaleDanmakuCoordinate, MAX_DANMAKU_LANES,
  type DanmakuCanvasMetrics } from "@/lib/player/danmaku-canvas-utils";
import type { DanmakuComment, DanmakuType } from "@/lib/player/danmaku-utils";

interface DanmakuCanvasProps {
  comments: readonly DanmakuComment[];
  currentTime: number;
  isPlaying: boolean;
  opacity: number;
  fontSize: number;
  displayArea: number;
}

interface ActiveDanmaku {
  comment: DanmakuComment;
  x: number;
  y: number;
  speed: number;
  width: number;
  expiry: number;
}

const SCROLL_DURATION_SECONDS = 8;
const FIXED_DURATION_SECONDS = 4;
const LANE_HEIGHT_FACTOR = 1.4;
const SPAWN_LOOKBACK_SECONDS = 0.3;
export const MAX_ACTIVE_DANMAKU = 200;

function cssPixels(value: string): number | undefined {
  const parsed = value.endsWith("px") ? Number.parseFloat(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readMetrics(canvas: HTMLCanvasElement): DanmakuCanvasMetrics | null {
  const style = window.getComputedStyle(canvas);
  const bounds = canvas.getBoundingClientRect();
  return resolveDanmakuCanvasMetrics({
    computedWidth: cssPixels(style.width), computedHeight: cssPixels(style.height),
    clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight,
    offsetWidth: canvas.offsetWidth, offsetHeight: canvas.offsetHeight,
    boundingWidth: bounds.width, boundingHeight: bounds.height,
    devicePixelRatio: window.devicePixelRatio,
  });
}

function emptyLanes() {
  return {
    scroll: new Array<number>(MAX_DANMAKU_LANES).fill(0),
    top: new Array<number>(MAX_DANMAKU_LANES).fill(0),
    bottom: new Array<number>(MAX_DANMAKU_LANES).fill(0),
  } satisfies Record<DanmakuType, number[]>;
}

export function DanmakuCanvas({ comments, currentTime, isPlaying, opacity, fontSize,
  displayArea }: Readonly<DanmakuCanvasProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<ActiveDanmaku[]>([]);
  const lanesRef = useRef(emptyLanes());
  const metricsRef = useRef<DanmakuCanvasMetrics | null>(null);
  const playbackTimeRef = useRef(currentTime);
  const lastTimeRef = useRef(currentTime);
  const playingRef = useRef(isPlaying);
  const lastSpawnTimeRef = useRef(currentTime - SPAWN_LOOKBACK_SECONDS);
  const lastRafTimeRef = useRef(0);
  const rafRef = useRef(0);

  const syncCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const next = readMetrics(canvas);
    if (!next) return null;
    const previous = metricsRef.current;
    if (!haveDanmakuCanvasMetricsChanged(previous, next)) return next;
    canvas.width = next.bitmapWidth;
    canvas.height = next.bitmapHeight;
    if (previous) {
      const effectiveHeight = next.height * displayArea;
      activeRef.current = activeRef.current.map((item) => ({
        ...item,
        x: item.comment.type === "scroll"
          ? scaleDanmakuCoordinate(item.x, previous.width, next.width)
          : (next.width - item.width) / 2,
        y: clampDanmakuY(scaleDanmakuCoordinate(item.y, previous.height, next.height), fontSize, effectiveHeight),
        speed: item.comment.type === "scroll" ? (next.width + item.width) / SCROLL_DURATION_SECONDS : 0,
      }));
      lanesRef.current = emptyLanes();
    }
    metricsRef.current = next;
    return next;
  }, [displayArea, fontSize]);

  useEffect(() => {
    playbackTimeRef.current = currentTime;
    if (Math.abs(currentTime - lastTimeRef.current) > 2) {
      activeRef.current = [];
      lanesRef.current = emptyLanes();
      lastSpawnTimeRef.current = currentTime - SPAWN_LOOKBACK_SECONDS;
    }
    lastTimeRef.current = currentTime;
  }, [currentTime]);

  useEffect(() => { playingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => {
    activeRef.current = [];
    lanesRef.current = emptyLanes();
    lastSpawnTimeRef.current = playbackTimeRef.current - SPAWN_LOOKBACK_SECONDS;
  }, [comments, displayArea, fontSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let resizeRaf = 0;
    const resize = () => {
      syncCanvasSize();
      window.cancelAnimationFrame(resizeRaf);
      resizeRaf = window.requestAnimationFrame(syncCanvasSize);
    };
    resize();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(canvas);
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    return () => {
      window.cancelAnimationFrame(resizeRaf);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
    };
  }, [syncCanvasSize]);

  const spawnComments = useCallback((time: number, context: CanvasRenderingContext2D, metrics: DanmakuCanvasMetrics) => {
    const start = lastSpawnTimeRef.current;
    if (time <= start || !comments.length || activeRef.current.length >= MAX_ACTIVE_DANMAKU) return;
    let low = 0;
    let high = comments.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (comments[middle].time <= start) low = middle + 1;
      else high = middle;
    }
    const laneCount = resolveDanmakuLaneCount(metrics.height, fontSize, displayArea);
    const laneHeight = fontSize * LANE_HEIGHT_FACTOR;
    context.font = `bold ${fontSize}px sans-serif`;
    for (let index = low; index < comments.length && comments[index].time <= time
      && activeRef.current.length < MAX_ACTIVE_DANMAKU; index += 1) {
      const comment = comments[index];
      const width = context.measureText(comment.text).width;
      const lanes = lanesRef.current[comment.type];
      const lane = lanes.slice(0, laneCount).findIndex((availableAt) => availableAt <= time);
      if (lane < 0) continue;
      if (comment.type === "scroll") {
        const speed = (metrics.width + width) / SCROLL_DURATION_SECONDS;
        lanes[lane] = time + (width / speed) + 0.5;
        activeRef.current.push({ comment, x: metrics.width, y: lane * laneHeight + fontSize,
          speed, width, expiry: Number.POSITIVE_INFINITY });
      } else {
        lanes[lane] = time + FIXED_DURATION_SECONDS;
        const y = comment.type === "top" ? lane * laneHeight + fontSize
          : metrics.height * displayArea - lane * laneHeight - fontSize * 0.4;
        activeRef.current.push({ comment, x: (metrics.width - width) / 2, y,
          speed: 0, width, expiry: time + FIXED_DURATION_SECONDS });
      }
    }
    lastSpawnTimeRef.current = time;
  }, [comments, displayArea, fontSize]);

  useEffect(() => {
    const animate = (rafTime: number) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      const metrics = metricsRef.current ?? syncCanvasSize();
      if (!canvas || !context || !metrics) {
        rafRef.current = window.requestAnimationFrame(animate);
        return;
      }
      const delta = lastRafTimeRef.current ? Math.min((rafTime - lastRafTimeRef.current) / 1_000, 0.1) : 0;
      lastRafTimeRef.current = rafTime;
      const playbackTime = playbackTimeRef.current;
      if (playingRef.current) {
        spawnComments(playbackTime, context, metrics);
        activeRef.current = activeRef.current.filter((item) => {
          if (item.comment.type === "scroll") {
            item.x -= item.speed * delta;
            return item.x + item.width > 0;
          }
          return playbackTime < item.expiry;
        });
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(metrics.dpr, 0, 0, metrics.dpr, 0, 0);
      context.globalAlpha = opacity;
      context.font = `bold ${fontSize}px sans-serif`;
      context.textBaseline = "middle";
      for (const item of activeRef.current) {
        context.fillStyle = item.comment.color ?? "#ffffff";
        context.strokeStyle = "rgba(0, 0, 0, 0.8)";
        context.lineWidth = 2;
        context.lineJoin = "round";
        context.strokeText(item.comment.text, item.x, item.y);
        context.fillText(item.comment.text, item.x, item.y);
      }
      canvas.dataset.activeCount = String(activeRef.current.length);
      rafRef.current = window.requestAnimationFrame(animate);
    };
    rafRef.current = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(rafRef.current);
      lastRafTimeRef.current = 0;
    };
  }, [fontSize, opacity, spawnComments, syncCanvasSize]);

  return <canvas ref={canvasRef} className="danmaku-canvas" aria-hidden="true" data-active-count="0" />;
}
