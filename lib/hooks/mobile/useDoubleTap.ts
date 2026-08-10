import { useCallback, useEffect, useRef } from "react";

export const DOUBLE_TAP_WINDOW_MS = 300;

interface DoubleTapOptions {
  onSingleTap: () => void;
  onDoubleTapLeft: () => void;
  onDoubleTapRight: () => void;
}

export function useDoubleTap({ onSingleTap, onDoubleTapLeft, onDoubleTapRight }: DoubleTapOptions) {
  const lastTap = useRef<{ at: number; side: "left" | "right" } | null>(null);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onTouchEnd = useCallback((event: React.TouchEvent<HTMLVideoElement>) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const side = touch.clientX - rect.left < rect.width / 2 ? "left" : "right";
    const now = Date.now();
    const previous = lastTap.current;
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = null;
    if (previous && previous.side === side && now - previous.at < DOUBLE_TAP_WINDOW_MS) {
      event.preventDefault();
      lastTap.current = null;
      if (side === "left") onDoubleTapLeft();
      else onDoubleTapRight();
      return;
    }
    lastTap.current = { at: now, side };
    singleTapTimer.current = setTimeout(() => {
      lastTap.current = null;
      singleTapTimer.current = null;
      onSingleTap();
    }, DOUBLE_TAP_WINDOW_MS);
  }, [onDoubleTapLeft, onDoubleTapRight, onSingleTap]);

  useEffect(() => () => {
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
  }, []);

  return { onTouchEnd };
}
