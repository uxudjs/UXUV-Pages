"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildMediaUrl } from "@/lib/media/media-client";

type HlsInstance = import("hls.js").default;
type Phase = "loading" | "ready" | "error";

interface MediaPlayerProps {
  target: string;
  route: "proxy" | "iptv-stream";
  title: string;
  userAgent?: string;
  referer?: string;
}

function mediaFailureMessage(status?: number): string {
  if (status === 401) return "媒体授权已过期，请重试。"; // MEDIA_TOKEN_INVALID
  if (status === 403) return "当前账户没有 IPTV 播放权限。"; // IPTV_ACCESS_REQUIRED
  if (status === 429) return "媒体请求过于频繁，请稍后重试。"; // RATE_LIMITED
  if (status === 502 || status === 504) return "上游媒体暂时中断，请重试或切换线路。"; // UPSTREAM_STREAM_ERROR
  return "媒体播放失败，请重试或切换线路。";
}

function networkStatus(data: unknown): number | undefined {
  if (!data || typeof data !== "object") return undefined;
  const response = "response" in data ? data.response : null;
  if (response && typeof response === "object" && "code" in response && typeof response.code === "number") return response.code;
  const details = "networkDetails" in data ? data.networkDetails : null;
  if (details && typeof details === "object" && "status" in details && typeof details.status === "number") return details.status;
  return undefined;
}

export function MediaPlayer({ target, route, title, userAgent, referer }: Readonly<MediaPlayerProps>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsInstance | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const mediaUrl = useMemo(
    () => buildMediaUrl(route, target, { userAgent, referer }),
    [referer, route, target, userAgent],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const controller = new AbortController();
    let active = true;
    let directFallbackUsed = false;

    const fail = (status?: number) => {
      if (!active) return;
      setMessage(mediaFailureMessage(status));
      setPhase("error");
    };
    const direct = () => {
      directFallbackUsed = true;
      video.src = mediaUrl;
      video.load();
    };

    setPhase("loading");
    setMessage("");
    video.removeAttribute("src");
    video.load();

    void import("hls.js").then(({ default: Hls }) => {
      if (!active) return;
      const likelyHls = route === "iptv-stream" || /\.m3u8?(?:$|[?#])/i.test(target);
      if (!likelyHls || !Hls.isSupported()) {
        direct();
        return;
      }
      const hls = new Hls({
        enableWorker: true,
        manifestLoadingTimeOut: 20_000,
        levelLoadingTimeOut: 20_000,
        fragLoadingTimeOut: 20_000,
        fetchSetup: (context, init) => new Request(context.url, {
          ...init,
          credentials: "same-origin",
          signal: controller.signal,
        }),
      });
      hlsRef.current = hls;
      hls.attachMedia(video);
      hls.loadSource(mediaUrl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => setPhase("ready"));
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        const status = networkStatus(data);
        hls.destroy();
        hlsRef.current = null;
        if (!directFallbackUsed && status === undefined) direct();
        else fail(status);
      });
    }).catch(() => direct());

    const ready = () => setPhase("ready");
    const directError = () => fail();
    video.addEventListener("canplay", ready);
    video.addEventListener("error", directError);
    return () => {
      active = false;
      controller.abort();
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeEventListener("canplay", ready);
      video.removeEventListener("error", directError);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [attempt, mediaUrl, route, target]);

  return (
    <div className="media-player" data-phase={phase}>
      <video ref={videoRef} controls playsInline preload="metadata" aria-label="视频播放器" data-media-source={mediaUrl} />
      {phase === "loading" && <p className="media-overlay" role="status">正在连接受保护媒体…</p>}
      {phase === "error" && (
        <div className="media-overlay media-error" role="alert">
          <p>{message}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>重试播放</button>
        </div>
      )}
      <span className="sr-only">{title}</span>
    </div>
  );
}
