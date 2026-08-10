import { useEffect, useRef, useState } from "react";

export const STALL_THRESHOLD_MS = 200;
const STALL_POLL_MS = 100;

export function useStallDetection(videoRef: React.RefObject<HTMLVideoElement | null>, playing: boolean) {
  const [stalled, setStalled] = useState(false);
  const lastTime = useRef(0);
  const lastMovedAt = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    lastMovedAt.current = Date.now();
    const moving = () => {
      lastTime.current = video.currentTime;
      lastMovedAt.current = Date.now();
      setStalled(false);
    };
    const waiting = () => { if (playing && !video.paused) setStalled(true); };
    video.addEventListener("playing", moving);
    video.addEventListener("timeupdate", moving);
    video.addEventListener("waiting", waiting);
    const interval = setInterval(() => {
      if (!playing || video.paused) { moving(); return; }
      if (video.currentTime !== lastTime.current) { moving(); return; }
      if (Date.now() - lastMovedAt.current >= STALL_THRESHOLD_MS) setStalled(true);
    }, STALL_POLL_MS);
    return () => {
      clearInterval(interval);
      video.removeEventListener("playing", moving);
      video.removeEventListener("timeupdate", moving);
      video.removeEventListener("waiting", waiting);
    };
  }, [playing, videoRef]);

  return stalled;
}
