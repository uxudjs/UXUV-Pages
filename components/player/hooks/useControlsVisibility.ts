import { useCallback, useEffect, useRef, useState } from "react";

export const CONTROLS_HIDE_DELAY_MS = 3000;
export const POINTER_MOVE_THROTTLE_MS = 200;

export function useControlsVisibility(playing: boolean, interactiveOverlay: boolean) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerThrottle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = null;
  }, []);
  const scheduleHide = useCallback(() => {
    clearHideTimer();
    if (!playing || interactiveOverlay) return;
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_DELAY_MS);
  }, [clearHideTimer, interactiveOverlay, playing]);
  const showControls = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);
  const hideControlsNow = useCallback(() => {
    clearHideTimer();
    if (playing && !interactiveOverlay) setControlsVisible(false);
  }, [clearHideTimer, interactiveOverlay, playing]);
  const toggleControls = useCallback(() => {
    if (controlsVisible && playing && !interactiveOverlay) hideControlsNow();
    else showControls();
  }, [controlsVisible, hideControlsNow, interactiveOverlay, playing, showControls]);
  const handlePointerMove = useCallback(() => {
    if (pointerThrottle.current) return;
    showControls();
    pointerThrottle.current = setTimeout(() => { pointerThrottle.current = null; }, POINTER_MOVE_THROTTLE_MS);
  }, [showControls]);

  useEffect(() => {
    let active = true;
    if (!playing) {
      clearHideTimer();
      queueMicrotask(() => { if (active) setControlsVisible(true); });
    } else {
      scheduleHide();
    }
    return () => { active = false; };
  }, [clearHideTimer, playing, scheduleHide]);
  useEffect(() => () => {
    clearHideTimer();
    if (pointerThrottle.current) clearTimeout(pointerThrottle.current);
  }, [clearHideTimer]);

  return { controlsVisible, handlePointerMove, hideControlsNow, showControls, toggleControls, scheduleHide };
}
