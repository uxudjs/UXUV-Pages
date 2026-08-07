"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ContentNavigation } from "@/components/ContentNavigation";
import { MediaPlayer } from "@/components/media/MediaPlayer";
import { useSync } from "@/components/SyncProvider";
import { ContentApiError } from "@/lib/content/api-client";
import { isVideoSource, videoRecordId } from "@/lib/content/types";
import { getVideoDetail, type VideoDetail } from "@/lib/media/media-client";
import { useAuth } from "@/lib/store/auth-store";

function detailFailure(error: unknown): string {
  if (!(error instanceof ContentApiError)) return error instanceof Error ? error.message : "无法加载视频详情。";
  if (error.status === 401) return "登录会话已失效，请重新登录。";
  if (error.status === 429) return "详情请求过于频繁，请稍后重试。";
  if (error.status >= 500) return "视频来源暂时不可用，请稍后重试。";
  return error.message;
}

export function PlayerExperience() {
  const parameters = useSearchParams();
  const auth = useAuth();
  const { documents, upsertRecord } = useSync();
  const videoId = parameters.get("id") || "";
  const sourceId = parameters.get("source") || "";
  const requestedEpisode = Math.max(0, Number(parameters.get("episode")) || 0);
  const sources = useMemo(
    () => "sources" in documents.config.payload ? documents.config.payload.sources.filter(isVideoSource) : [],
    [documents.config.payload],
  );
  const source = sources.find(({ id }) => id === sourceId);
  const premium = source?.group === "premium";
  const [detail, setDetail] = useState<VideoDetail | null>(null);
  const [episodeIndex, setEpisodeIndex] = useState(requestedEpisode);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const recorded = useRef("");

  useEffect(() => {
    if (!videoId || !source) {
      queueMicrotask(() => {
        setState("error");
        setMessage(!videoId || !sourceId ? "播放链接缺少视频或来源信息。" : "当前来源配置不存在，请返回搜索页重试。");
      });
      return;
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setState("loading");
        setMessage("");
      }
    });
    void getVideoDetail(videoId, source, controller.signal).then((value) => {
      setDetail(value);
      setEpisodeIndex(Math.min(requestedEpisode, Math.max(0, value.episodes.length - 1)));
      setState("ready");
    }).catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof ContentApiError && error.status === 401) auth?.markSessionExpired();
      setMessage(detailFailure(error));
      setState("error");
    });
    return () => controller.abort();
  }, [attempt, auth, requestedEpisode, source, sourceId, videoId]);

  const episode = detail?.episodes[episodeIndex] ?? null;
  useEffect(() => {
    if (!detail || !episode) return;
    const key = `${detail.source}:${detail.vod_id}:${episode.index}`;
    if (recorded.current === key) return;
    recorded.current = key;
    const now = Date.now();
    upsertRecord("library", "history", {
      id: videoRecordId(detail.source, detail.vod_id),
      updatedAt: now,
      videoId: detail.vod_id,
      title: detail.vod_name,
      source: detail.source,
      poster: detail.vod_pic,
      episodeIndex: episode.index,
      playbackPosition: 0,
      duration: 0,
    });
  }, [detail, episode, upsertRecord]);

  const selectEpisode = (index: number) => {
    setEpisodeIndex(index);
    const url = new URL(window.location.href);
    url.searchParams.set("episode", String(index));
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  };

  return (
    <div className="content-shell">
      <ContentNavigation premium={premium} />
      <main className="content-main player-main">
        {state === "loading" && <p className="content-message" role="status">正在加载视频详情…</p>}
        {state === "error" && (
          <section className="empty-collection" role="alert">
            <h1>无法开始播放</h1><p>{message}</p>
            {videoId && source && <button type="button" onClick={() => setAttempt((value) => value + 1)}>重试</button>}
          </section>
        )}
        {state === "ready" && detail && (
          <>
            <header className="player-heading">
              <p className="public-kicker">PROTECTED PLAYBACK</p>
              <h1>{detail.vod_name}</h1>
              <p>{[source?.name, detail.type_name, detail.vod_year].filter(Boolean).join(" · ")}</p>
            </header>
            <div className="player-layout">
              <section aria-label="播放区域">
                {episode ? (
                  <MediaPlayer
                    key={`${sourceId}:${episode.index}`}
                    target={episode.url}
                    route="proxy"
                    title={`${detail.vod_name} ${episode.name}`}
                  />
                ) : <p className="content-message" role="alert">当前视频没有可播放的剧集。</p>}
                <article className="player-panel media-metadata">
                  <h2>视频信息</h2>
                  <p>{detail.vod_content || detail.vod_remarks || "暂无简介。"}</p>
                  <dl>
                    <div><dt>演员</dt><dd>{detail.vod_actor || "未知"}</dd></div>
                    <div><dt>地区</dt><dd>{detail.vod_area || "未知"}</dd></div>
                  </dl>
                </article>
              </section>
              <aside className="player-panel episode-panel" aria-labelledby="episode-title">
                <div className="section-title"><h2 id="episode-title">选集</h2><span>{detail.episodes.length} 集</span></div>
                <div className="episode-grid">
                  {detail.episodes.map((item) => (
                    <button key={`${item.index}:${item.url}`} type="button" aria-current={item.index === episodeIndex ? "true" : undefined} onClick={() => selectEpisode(item.index)}>
                      {item.name}
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
