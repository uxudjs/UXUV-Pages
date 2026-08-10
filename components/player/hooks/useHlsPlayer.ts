import { useEffect, useRef } from "react";
import { selectCompatibleHlsLevel, supportsHevcPlayback } from "@/lib/iptv/playback-policy";
import type { ProxyMode } from "@/lib/player/player-settings";

type HlsInstance = import("hls.js").default;

interface UseHlsPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  src: string;
  likelyHls: boolean;
  proxyMode: ProxyMode;
  retryKey: number;
  preferH264?: boolean;
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

function protectedMediaUrl(src: string): boolean {
  try {
    const url = new URL(src, location.origin);
    return url.origin === location.origin && (url.pathname === "/api/proxy" || url.pathname === "/api/iptv/stream");
  } catch { return false; }
}

export function useHlsPlayer({ videoRef, src, likelyHls, proxyMode, retryKey, onLoading, onReady,
  onError, preferH264 = false }: UseHlsPlayerProps) {
  const hlsRef = useRef<HlsInstance | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;
    const controller = new AbortController();
    let active = true;
    let hls: HlsInstance | null = null;
    let terminal = false;
    const fail = (status?: number) => {
      if (!active || terminal) return;
      terminal = true;
      onError(status);
    };
    const loadNativeDecoder = () => {
      if (!active) return;
      video.src = src;
      video.load();
    };

    onLoading();
    video.pause();
    video.removeAttribute("src");
    video.load();
    if (!protectedMediaUrl(src)) {
      fail();
      return () => controller.abort();
    }

    const nativeHls = Boolean(video.canPlayType("application/vnd.apple.mpegurl"));
    if (!likelyHls || (proxyMode === "none" && nativeHls)) {
      loadNativeDecoder();
    } else {
      void import("hls.js").then(({ default: Hls }) => {
        if (!active) return;
        if (!Hls.isSupported()) {
          if (nativeHls) loadNativeDecoder();
          else fail();
          return;
        }
        const retryLimit = MAX_NETWORK_RETRIES[proxyMode];
        hls = new Hls({
          enableWorker: true,
          manifestLoadingTimeOut: 20_000,
          levelLoadingTimeOut: 20_000,
          fragLoadingTimeOut: 20_000,
          manifestLoadingMaxRetry: retryLimit,
          levelLoadingMaxRetry: retryLimit,
          fragLoadingMaxRetry: retryLimit,
          fetchSetup: (context, init) => new Request(context.url, {
            ...init,
            credentials: "same-origin",
            signal: controller.signal,
          }),
        });
        hlsRef.current = hls;
        let mediaRetries = 0;
        hls.attachMedia(video);
        hls.loadSource(src);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (preferH264) {
            const selection = selectCompatibleHlsLevel(hls?.levels || [], supportsHevcPlayback(video));
            if (selection.incompatible) { fail(415); hls?.destroy(); hlsRef.current = null; return; }
            if (selection.level !== null && hls) hls.currentLevel = selection.level;
          }
          onReady();
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal || terminal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < MAX_MEDIA_RETRIES) {
            mediaRetries += 1;
            hls?.recoverMediaError();
          } else {
            fail(networkStatus(data));
            hls?.destroy();
            hlsRef.current = null;
          }
        });
      }).catch(() => {
        if (nativeHls) loadNativeDecoder();
        else fail();
      });
    }

    return () => {
      active = false;
      controller.abort();
      hls?.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [likelyHls, onError, onLoading, onReady, preferH264, proxyMode, retryKey, src, videoRef]);
}
