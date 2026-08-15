"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { VideoTogetherController } from "@/components/VideoTogetherController";
import { DanmakuCanvas } from "@/components/player/DanmakuCanvas";
import { DesktopControls, type DesktopControlLabels } from "@/components/player/desktop/DesktopControls";
import { useCastControls } from "@/components/player/hooks/useCastControls";
import { useAutoSkip } from "@/components/player/hooks/useAutoSkip";
import { useControlsVisibility } from "@/components/player/hooks/useControlsVisibility";
import { useDesktopShortcuts } from "@/components/player/hooks/useDesktopShortcuts";
import { useFullscreenControls } from "@/components/player/hooks/useFullscreenControls";
import { useHlsPlayer } from "@/components/player/hooks/useHlsPlayer";
import { useDanmaku } from "@/components/player/hooks/useDanmaku";
import { usePictureInPicture } from "@/components/player/hooks/usePictureInPicture";
import { useSkipControls } from "@/components/player/hooks/useSkipControls";
import { useStallDetection } from "@/components/player/hooks/useStallDetection";
import { useVideoResolution, type VideoResolutionInfo } from "@/components/player/hooks/useVideoResolution";
import { useDoubleTap } from "@/lib/hooks/mobile/useDoubleTap";
import { useScreenOrientation } from "@/lib/hooks/mobile/useScreenOrientation";
import { useMobilePlayer } from "@/lib/hooks/useMobilePlayer";
import { buildMediaUrl } from "@/lib/media/media-client";
import { resolvePlaybackSources } from "@/lib/media/playback-routing";
import { usePlayerSettings } from "@/lib/hooks/usePlayerSettings";
import { shouldHidePlayerCursor } from "@/lib/player/cursor-visibility";
import { useAuth } from "@/lib/store/auth-store";

type Phase = "loading" | "ready" | "error";

export interface MediaPlayerMessages {
  connecting: string;
  buffering: string;
  retryPlayback: string;
  tokenInvalid: string;
  iptvDenied: string;
  rateLimited: string;
  upstreamFailed: string;
  playbackFailed: string;
  codecUnsupported: string;
  directMode: string;
  nativeMode: string;
  retryMode: string;
  relayMode: string;
}

const DEFAULT_MESSAGES: MediaPlayerMessages = {
  connecting: "正在连接受保护媒体…", buffering: "正在缓冲…", retryPlayback: "重试播放",
  tokenInvalid: "媒体授权已过期，请重试。", iptvDenied: "当前账户没有 IPTV 播放权限。",
  rateLimited: "媒体请求过于频繁，请稍后重试。", upstreamFailed: "上游媒体暂时中断，请重试或切换线路。",
  playbackFailed: "媒体播放失败，请重试或切换线路。", codecUnsupported: "当前浏览器不支持此媒体的编解码格式。",
  directMode: "仅直连", nativeMode: "原生解码", retryMode: "智能重试", relayMode: "始终中继",
};

interface MediaPlayerProps {
  target: string;
  route: "proxy" | "iptv-stream";
  title: string;
  userAgent?: string;
  referer?: string;
  mode?: "standard" | "premium";
  shellControls?: DesktopControlLabels;
  messages?: MediaPlayerMessages;
  initialTime?: number;
  onProgress?: (progress: { currentTime: number; duration: number }) => void;
  onReady?: () => void;
  onTerminalError?: () => void;
  onClose?: () => void;
  preferH264?: boolean;
  focusable?: boolean;
  onResolutionDetected?: (resolution: VideoResolutionInfo) => void;
  hasNextEpisode?: boolean;
  onNextEpisode?: () => void;
  danmaku?: { videoTitle: string; episodeName: string; episodeIndex: number };
}

const DANMAKU_COPY = {
  "zh-CN": { loading: "正在加载弹幕…", empty: "本集暂无弹幕", error: "弹幕暂时不可用" },
  "zh-TW": { loading: "正在載入彈幕…", empty: "本集暫無彈幕", error: "彈幕暫時不可用" },
  en: { loading: "Loading danmaku…", empty: "No danmaku for this episode", error: "Danmaku is temporarily unavailable" },
} as const;

function mediaFailureMessage(status: number | undefined, messages: MediaPlayerMessages): string {
  if (status === 401) return messages.tokenInvalid; // MEDIA_TOKEN_INVALID
  if (status === 403) return messages.iptvDenied; // IPTV_ACCESS_REQUIRED
  if (status === 429) return messages.rateLimited; // RATE_LIMITED
  if (status === 502 || status === 504) return messages.upstreamFailed; // UPSTREAM_STREAM_ERROR
  if (status === 415) return messages.codecUnsupported;
  return messages.playbackFailed;
}

export function MediaPlayer({ target, route, title, userAgent, referer, mode = "standard", shellControls,
  messages = DEFAULT_MESSAGES, initialTime = 0, onProgress, onReady, onTerminalError, onClose,
  preferH264 = false, focusable = false,
  onResolutionDetected, hasNextEpisode = false, onNextEpisode, danmaku }: Readonly<MediaPlayerProps>) {
  const auth = useAuth()!;
  const { locale } = useLocale();
  const playerSettings = usePlayerSettings(auth.session.accountId, mode);
  const danmakuState = useDanmaku({
    enabled: playerSettings.danmakuEnabled && Boolean(danmaku), mode,
    videoTitle: danmaku?.videoTitle, episodeName: danmaku?.episodeName, episodeIndex: danmaku?.episodeIndex,
  });
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const terminalErrorReported = useRef(false);
  const readyReported = useRef(false);
  const resumedTarget = useRef("");
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [adMenuOpen, setAdMenuOpen] = useState(false);
  const [videoTogetherOpen, setVideoTogetherOpen] = useState(false);
  const videoTogetherVisible = Boolean(shellControls) && playerSettings.videoTogetherEnabled;
  const protectedMediaUrl = useMemo(
    () => buildMediaUrl(route, target, { userAgent, referer, ...(route === "proxy" ? {
      adFilterMode: playerSettings.adFilterMode,
      adKeywords: playerSettings.adKeywords,
    } : {}) }),
    [playerSettings.adFilterMode, playerSettings.adKeywords, referer, route, target, userAgent],
  );
  const playbackSources = useMemo(
    () => resolvePlaybackSources(route, target, protectedMediaUrl, playerSettings.proxyMode),
    [playerSettings.proxyMode, protectedMediaUrl, route, target],
  );
  const [mediaUrl, setMediaUrl] = useState(playbackSources.primarySrc);
  const likelyHls = route === "iptv-stream" || /\.m3u8?(?:$|[?#])/i.test(target);
  const handleLoading = useCallback(() => {
    terminalErrorReported.current = false;
    readyReported.current = false;
    setMessage("");
    setPhase("loading");
  }, []);
  const handleReady = useCallback(() => {
    setPhase("ready");
    if (!readyReported.current) { readyReported.current = true; onReady?.(); }
  }, [onReady]);
  const handleMediaError = useCallback((status?: number) => {
    setMessage(mediaFailureMessage(status, messages));
    setPhase("error");
    if (!terminalErrorReported.current) {
      terminalErrorReported.current = true;
      onTerminalError?.();
    }
  }, [messages, onTerminalError]);
  const { isTouchInput } = useMobilePlayer();
  const fullscreenControls = useFullscreenControls(playerRef);
  const pictureInPicture = usePictureInPicture(videoRef, playerRef);
  const castControls = useCastControls(mediaUrl, videoRef);
  useScreenOrientation(fullscreenControls.fullscreen, isTouchInput);
  useHlsPlayer({ videoRef, src: playbackSources.primarySrc, fallbackSrc: playbackSources.fallbackSrc,
    likelyHls, proxyMode: playerSettings.proxyMode, retryKey: attempt, preferH264,
    onSourceChange: setMediaUrl, onLoading: handleLoading, onReady: handleReady, onError: handleMediaError });
  useAutoSkip({ videoRef, src: mediaUrl, currentTime, duration, isPlaying: playing,
    autoNextEpisode: playerSettings.autoNextEpisode,
    autoSkipIntro: playerSettings.autoSkipIntro && initialTime <= 0,
    skipIntroSeconds: playerSettings.skipIntroSeconds,
    autoSkipOutro: playerSettings.autoSkipOutro,
    skipOutroSeconds: playerSettings.skipOutroSeconds,
    hasNextEpisode,
    onNextEpisode,
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const resume = () => {
      if (resumedTarget.current === target || initialTime <= 0) return;
      const maximum = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : initialTime;
      video.currentTime = Math.min(initialTime, maximum);
      setCurrentTime(video.currentTime);
      resumedTarget.current = target;
    };
    const ready = () => { handleReady(); resume(); };
    const started = () => setPlaying(true);
    const stopped = () => setPlaying(false);
    const updateTime = () => {
      const nextTime = video.currentTime || 0;
      const nextDuration = Number.isFinite(video.duration) ? video.duration : 0;
      setCurrentTime(nextTime);
      onProgress?.({ currentTime: nextTime, duration: nextDuration });
    };
    const updateDuration = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const updateVolume = () => { setVolumeState(video.volume); setMuted(video.muted); };
    const updateRate = () => setPlaybackRate(video.playbackRate);
    video.addEventListener("canplay", ready);
    video.addEventListener("play", started);
    video.addEventListener("pause", stopped);
    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("durationchange", updateDuration);
    video.addEventListener("loadedmetadata", ready);
    video.addEventListener("volumechange", updateVolume);
    video.addEventListener("ratechange", updateRate);
    return () => {
      video.removeEventListener("canplay", ready);
      video.removeEventListener("play", started);
      video.removeEventListener("pause", stopped);
      video.removeEventListener("timeupdate", updateTime);
      video.removeEventListener("durationchange", updateDuration);
      video.removeEventListener("loadedmetadata", ready);
      video.removeEventListener("volumechange", updateVolume);
      video.removeEventListener("ratechange", updateRate);
    };
  }, [handleReady, initialTime, onProgress, target]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || phase !== "ready" || initialTime <= 0 || resumedTarget.current === target) return;
    const maximum = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : initialTime;
    video.currentTime = Math.min(initialTime, maximum);
    setCurrentTime(video.currentTime);
    resumedTarget.current = target;
  }, [initialTime, phase, target]);

  const stalled = useStallDetection(videoRef, playing);
  const resolution = useVideoResolution(videoRef);
  useEffect(() => { if (resolution) onResolutionDetected?.(resolution); }, [onResolutionDetected, resolution]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }, []);
  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(time, 0), Number.isFinite(video.duration) ? video.duration : time);
    setCurrentTime(video.currentTime);
  }, []);
  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }, []);
  const changeVolume = useCallback((nextVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.min(Math.max(nextVolume, 0), 1);
    video.volume = next;
    video.muted = next === 0;
    setVolumeState(next);
    setMuted(video.muted);
  }, []);
  const changeRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);
  const { skipForward, skipBackward } = useSkipControls(videoRef, duration, playerSettings.seekStepSeconds);
  const visibility = useControlsVisibility(playing, speedMenuOpen || adMenuOpen || (videoTogetherVisible && videoTogetherOpen));
  const doubleTap = useDoubleTap({
    onSingleTap: visibility.toggleControls,
    onDoubleTapLeft: skipBackward,
    onDoubleTapRight: skipForward,
  });
  const controlLabels = useMemo(() => shellControls ? {
    ...shellControls,
    seekBack: shellControls.seekBack.replace("{seconds}", String(playerSettings.seekStepSeconds)),
    seekForward: shellControls.seekForward.replace("{seconds}", String(playerSettings.seekStepSeconds)),
  } : null, [playerSettings.seekStepSeconds, shellControls]);
  useDesktopShortcuts({
    enabled: Boolean(shellControls), volume, onTogglePlay: togglePlay, onToggleMute: toggleMute,
    onSkipForward: skipForward, onSkipBackward: skipBackward, onVolumeChange: changeVolume,
    onToggleSystemFullscreen: fullscreenControls.systemAvailable ? fullscreenControls.toggleSystemFullscreen : undefined,
    onToggleWebFullscreen: fullscreenControls.toggleWebFullscreen,
    onTogglePictureInPicture: pictureInPicture.pipAvailable ? pictureInPicture.togglePictureInPicture : undefined,
    onEscape: onClose,
    onInteraction: visibility.showControls,
  });
  const isolatePlayerArrows = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!shellControls || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    if (event.target instanceof HTMLInputElement) return;
    event.stopPropagation();
    event.preventDefault();
    if (event.key === "ArrowLeft") skipBackward();
    else if (event.key === "ArrowRight") skipForward();
    else if (event.key === "ArrowUp") changeVolume(volume + 0.1);
    else changeVolume(volume - 0.1);
    visibility.showControls();
  }, [changeVolume, shellControls, skipBackward, skipForward, visibility, volume]);
  const isolatePlayerInputArrows = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target instanceof HTMLInputElement && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.stopPropagation();
    }
  }, []);
  const hideCursor = shouldHidePlayerCursor({
    fullscreen: fullscreenControls.fullscreen, playing, controlsVisible: visibility.controlsVisible,
    interactiveOverlay: speedMenuOpen || adMenuOpen || (videoTogetherVisible && videoTogetherOpen),
  });
  const proxyModeLabel = playerSettings.proxyMode === "none" ? (route === "proxy" ? messages.directMode : messages.nativeMode)
    : playerSettings.proxyMode === "always" ? messages.relayMode : messages.retryMode;

  return (
    <div ref={playerRef} className={`media-player${fullscreenControls.fullscreenMode === "window" ? " is-web-fullscreen" : ""}${hideCursor ? " is-cursor-hidden" : ""}`}
      data-phase={phase} data-proxy-mode={playerSettings.proxyMode} data-playback-strategy={`${likelyHls ? "hls" : "native"}-${playerSettings.proxyMode}`}
      data-input-mode={isTouchInput ? "touch" : "desktop"}
      data-fullscreen-type={playerSettings.fullscreenType} data-seek-step={playerSettings.seekStepSeconds}
      data-auto-next-episode={playerSettings.autoNextEpisode} data-auto-skip-intro={playerSettings.autoSkipIntro}
      data-auto-skip-outro={playerSettings.autoSkipOutro} data-ad-filter-mode={playerSettings.adFilterMode}
      data-danmaku-enabled={playerSettings.danmakuEnabled} data-danmaku-status={danmakuState.status}
      data-focusable={focusable || undefined} tabIndex={focusable ? 0 : undefined}
      onPointerMove={shellControls ? visibility.handlePointerMove : undefined}
      onPointerLeave={shellControls ? visibility.hideControlsNow : undefined}
      onFocusCapture={shellControls ? visibility.showControls : undefined}
      onBlurCapture={shellControls ? visibility.scheduleHide : undefined}
      onKeyDownCapture={shellControls ? isolatePlayerArrows : undefined}
      onKeyDown={shellControls ? isolatePlayerInputArrows : undefined}>
      <video ref={videoRef} controls={!shellControls} playsInline preload="metadata" aria-label="视频播放器"
        data-media-source={mediaUrl} onTouchEnd={shellControls && isTouchInput ? doubleTap.onTouchEnd : undefined} />
      {playerSettings.danmakuEnabled && danmakuState.comments.length > 0 && <DanmakuCanvas
        comments={danmakuState.comments} currentTime={currentTime} isPlaying={playing}
        opacity={playerSettings.danmakuOpacity} fontSize={playerSettings.danmakuFontSize}
        displayArea={playerSettings.danmakuDisplayArea} />}
      {playerSettings.danmakuEnabled && (["loading", "empty", "error"] as const).includes(
        danmakuState.status as "loading" | "empty" | "error",
      ) && <p className="danmaku-state" role="status">{DANMAKU_COPY[locale][danmakuState.status as "loading" | "empty" | "error"]}</p>}
      {(resolution || playerSettings.showModeIndicator) && <div className="player-status-badges" aria-live="polite">
        {resolution && <span className="player-resolution-badge">{resolution.label}</span>}
        {playerSettings.showModeIndicator && <span className="player-proxy-badge">{proxyModeLabel}</span>}
      </div>}
      {controlLabels && <DesktopControls visible={visibility.controlsVisible} playing={playing} currentTime={currentTime}
        duration={duration} volume={volume} muted={muted} playbackRate={playbackRate} speedMenuOpen={speedMenuOpen}
        adFilterMode={playerSettings.adFilterMode} adMenuOpen={adMenuOpen}
        fullscreenMode={fullscreenControls.fullscreenMode} systemAvailable={fullscreenControls.systemAvailable}
        pipAvailable={pictureInPicture.pipAvailable} pipActive={pictureInPicture.pipActive}
        castAvailable={castControls.castAvailable} castActive={castControls.castActive}
        labels={controlLabels} onTogglePlay={togglePlay} onSeek={seek} onSkipBackward={skipBackward}
        onSkipForward={skipForward} onToggleMute={toggleMute} onVolumeChange={changeVolume}
        onSpeedMenuOpenChange={(open) => { setSpeedMenuOpen(open); if (open) { setAdMenuOpen(false); setVideoTogetherOpen(false); } }}
        onAdMenuOpenChange={(open) => { setAdMenuOpen(open); if (open) { setSpeedMenuOpen(false); setVideoTogetherOpen(false); } }}
        onAdFilterModeChange={(value) => playerSettings.set("adFilterMode", value)} onRateChange={changeRate}
        onToggleSystemFullscreen={fullscreenControls.toggleSystemFullscreen}
        onToggleWebFullscreen={fullscreenControls.toggleWebFullscreen}
        onTogglePictureInPicture={pictureInPicture.togglePictureInPicture}
        onShowCastMenu={castControls.showCastMenu} />}
      {videoTogetherVisible && <VideoTogetherController visible={visibility.controlsVisible} open={videoTogetherOpen}
        onOpenChange={(open) => { setVideoTogetherOpen(open); if (open) { setSpeedMenuOpen(false); setAdMenuOpen(false); } }} />}
      {phase === "loading" && <p className="media-overlay media-loading" role="status">
        <span className="media-loading-spinner" aria-hidden="true" />
        <span className="sr-only">{messages.connecting}</span>
      </p>}
      {phase === "ready" && stalled && <p className="media-overlay media-stalled" role="status">{messages.buffering}</p>}
      {phase === "error" && (
        <div className="media-overlay media-error" role="alert">
          <p>{message}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>{messages.retryPlayback}</button>
        </div>
      )}
      <span className="sr-only">{title}</span>
    </div>
  );
}
