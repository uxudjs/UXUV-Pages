"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ContentNavigation } from "@/components/ContentNavigation";
import { useSync } from "@/components/SyncProvider";
import { VideoCard } from "@/components/VideoCard";
import { ContentApiError } from "@/lib/content/api-client";
import { loadPremiumCategory, loadPremiumTypes, unlockPremium, type PremiumTag } from "@/lib/content/premium-client";
import { searchVideos, type SearchProgress } from "@/lib/content/search-client";
import { favoriteFromVideo, isFavoriteRecord, isVideoSource, type ContentCapability, type Video, videoRecordId } from "@/lib/content/types";
import { useAuth } from "@/lib/store/auth-store";

type PremiumState = "loading" | "locked" | "ready" | "empty" | "error";

export function PremiumExperience() {
  const auth = useAuth();
  const { documents, upsertRecord, removeRecord } = useSync();
  const [state, setState] = useState<PremiumState>("loading");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<PremiumTag[]>([]);
  const [selectedTag, setSelectedTag] = useState("recommend");
  const [videos, setVideos] = useState<Video[]>([]);
  const [capability, setCapability] = useState<ContentCapability | null>(null);
  const [progress, setProgress] = useState<SearchProgress>({ completed: 0, total: 0, found: 0 });
  const controller = useRef<AbortController | null>(null);
  const sources = useMemo(() => "sources" in documents.config.payload
    ? documents.config.payload.sources.filter(isVideoSource).filter(({ group }) => group === "premium") : [],
  [documents.config.payload]);
  const favoriteIds = useMemo(() => new Set("favorites" in documents.library.payload
    ? documents.library.payload.favorites.filter(isFavoriteRecord).filter(({ mode }) => mode === "premium").map(({ id }) => id) : []),
  [documents.library.payload]);

  const fail = useCallback((error: unknown) => {
    if (error instanceof ContentApiError && error.status === 401) auth?.markSessionExpired();
    if (error instanceof ContentApiError && error.status === 403) {
      setMessage("Premium 授权已失效，请重新解锁。");
      setState("locked");
    } else {
      setMessage(error instanceof Error ? error.message : "Premium 服务暂时不可用。");
      setState("error");
    }
  }, [auth]);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (sources.length === 0) {
      setMessage("尚未配置 Premium 视频源。");
      setState("error");
      return;
    }
    setState("loading");
    try {
      const typeResult = await loadPremiumTypes(sources, signal);
      const first = typeResult.tags[0] ?? { id: "recommend", label: "今日推荐", value: "" };
      const categoryResult = await loadPremiumCategory(sources, first.value, signal);
      setTags(typeResult.tags);
      setSelectedTag(first.id);
      setCapability(categoryResult.capability);
      setVideos(categoryResult.videos.map((video) => ({ ...video, mode: "premium" })));
      setMessage("");
      setState(categoryResult.videos.length > 0 ? "ready" : "empty");
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) fail(error);
    }
  }, [fail, sources]);

  useEffect(() => {
    const active = new AbortController();
    queueMicrotask(() => { if (!active.signal.aborted) void load(active.signal); });
    return () => active.abort();
  }, [load]);

  const selectTag = async (tag: PremiumTag) => {
    controller.current?.abort();
    controller.current = new AbortController();
    setSelectedTag(tag.id);
    setState("loading");
    try {
      const result = await loadPremiumCategory(sources, tag.value, controller.current.signal);
      setCapability(result.capability);
      setVideos(result.videos.map((video) => ({ ...video, mode: "premium" })));
      setState(result.videos.length > 0 ? "ready" : "empty");
    } catch (error) { fail(error); }
  };

  const submitUnlock = async (event: FormEvent) => {
    event.preventDefault();
    try { await unlockPremium(password); setPassword(""); await load(); } catch (error) { fail(error); }
  };
  const submitSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    controller.current?.abort();
    controller.current = new AbortController();
    setState("loading");
    try {
      const found = await searchVideos(query.trim(), sources, { signal: controller.current.signal, onProgress: (next) => {
        setProgress(next); if (next.capability) setCapability(next.capability);
      } });
      setVideos(found.map((video) => ({ ...video, mode: "premium" })));
      setState(found.length > 0 ? "ready" : "empty");
    } catch (error) { if (!(error instanceof Error && error.name === "AbortError")) fail(error); }
  };
  const cancelSearch = () => {
    controller.current?.abort();
    setState(videos.length > 0 ? "ready" : "empty");
  };
  const toggleFavorite = (video: Video) => favoriteIds.has(videoRecordId(video.source, video.vod_id))
    ? removeRecord("library", "favorites", videoRecordId(video.source, video.vod_id))
    : upsertRecord("library", "favorites", favoriteFromVideo({ ...video, mode: "premium" }));

  if (state === "locked") return <main className="public-shell"><form className="auth-panel" onSubmit={submitUnlock}>
    <h1>解锁 Premium</h1><p>{message}</p><label className="field-label" htmlFor="premium-password">Premium 密码</label>
    <input id="premium-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
    <button className="primary-button" type="submit">解锁</button></form></main>;

  return <div className="content-shell"><ContentNavigation premium /><main className="content-main">
    <header className="hero-panel"><p className="public-kicker">PREMIUM</p><h1>Premium 内容</h1>
      <p>授权与能力均由当前 Worker 会话确认。</p>
      <form className="search-form" onSubmit={(event) => void submitSearch(event)}><label htmlFor="premium-search">搜索 Premium 内容</label>
        <div><input id="premium-search" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="primary-button" type="submit" disabled={state === "loading"}>搜索</button>
          {state === "loading" && <button type="button" onClick={cancelSearch}>取消</button>}</div></form>
      {capability && <p className="capability-hint">服务端 {capability.profile === "paid" ? "Paid" : "Free"} · 最多 {capability.limits.sources} 个源 · {capability.limits.videos} 条</p>}
    </header>
    {tags.length > 0 && <div className="premium-tags" aria-label="Premium 分类">{tags.map((tag) => <button type="button" aria-pressed={tag.id === selectedTag} key={tag.id} onClick={() => void selectTag(tag)}>{tag.label}</button>)}</div>}
    {state === "loading" && <p className="content-message" role="status">正在载入… {progress.found > 0 ? `已找到 ${progress.found} 条` : ""}</p>}
    {state === "empty" && <p className="content-message" role="status">当前分类没有内容。</p>}
    {state === "error" && <section className="empty-collection" role="alert"><h2>无法载入 Premium</h2><p>{message}</p><Link className="primary-link" href="/premium/settings" prefetch={false}>检查来源</Link></section>}
    {state === "ready" && <section className="content-section"><div className="section-title"><h2>内容</h2><span>{videos.length} 条</span></div>
      <div className="video-grid">{videos.map((video) => <VideoCard key={videoRecordId(video.source, video.vod_id)} video={video} sources={sources} favorite={favoriteIds.has(videoRecordId(video.source, video.vod_id))} onToggleFavorite={toggleFavorite} />)}</div></section>}
  </main></div>;
}
