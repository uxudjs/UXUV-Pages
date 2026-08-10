"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { introSkipTarget, outroAction, shouldAdvanceOnEnded } from "@/lib/player/auto-skip";

interface UseAutoSkipOptions {
  videoRef: RefObject<HTMLVideoElement | null>;
  src: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  autoNextEpisode: boolean;
  autoSkipIntro: boolean;
  skipIntroSeconds: number;
  autoSkipOutro: boolean;
  skipOutroSeconds: number;
  hasNextEpisode: boolean;
  onNextEpisode?: () => void;
}

export function useAutoSkip({ videoRef, src, currentTime, duration, isPlaying, autoNextEpisode,
  autoSkipIntro, skipIntroSeconds, autoSkipOutro, skipOutroSeconds, hasNextEpisode,
  onNextEpisode }: Readonly<UseAutoSkipOptions>) {
  const introHandledRef = useRef(false);
  const outroHandledRef = useRef(false);
  const lastHandledSourceRef = useRef("");
  const onNextEpisodeRef = useRef(onNextEpisode);

  useEffect(() => { onNextEpisodeRef.current = onNextEpisode; }, [onNextEpisode]);
  useEffect(() => {
    introHandledRef.current = false;
    outroHandledRef.current = false;
    lastHandledSourceRef.current = "";
  }, [src]);

  const advance = useCallback(() => {
    if (!hasNextEpisode || !onNextEpisodeRef.current || lastHandledSourceRef.current === src) return;
    lastHandledSourceRef.current = src;
    onNextEpisodeRef.current();
  }, [hasNextEpisode, src]);

  useEffect(() => {
    if (introHandledRef.current) return;
    const target = introSkipTarget({ enabled: autoSkipIntro, seconds: skipIntroSeconds, currentTime, duration });
    if (target === null) return;
    const video = videoRef.current;
    if (!video) return;
    introHandledRef.current = true;
    video.currentTime = target;
  }, [autoSkipIntro, currentTime, duration, skipIntroSeconds, videoRef]);

  useEffect(() => {
    if (outroHandledRef.current) return;
    const action = outroAction({ enabled: autoSkipOutro, seconds: skipOutroSeconds, currentTime, duration,
      isPlaying, autoNext: autoNextEpisode, hasNext: hasNextEpisode });
    if (!action) return;
    outroHandledRef.current = true;
    if (action === "next") advance();
    else if (videoRef.current) videoRef.current.currentTime = duration;
  }, [advance, autoNextEpisode, autoSkipOutro, currentTime, duration, hasNextEpisode, isPlaying,
    skipOutroSeconds, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleEnded = () => {
      if (shouldAdvanceOnEnded(autoNextEpisode, hasNextEpisode)) advance();
    };
    video.addEventListener("ended", handleEnded);
    return () => video.removeEventListener("ended", handleEnded);
  }, [advance, autoNextEpisode, hasNextEpisode, videoRef]);
}
