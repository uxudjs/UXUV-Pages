"use client";

import Link from "next/link";
import { FormEvent, useMemo, useRef, useState } from "react";
import { ContentNavigation } from "@/components/ContentNavigation";
import { VideoCard } from "@/components/VideoCard";
import { useSync } from "@/components/SyncProvider";
import { ContentApiError } from "@/lib/content/api-client";
import { searchVideos, type SearchProgress } from "@/lib/content/search-client";
import { useAuth } from "@/lib/store/auth-store";
import {
  favoriteFromVideo,
  isFavoriteRecord,
  isHistoryRecord,
  isVideoSource,
  type Video,
  videoRecordId,
} from "@/lib/content/types";

type SearchState = "idle" | "loading" | "ready" | "empty" | "error" | "cancelled";

export function HomeExperience() {
  const { documents, upsertRecord, removeRecord } = useSync();
  const auth = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Video[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<SearchProgress>({ completed: 0, total: 0, found: 0 });
  const controller = useRef<AbortController | null>(null);
  const sources = useMemo(
    () => "sources" in documents.config.payload
      ? documents.config.payload.sources.filter(isVideoSource).filter(({ group }) => group !== "premium") : [],
    [documents.config.payload],
  );
  const favorites = useMemo(
    () => "favorites" in documents.library.payload
      ? documents.library.payload.favorites.filter(isFavoriteRecord) : [],
    [documents.library.payload],
  );
  const history = useMemo(
    () => "history" in documents.library.payload
      ? documents.library.payload.history.filter(isHistoryRecord).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)
      : [],
    [documents.library.payload],
  );
  const favoriteIds = useMemo(() => new Set(favorites.map(({ id }) => id)), [favorites]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized || sources.length === 0) return;
    controller.current?.abort();
    controller.current = new AbortController();
    setState("loading");
    setMessage("");
    setResults([]);
    setProgress({ completed: 0, total: sources.length, found: 0 });
    try {
      const found = await searchVideos(normalized, sources, {
        signal: controller.current.signal,
        onProgress: setProgress,
      });
      setResults(found);
      setState(found.length > 0 ? "ready" : "empty");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof ContentApiError && error.status === 401) auth?.markSessionExpired();
      setMessage(error instanceof Error ? error.message : "搜索失败，请稍后重试。");
      setState("error");
    }
  };

  const cancelSearch = () => {
    controller.current?.abort();
    setMessage("已取消搜索。");
    setState("cancelled");
  };

  const toggleFavorite = (video: Video) => {
    const id = videoRecordId(video.source, video.vod_id);
    if (favoriteIds.has(id)) removeRecord("library", "favorites", id);
    else upsertRecord("library", "favorites", favoriteFromVideo(video));
  };

  return (
    <div className="content-shell">
      <ContentNavigation />
      <main className="content-main">
        <header className="hero-panel">
          <p className="public-kicker">PRIVATE MEDIA SEARCH</p>
          <h1>找到下一部想看的影片</h1>
          <p>从你的个人视频源并行搜索，结果和收藏只在当前账户中保存。</p>
          <form className="search-form" onSubmit={(event) => void submit(event)}>
            <label htmlFor="content-search">搜索影视内容</label>
            <div>
              <input id="content-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入片名、演员或关键词" />
              <button className="primary-button" type="submit" disabled={state === "loading" || sources.length === 0}>搜索</button>
              {state === "loading" && <button type="button" onClick={cancelSearch}>取消</button>}
            </div>
          </form>
          {sources.length === 0 && <p className="content-message">尚未配置可用视频源，请先前往设置。</p>}
        </header>

        {history.length > 0 && state === "idle" && (
          <section className="content-section" aria-labelledby="history-title">
            <div className="section-title"><h2 id="history-title">继续观看</h2></div>
            <div className="history-row">
              {history.map((item) => (
                <Link key={item.id} prefetch={false} href={`/player?${new URLSearchParams({ id: String(item.videoId), source: item.source, title: item.title }).toString()}`}>
                  <strong>{item.title}</strong><span>继续播放</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {state === "loading" && <p className="content-message" role="status">正在搜索… {progress.completed}/{progress.total} 个源，已找到 {progress.found} 条</p>}
        {progress.capability && <p className="capability-hint">服务端 {progress.capability.profile === "paid" ? "Paid" : "Free"}：最多 {progress.capability.limits.sources} 个源、{progress.capability.limits.videos} 条结果。</p>}
        {state === "cancelled" && <p className="content-message" role="status">{message}</p>}
        {state === "empty" && <p className="content-message" role="status">没有找到匹配结果，请尝试其他关键词。</p>}
        {state === "error" && <p className="form-error content-message" role="alert">{message}</p>}
        {state === "ready" && (
          <section className="content-section" aria-labelledby="results-title">
            <div className="section-title"><h2 id="results-title">搜索结果</h2><span>{results.length} 条</span></div>
            <div className="video-grid">{results.map((video) => (
              <VideoCard key={videoRecordId(video.source, video.vod_id)} video={video} sources={sources} favorite={favoriteIds.has(videoRecordId(video.source, video.vod_id))} onToggleFavorite={toggleFavorite} />
            ))}</div>
          </section>
        )}
      </main>
    </div>
  );
}
