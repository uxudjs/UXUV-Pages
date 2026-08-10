import { useCallback } from "react";

export function useSkipControls(videoRef: React.RefObject<HTMLVideoElement | null>, duration: number, stepSeconds: number) {
  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const maximum = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
    video.currentTime = Math.min(Math.max(video.currentTime + delta, 0), maximum);
  }, [duration, videoRef]);

  const skipForward = useCallback(() => seekBy(stepSeconds), [seekBy, stepSeconds]);
  const skipBackward = useCallback(() => seekBy(-stepSeconds), [seekBy, stepSeconds]);
  return { skipForward, skipBackward };
}
