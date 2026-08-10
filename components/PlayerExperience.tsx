"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MediaPlayer } from "@/components/media/MediaPlayer";
import { EpisodeList } from "@/components/player/EpisodeList";
import { PlayerFavoriteButton } from "@/components/player/PlayerFavoriteButton";
import { PlayerNavbar } from "@/components/player/PlayerNavbar";
import { VideoMetadata } from "@/components/player/VideoMetadata";
import { usePlaybackHistory, type PlaybackProgress } from "@/components/player/hooks/usePlaybackHistory";
import { useSourceResolutionProbe } from "@/components/player/hooks/useSourceResolutionProbe";
import type { VideoResolutionInfo } from "@/components/player/hooks/useVideoResolution";
import { useLocale } from "@/components/LocaleProvider";
import { useSync } from "@/components/SyncProvider";
import { ContentApiError } from "@/lib/content/api-client";
import { isHistoryRecord, isVideoSource, type HistoryRecord, type Video } from "@/lib/content/types";
import { useLatencyPing } from "@/lib/hooks/useLatencyPing";
import { parseGroupedSources, readGroupedSources, sortPlaybackSources, storeGroupedSources, type GroupedSource } from "@/lib/media/grouped-sources-cache";
import { getVideoDetail, type VideoDetail } from "@/lib/media/media-client";
import { useAuth } from "@/lib/store/auth-store";

type PlayerViewportMode = "standard" | "wide" | "cinema";

const COPY = {
  "zh-CN": { loading: "正在加载视频详情…", failed: "无法开始播放", missing: "播放链接缺少视频或来源信息。",
    sourceMissing: "当前来源配置不存在，请返回搜索页重试。", session: "登录会话已失效，请重新登录。", rate: "详情请求过于频繁，请稍后重试。",
    upstream: "视频来源暂时不可用，请稍后重试。", retry: "重试", player: "播放区域", empty: "当前视频没有可播放的剧集。",
    window: "播放窗口大小", windowHint: "右侧源列表或选集折叠后，会自动提升到更宽的布局", standard: "标准", wide: "宽屏", cinema: "影院", episodes: "选集", info: "简介", play: "播放", pause: "暂停",
    mute: "静音", unmute: "取消静音", progress: "播放进度", volume: "音量", speed: "播放速度", seekBack: "后退 {seconds} 秒", seekForward: "前进 {seconds} 秒",
    pip: "画中画", pipUnavailable: "当前浏览器或设备不支持画中画", cast: "投放", castUnavailable: "未检测到可用的 Google Cast 能力",
    webFullscreen: "网页全屏", exitWebFullscreen: "退出网页全屏", systemFullscreen: "系统全屏", exitSystemFullscreen: "退出系统全屏",
    systemFullscreenUnavailable: "当前浏览器不支持系统全屏", connecting: "正在连接受保护媒体…", buffering: "正在缓冲…", retryPlayback: "重试播放",
    tokenInvalid: "媒体授权已过期，请重试。", iptvDenied: "当前账户没有 IPTV 播放权限。", rateLimited: "媒体请求过于频繁，请稍后重试。",
    upstreamFailed: "上游媒体暂时中断，请重试或切换线路。", playbackFailed: "媒体播放失败，请重试或切换线路。", codecUnsupported: "当前浏览器不支持此媒体的编解码格式。",
    nativeMode: "原生解码", retryMode: "智能重试", relayMode: "始终中继",
    adFilter: "广告过滤", adOff: "关闭", adKeyword: "关键词", adHeuristic: "启发式", adAggressive: "激进" },
  "zh-TW": { loading: "正在載入影片詳情…", failed: "無法開始播放", missing: "播放連結缺少影片或來源資訊。",
    sourceMissing: "目前來源設定不存在，請返回搜尋頁重試。", session: "登入工作階段已失效，請重新登入。", rate: "詳情請求過於頻繁，請稍後重試。",
    upstream: "影片來源暫時無法使用，請稍後重試。", retry: "重試", player: "播放區域", empty: "目前影片沒有可播放的劇集。",
    window: "播放視窗大小", windowHint: "右側來源列表或選集收合後，會自動提升到更寬的版面", standard: "標準", wide: "寬螢幕", cinema: "影院", episodes: "選集", info: "簡介", play: "播放", pause: "暫停",
    mute: "靜音", unmute: "取消靜音", progress: "播放進度", volume: "音量", speed: "播放速度", seekBack: "後退 {seconds} 秒", seekForward: "前進 {seconds} 秒",
    pip: "子母畫面", pipUnavailable: "目前瀏覽器或裝置不支援子母畫面", cast: "投放", castUnavailable: "未偵測到可用的 Google Cast 能力",
    webFullscreen: "網頁全螢幕", exitWebFullscreen: "退出網頁全螢幕", systemFullscreen: "系統全螢幕", exitSystemFullscreen: "退出系統全螢幕",
    systemFullscreenUnavailable: "目前瀏覽器不支援系統全螢幕", connecting: "正在連接受保護媒體…", buffering: "正在緩衝…", retryPlayback: "重試播放",
    tokenInvalid: "媒體授權已過期，請重試。", iptvDenied: "目前帳戶沒有 IPTV 播放權限。", rateLimited: "媒體請求過於頻繁，請稍後重試。",
    upstreamFailed: "上游媒體暫時中斷，請重試或切換線路。", playbackFailed: "媒體播放失敗，請重試或切換線路。", codecUnsupported: "目前瀏覽器不支援此媒體的編解碼格式。",
    nativeMode: "原生解碼", retryMode: "智慧重試", relayMode: "始終中繼",
    adFilter: "廣告過濾", adOff: "關閉", adKeyword: "關鍵詞", adHeuristic: "啟發式", adAggressive: "積極" },
  en: { loading: "Loading video details…", failed: "Playback unavailable", missing: "The playback link is missing its video or source.",
    sourceMissing: "This source is no longer configured. Return to search and try again.", session: "Your session expired. Sign in again.", rate: "Too many detail requests. Try again shortly.",
    upstream: "The video source is temporarily unavailable.", retry: "Retry", player: "Player", empty: "This title has no playable episodes.",
    window: "Player width", windowHint: "Collapsing sources or episodes automatically gives the player more room", standard: "Standard", wide: "Wide", cinema: "Cinema", episodes: "Episodes", info: "Info", play: "Play", pause: "Pause",
    mute: "Mute", unmute: "Unmute", progress: "Playback progress", volume: "Volume", speed: "Playback speed", seekBack: "Back {seconds} seconds", seekForward: "Forward {seconds} seconds",
    pip: "Picture in picture", pipUnavailable: "Picture in picture is unavailable on this browser or device", cast: "Cast", castUnavailable: "Google Cast capability was not detected",
    webFullscreen: "Web fullscreen", exitWebFullscreen: "Exit web fullscreen", systemFullscreen: "System fullscreen", exitSystemFullscreen: "Exit system fullscreen",
    systemFullscreenUnavailable: "System fullscreen is unavailable in this browser", connecting: "Connecting to protected media…", buffering: "Buffering…", retryPlayback: "Retry playback",
    tokenInvalid: "Media authorization expired. Try again.", iptvDenied: "This account cannot play IPTV.", rateLimited: "Too many media requests. Try again shortly.",
    upstreamFailed: "The upstream media stopped. Retry or switch sources.", playbackFailed: "Playback failed. Retry or switch sources.", codecUnsupported: "This browser cannot decode this media format.",
    nativeMode: "Native decoding", retryMode: "Smart retry", relayMode: "Always relay",
    adFilter: "Ad filtering", adOff: "Off", adKeyword: "Keywords", adHeuristic: "Heuristic", adAggressive: "Aggressive" },
} as const;

function detailFailure(error: unknown, copy: typeof COPY[keyof typeof COPY]): string {
  if (!(error instanceof ContentApiError)) return error instanceof Error ? error.message : copy.upstream;
  if (error.status === 401) return copy.session;
  if (error.status === 429) return copy.rate;
  if (error.status >= 500) return copy.upstream;
  return error.message;
}

export function PlayerExperience() {
  const parameters = useSearchParams();
  const router = useRouter();
  const auth = useAuth();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const { documents, upsertRecord } = useSync();
  const videoId = parameters.get("id") || "";
  const sourceId = parameters.get("source") || "";
  const requestedEpisode = Math.max(0, Number(parameters.get("episode")) || 0);
  const requestedTimeValue = Number(parameters.get("t"));
  const requestedTime = Number.isFinite(requestedTimeValue) && requestedTimeValue > 0 ? requestedTimeValue : 0;
  const legacyGroupedSources = parameters.get("groupedSources");
  const groupedSourcesKey = parameters.get("gs") || "";
  const configuredSources = useMemo(
    () => "sources" in documents.config.payload ? documents.config.payload.sources.filter(isVideoSource) : [],
    [documents.config.payload],
  );
  const source = configuredSources.find(({ id }) => id === sourceId);
  const premium = parameters.get("premium") === "1" || source?.group === "premium";
  const [groupedSources, setGroupedSources] = useState<GroupedSource[]>([]);
  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [episodeIndex, setEpisodeIndex] = useState(requestedEpisode);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [activeTab, setActiveTab] = useState<"episodes" | "info">("episodes");
  const [sourceSectionCollapsed, setSourceSectionCollapsed] = useState(false);
  const [episodeSectionCollapsed, setEpisodeSectionCollapsed] = useState(false);
  const [viewportMode, setViewportMode] = useState<PlayerViewportMode>(() => {
    if (typeof window === "undefined") return "standard";
    const saved = localStorage.getItem(`uxuv-player-viewport:v1:${auth?.session.accountId || "anonymous"}:${premium ? "premium" : "standard"}`);
    return saved === "standard" || saved === "wide" || saved === "cinema" ? saved : "standard";
  });
  const playerTimeRef = useRef(0);
  const failedSources = useMemo(() => new Set((parameters.get("failed") || "").split(",")
    .filter((value) => /^[A-Za-z0-9_.:-]{1,160}$/.test(value)).slice(0, 32)), [parameters]);

  const chooseViewportMode = (mode: PlayerViewportMode) => {
    setViewportMode(mode);
    localStorage.setItem(`uxuv-player-viewport:v1:${auth?.session.accountId || "anonymous"}:${premium ? "premium" : "standard"}`, mode);
  };
  const effectiveViewport = viewportMode === "cinema" || (viewportMode === "wide" && !sourceSectionCollapsed && !episodeSectionCollapsed)
    ? viewportMode : sourceSectionCollapsed && episodeSectionCollapsed ? "cinema" : sourceSectionCollapsed || episodeSectionCollapsed ? "wide" : viewportMode;

  useEffect(() => {
    let candidates: GroupedSource[] = [];
    if (groupedSourcesKey) candidates = readGroupedSources(groupedSourcesKey);
    else if (legacyGroupedSources) {
      try { candidates = parseGroupedSources(JSON.parse(legacyGroupedSources)); } catch { candidates = []; }
      const key = storeGroupedSources(candidates);
      if (key) {
        const url = new URL(window.location.href);
        url.searchParams.delete("groupedSources");
        url.searchParams.set("gs", key);
        window.history.replaceState(null, "", `${url.pathname}${url.search}`);
      }
    }
    if (source && videoId && !candidates.some((item) => item.source === sourceId)) {
      candidates.unshift({ id: videoId, source: sourceId, sourceName: source.name });
    }
    queueMicrotask(() => setGroupedSources(candidates));
  }, [groupedSourcesKey, legacyGroupedSources, source, sourceId, videoId]);

  const playbackSourceConfigs = useMemo(() => {
    const ids = new Set(groupedSources.map(({ source: id }) => id));
    return configuredSources.filter(({ id }) => ids.has(id));
  }, [configuredSources, groupedSources]);
  const { latencies } = useLatencyPing(playbackSourceConfigs, groupedSources.length > 1);
  const diagnosedSources = useMemo(() => sortPlaybackSources(groupedSources.map((candidate) => ({
    ...candidate, latency: latencies[candidate.source] ?? candidate.latency,
  }))), [groupedSources, latencies]);
  const { sourceResolutions, recordPlayedResolution } = useSourceResolutionProbe(
    groupedSources, playbackSourceConfigs, episodeIndex,
  );

  useEffect(() => {
    if (!videoId || !source) {
      queueMicrotask(() => { setState("error"); setMessage(!videoId || !sourceId ? copy.missing : copy.sourceMissing); });
      return;
    }
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) { setState("loading"); setMessage(""); } });
    void getVideoDetail(videoId, source, controller.signal).then((value) => {
      setDetail(value);
      setEpisodeIndex(Math.min(requestedEpisode, Math.max(0, value.episodes.length - 1)));
      setState("ready");
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof ContentApiError && error.status === 401) auth?.markSessionExpired();
      setMessage(detailFailure(error, copy));
      setState("error");
    });
    return () => controller.abort();
  }, [attempt, auth, copy, requestedEpisode, source, sourceId, videoId]);

  const episode = detail?.episodes[episodeIndex] ?? null;
  const historyRecords = useMemo(() => "history" in documents.library.payload
    ? documents.library.payload.history.filter(isHistoryRecord) : [], [documents.library.payload]);
  const upsertHistory = useCallback((record: HistoryRecord, syncDelay: number) => {
    upsertRecord("library", "history", record, syncDelay);
  }, [upsertRecord]);
  const playbackHistory = usePlaybackHistory({ records: historyRecords, videoId: detail?.vod_id, title: detail?.vod_name,
    source: detail?.source, poster: detail?.vod_pic, episodeIndex, mode: premium ? "premium" : "standard",
    requestedTime, upsert: upsertHistory });
  const handlePlaybackProgress = useCallback((progress: PlaybackProgress) => {
    playerTimeRef.current = progress.currentTime;
    playbackHistory.onProgress(progress);
  }, [playbackHistory]);
  const handleResolutionDetected = useCallback((resolution: VideoResolutionInfo) => {
    if (!detail) return;
    recordPlayedResolution(detail.source, detail.vod_id, resolution);
  }, [detail, recordPlayedResolution]);
  const playbackIdentity = `${parameters.get("title") || detail?.vod_name || videoId}:${episodeIndex}:${premium}`;
  useEffect(() => {
    playerTimeRef.current = 0;
  }, [playbackIdentity]);

  const selectEpisode = (index: number) => {
    setEpisodeIndex(index);
    playerTimeRef.current = 0;
    const url = new URL(window.location.href);
    url.searchParams.set("episode", String(index));
    url.searchParams.delete("t");
    url.searchParams.delete("failed");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };
  const selectSource = useCallback((next: GroupedSource, failures?: ReadonlySet<string>) => {
    const params = new URLSearchParams({ id: String(next.id), source: next.source, title: detail?.vod_name || parameters.get("title") || "", episode: String(episodeIndex) });
    const key = groupedSourcesKey || storeGroupedSources(diagnosedSources);
    if (key) params.set("gs", key);
    if (premium) params.set("premium", "1");
    if (playerTimeRef.current > 1) params.set("t", String(playerTimeRef.current));
    if (failures?.size) params.set("failed", [...failures].join(","));
    router.replace(`/player?${params}`);
  }, [detail?.vod_name, diagnosedSources, episodeIndex, groupedSourcesKey, parameters, premium, router]);
  const handleTerminalError = useCallback(() => {
    const failures = new Set(failedSources);
    failures.add(sourceId);
    const next = diagnosedSources
      .find((candidate) => candidate.source !== sourceId && !failures.has(candidate.source));
    if (next) selectSource(next, failures);
  }, [diagnosedSources, failedSources, selectSource, sourceId]);
  const favoriteVideo: Video | null = detail ? {
    vod_id: detail.vod_id, vod_name: detail.vod_name, vod_pic: detail.vod_pic, vod_remarks: detail.vod_remarks,
    vod_year: detail.vod_year, type_name: detail.type_name, vod_lang: detail.vod_lang, source: detail.source,
    sourceName: source?.name, mode: premium ? "premium" : "standard",
  } : null;

  return <div className="player-shell">
    <PlayerNavbar premium={premium} />
    <main className="player-main">
      {state === "loading" && <p className="content-message" role="status">{copy.loading}</p>}
      {state === "error" && <section className="empty-collection player-route-error" role="alert">
        <h1>{copy.failed}</h1><p>{message}</p>
        {videoId && source && <button type="button" onClick={() => setAttempt((value) => value + 1)} data-focusable>{copy.retry}</button>}
      </section>}
      {state === "ready" && detail && <div className="player-ready">
        <section className="player-viewport-control" aria-label={copy.window}>
          <div><strong>{copy.window}</strong><span>{copy.windowHint}</span></div>
          <div role="group" aria-label={copy.window}>
            {(["standard", "wide", "cinema"] as const).map((mode) => <button key={mode} type="button"
              aria-pressed={viewportMode === mode} onClick={() => chooseViewportMode(mode)} data-focusable>{copy[mode]}</button>)}
          </div>
        </section>
        <div className="player-layout" data-viewport={effectiveViewport}>
          <section className="player-primary" aria-label={copy.player}>
            <div data-no-spatial>{episode ? <MediaPlayer key={`${sourceId}:${episode.index}`} target={episode.url}
              route="proxy" title={`${detail.vod_name} ${episode.name}`} mode={premium ? "premium" : "standard"}
              danmaku={{ videoTitle: detail.vod_name, episodeName: episode.name, episodeIndex }}
              messages={copy} initialTime={playbackHistory.initialTime} onProgress={handlePlaybackProgress}
              onTerminalError={handleTerminalError} onResolutionDetected={handleResolutionDetected}
              hasNextEpisode={episodeIndex < detail.episodes.length - 1}
              onNextEpisode={() => selectEpisode(episodeIndex + 1)}
              shellControls={{ play: copy.play, pause: copy.pause, mute: copy.mute, unmute: copy.unmute,
                progress: copy.progress, volume: copy.volume, speed: copy.speed, seekBack: copy.seekBack, seekForward: copy.seekForward,
                adFilter: copy.adFilter, adOff: copy.adOff, adKeyword: copy.adKeyword,
                adHeuristic: copy.adHeuristic, adAggressive: copy.adAggressive,
                pip: copy.pip, pipUnavailable: copy.pipUnavailable, cast: copy.cast, castUnavailable: copy.castUnavailable,
                webFullscreen: copy.webFullscreen, exitWebFullscreen: copy.exitWebFullscreen,
                systemFullscreen: copy.systemFullscreen, exitSystemFullscreen: copy.exitSystemFullscreen,
                systemFullscreenUnavailable: copy.systemFullscreenUnavailable }} />
              : <p className="content-message player-empty" role="alert">{copy.empty}</p>}</div>
            <div className="desktop-metadata"><VideoMetadata detail={detail} sourceName={source?.name || detail.source} /></div>
            {favoriteVideo && <PlayerFavoriteButton video={favoriteVideo} />}
          </section>
          <section className="player-secondary">
            <div className="player-mobile-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={activeTab === "episodes"} onClick={() => setActiveTab("episodes")} data-focusable>{copy.episodes}</button>
              <button type="button" role="tab" aria-selected={activeTab === "info"} onClick={() => setActiveTab("info")} data-focusable>{copy.info}</button>
            </div>
            <div className={`mobile-metadata${activeTab === "info" ? " is-active" : ""}`}><VideoMetadata detail={detail} sourceName={source?.name || detail.source} /></div>
            <div className={`player-episode-wrapper${activeTab === "episodes" ? " is-active" : ""}`}>
              <EpisodeList episodes={detail.episodes} currentEpisode={episodeIndex} onEpisodeChange={selectEpisode}
                sources={diagnosedSources} sourceResolutions={sourceResolutions} currentSource={sourceId} onSourceChange={selectSource}
                sourceSectionCollapsed={sourceSectionCollapsed} onSourceSectionCollapseChange={setSourceSectionCollapsed}
                episodeSectionCollapsed={episodeSectionCollapsed} onEpisodeSectionCollapseChange={setEpisodeSectionCollapsed} />
            </div>
          </section>
        </div>
      </div>}
    </main>
  </div>;
}
