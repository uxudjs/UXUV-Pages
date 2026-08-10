"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampFloatingButtonPosition,
  getDefaultFloatingButtonPosition,
  getFloatingButtonRatios,
  getPositionFromFloatingButtonRatios,
  type FloatingAnchor,
  type FloatingButtonPosition,
  type FloatingButtonRatios,
} from "@/lib/utils/floating-button-position";

interface Options {
  storageKey: string;
  defaultAnchor: FloatingAnchor;
  buttonSize?: number;
  margin?: number;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  dragging: boolean;
}

const DRAG_THRESHOLD = 8;

export function useFloatingButtonPosition({ storageKey, defaultAnchor, buttonSize = 56, margin = 16 }: Options) {
  const [position, setPosition] = useState<FloatingButtonPosition | null>(null);
  const positionRef = useRef<FloatingButtonPosition | null>(null);
  const ratioRef = useRef<FloatingButtonRatios | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const finishRef = useRef<(event: PointerEvent) => void>(() => {});

  const setNextPosition = useCallback((next: FloatingButtonPosition) => {
    positionRef.current = next;
    setPosition(next);
  }, []);

  const defaultPosition = useCallback(() => getDefaultFloatingButtonPosition(
    { width: window.innerWidth, height: window.innerHeight }, defaultAnchor, 0.5, buttonSize, margin,
  ), [buttonSize, defaultAnchor, margin]);

  useEffect(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<FloatingButtonRatios> | null;
      if (stored && Number.isFinite(stored.xRatio) && Number.isFinite(stored.yRatio)) {
        ratioRef.current = { xRatio: stored.xRatio!, yRatio: stored.yRatio! };
        setNextPosition(getPositionFromFloatingButtonRatios(ratioRef.current, viewport, buttonSize, margin));
      } else setNextPosition(defaultPosition());
    } catch {
      setNextPosition(defaultPosition());
    }

    const resize = () => setNextPosition(ratioRef.current
      ? getPositionFromFloatingButtonRatios(ratioRef.current, { width: innerWidth, height: innerHeight }, buttonSize, margin)
      : defaultPosition());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [buttonSize, defaultPosition, margin, setNextPosition, storageKey]);

  const pointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.dragging && Math.max(Math.abs(event.clientX - drag.startX), Math.abs(event.clientY - drag.startY)) > DRAG_THRESHOLD) {
      drag.dragging = true;
    }
    if (!drag.dragging) return;
    event.preventDefault();
    const next = clampFloatingButtonPosition(
      { x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY },
      { width: innerWidth, height: innerHeight }, buttonSize, margin,
    );
    ratioRef.current = getFloatingButtonRatios(next, { width: innerWidth, height: innerHeight }, buttonSize, margin);
    setNextPosition(next);
  }, [buttonSize, margin, setNextPosition]);

  const finish = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    suppressClickRef.current = drag.dragging;
    if (drag.dragging && ratioRef.current) localStorage.setItem(storageKey, JSON.stringify(ratioRef.current));
    dragRef.current = null;
    window.removeEventListener("pointermove", pointerMove);
    window.removeEventListener("pointerup", finishRef.current);
    window.removeEventListener("pointercancel", finishRef.current);
  }, [pointerMove, storageKey]);

  useEffect(() => {
    finishRef.current = finish;
    return () => {
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };
  }, [finish, pointerMove]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
      dragging: false,
    };
    window.addEventListener("pointermove", pointerMove, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }, [finish, pointerMove]);

  const consumeSyntheticClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }, []);

  const floatingStyle = position ? {
    left: `${position.x}px`, top: `${position.y}px`, right: "auto", bottom: "auto", transform: "none",
  } : defaultAnchor === "left"
    ? { left: `${margin}px`, top: "50%", right: "auto", bottom: "auto", transform: "translateY(-50%)" }
    : { right: `${margin}px`, top: "50%", left: "auto", bottom: "auto", transform: "translateY(-50%)" };

  return { floatingStyle, onPointerDown, consumeSyntheticClick };
}
