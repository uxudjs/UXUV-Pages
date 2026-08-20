import { useEffect, useRef } from "react";
import { selectCompatibleHlsLevel, supportsHevcPlayback } from "@/lib/player/hls-compatibility";
import type { ProxyMode } from "@/lib/player/player-settings";

type HlsInstance = import("hls.js").default;

interface UseHlsPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  src: string;
  fallbackSrc?: string | null;
  likelyHls: boolean;
  proxyMode: ProxyMode;
  retryKey: number;
  preferH264?: boolean;
  onSourceChange?: (src: string) => void;
  onLoading: () => void;
  onReady: () => void;
  onError: (status?: number) => void;
}

export const MAX_NETWORK_RETRIES: Record<ProxyMode, number> = { none: 0, retry: 2, always: 3 };
const MAX_MEDIA_RETRIES = 2;

function networkStatus(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;
  const response = "response" in data ? data.response : null;
  if (response && typeof response === "object" && "code" in response && typeof response.code === "number") return response.code;
  const details = "networkDetails" in data ? data.networkDetails : null;
  if (details && typeof details === "object" && "status" in details && typeof details.status === "number") return details.status;
  return undefined;
}

function playableMediaUrl(src: string): boolean {
  try {
    const url = new URL(src, location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch { return false; }
}

function requestCredentials(src: string): RequestCredentials {
  try {
    return new URL(src, location.origin).origin === location.origin ? "same-origin" : "omit";
  } catch {
    return "omit";
  }
}

export function useHlsPlayer({ videoRef, src, fallbackSrc, likelyHls, proxyMode, retryKey, onLoading, onReady,
  onError, onSourceChange, preferH264 = false }: UseHlsPlayerProps) {
  const hlsRef = useRef<HlsInstance | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    const controller = new AbortController();
    let active = true;
    let hls: HlsInstance | null = null;
    let activeSrc = src;
    let nativeError: (() => void) | null = null;
    let nativeResume: (() => void) | null = null;
    let terminal = false;
    const fail = (status?: number) => {
      if (!active || terminal) return;
      terminal = true;
      onError(status);
    };
    const fallback = fallbackSrc && playableMediaUrl(fallbackSrc) ? fallbackSrc : null;
    const announceSource = (nextSrc: string) => {
      activeSrc = nextSrc;
      onSourceChange?.(nextSrc);
    };
    const restorePosition = (position: number) => {
      if (position <= 0) return;
      const maximum = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : position;
      video.currentTime = Math.min(position, maximum);
    };
    const loadNativeDecoder = (nextSrc: string, resumeAt = 0) => {
      if (!active) return;
      if (nativeError) video.removeEventListener("error", nativeError);
      if (nativeResume) video.removeEventListener("loadedmetadata", nativeResume);
      nativeError = () => {
        if (fallback && activeSrc !== fallback) {
          onLoading();
          loadNativeDecoder(fallback, video.currentTime);
        } else {
          fail();
        }
      };
      video.addEventListener("error", nativeError);
      nativeResume = resumeAt > 0 ? () => restorePosition(resumeAt) : null;
      if (nativeResume) video.addEventListener("loadedmetadata", nativeResume, { once: true });
      announceSource(nextSrc);
      video.src = nextSrc;
      video.load();
    };

    onLoading();
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (!playableMediaUrl(src)) {
      fail();
      return () => controller.abort();
    }

    const nativeHls = Boolean(video.canPlayType("application/vnd.apple.mpegurl"));
    if (!likelyHls || (proxyMode === "none" && nativeHls)) {
      loadNativeDecoder(src);
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (!active) return;
        if (!Hls.isSupported()) {
          if (nativeHls) loadNativeDecoder(src);
          else fail();
          return;
        }
        const loadHls = (nextSrc: string, resumeAt = 0) => {
          hls?.destroy();
          announceSource(nextSrc);
          const retryLimit = MAX_NETWORK_RETRIES[proxyMode];
          const instance = new Hls({
            enableWorker: true,
            manifestLoadingTimeOut: 20_000,
            levelLoadingTimeOut: 20_000,
            fragLoadingTimeOut: 20_000,
            manifestLoadingMaxRetry: retryLimit,
            levelLoadingMaxRetry: retryLimit,
            fragLoadingMaxRetry: retryLimit,
            fetchSetup: (context, init) => new Request(context.url, {
              ...init,
              credentials: requestCredentials(context.url),
              signal: controller.signal,
            }),
          });
          hls = instance;
          hlsRef.current = instance;
          let mediaRetries = 0;
          instance.attachMedia(video);
          instance.loadSource(nextSrc);
          instance.on(Hls.Events.MANIFEST_PARSED, () => {
            if (instance !== hls || terminal) return;
            if (preferH264) {
              const selection = selectCompatibleHlsLevel(instance.levels || [], supportsHevcPlayback(video));
              if (selection.incompatible) { fail(415); instance.destroy(); hlsRef.current = null; return; }
              if (selection.level !== null) instance.currentLevel = selection.level;
            }
            restorePosition(resumeAt);
            onReady();
          });
          instance.on(Hls.Events.ERROR, (_event, data) => {
            if (instance !== hls || !data.fatal || terminal) return;
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR && fallback && activeSrc !== fallback) {
              onLoading();
              loadHls(fallback, video.currentTime);
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < MAX_MEDIA_RETRIES) {
              mediaRetries += 1;
              instance.recoverMediaError();
            } else {
              fail(networkStatus(data));
              instance.destroy();
              hlsRef.current = null;
            }
          });
        };
        loadHls(src);
      }).catch(() => {
        if (nativeHls) loadNativeDecoder(src);
        else fail();
      });
    }

    return () => {
      active = false;
      controller.abort();
      if (nativeError) video.removeEventListener("error", nativeError);
      if (nativeResume) video.removeEventListener("loadedmetadata", nativeResume);
      hls?.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [fallbackSrc, likelyHls, onError, onLoading, onReady, onSourceChange, preferH264, proxyMode, retryKey, src, videoRef]);
}
