import { useEffect, useState } from "react";

export interface VideoResolutionInfo {
  width: number;
  height: number;
  label: string;
}

export function resolutionLabel(width: number, height: number): string | null {
  if (width <= 0 || height <= 0) return null;
  const shortEdge = Math.min(width, height);
  if (shortEdge >= 2160) return "4K";
  if (shortEdge >= 1440) return "2K";
  if (shortEdge >= 1080) return "1080P";
  if (shortEdge >= 720) return "720P";
  if (shortEdge >= 480) return "480P";
  if (shortEdge >= 360) return "360P";
  return `${shortEdge}P`;
}

export function useVideoResolution(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [resolution, setResolution] = useState<VideoResolutionInfo | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let active = true;
    const detect = () => {
      const label = resolutionLabel(video.videoWidth, video.videoHeight);
      if (active && label) setResolution({ width: video.videoWidth, height: video.videoHeight, label });
    };
    queueMicrotask(() => { if (active) { setResolution(null); detect(); } });
    video.addEventListener("loadedmetadata", detect);
    video.addEventListener("resize", detect);
    return () => {
      active = false;
      video.removeEventListener("loadedmetadata", detect);
      video.removeEventListener("resize", detect);
    };
  }, [videoRef]);
  return resolution;
}
