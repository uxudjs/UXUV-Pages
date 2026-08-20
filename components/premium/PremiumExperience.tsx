"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Film, Tag } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContentNavigation } from "@/components/ContentNavigation";
import { SearchForm } from "@/components/search/SearchForm";
import { Icon } from "@/components/ui/Icon";
import { FavoritesSidebar } from "@/components/favorites/FavoritesSidebar";
import { WatchHistorySidebar } from "@/components/history/WatchHistorySidebar";
import { useLocale } from "@/components/LocaleProvider";
import { useSync } from "@/components/SyncProvider";
import { VideoCard } from "@/components/VideoCard";
import { ContentApiError } from "@/lib/content/api-client";
import { favoritesForMode, MAX_FAVORITES } from "@/lib/content/favorites-policy";
import { historyForMode } from "@/lib/content/history-policy";
import { appendPremiumVideos, premiumRecommendationTerms } from "@/lib/content/premium-home-policy";
import { loadPremiumCategory, loadPremiumTypes, unlockPremium, type PremiumTag } from "@/lib/content/premium-client";
import { searchVideos, type SearchProgress } from "@/lib/content/search-client";
import { favoriteFromVideo, isFavoriteRecord, isHistoryRecord, isVideoSource,
  type ContentCapability, type Video, videoRecordId } from "@/lib/content/types";
import { useAuth } from "@/lib/store/auth-store";

type PremiumState = "loading" | "locked" | "ready" | "empty" | "error";
type PremiumView = "category" | "search";

const COPY = {
  "zh-CN": { title: "Premium 内容", description: "独立来源、推荐、分类与搜索均由当前 Worker 会话授权。", lockedTitle: "解锁 Premium",
    locked: "Premium 授权已失效，请重新解锁。", password: "Premium 密码", unlock: "解锁", sourceMissing: "尚未配置 Premium 视频源。",
    serviceError: "Premium 服务暂时不可用。", searchLabel: "搜索 Premium 内容", placeholder: "输入片名、演员或关键词…", search: "搜索", cancel: "取消",
    clearSearch: "返回分类", recommendations: "为你推荐", categories: "Premium 分类", today: "今日推荐", loading: "正在载入…", found: "已找到",
    categoryEmpty: "当前分类没有内容。", searchEmpty: "没有找到匹配的 Premium 内容。", errorTitle: "无法载入 Premium", settings: "检查来源",
    content: "内容", results: "搜索结果", items: "条", loadMore: "加载更多", loadingMore: "正在加载更多…", noMore: "没有更多内容了",
    favoriteAdded: "已收藏。", favoriteRemoved: "已取消收藏。", favoriteLimit: "收藏已达 100 项上限。", syncing: "正在同步…",
    deferred: "已保存在本地，云端同步待恢复。", capability: (profile: string, sources: number, videos: number) => `服务端 ${profile} · 最多 ${sources} 个源 · ${videos} 条` },
  "zh-TW": { title: "Premium 內容", description: "獨立來源、推薦、分類與搜尋均由目前 Worker 工作階段授權。", lockedTitle: "解鎖 Premium",
    locked: "Premium 授權已失效，請重新解鎖。", password: "Premium 密碼", unlock: "解鎖", sourceMissing: "尚未設定 Premium 影片來源。",
    serviceError: "Premium 服務暫時無法使用。", searchLabel: "搜尋 Premium 內容", placeholder: "輸入片名、演員或關鍵字…", search: "搜尋", cancel: "取消",
    clearSearch: "返回分類", recommendations: "為你推薦", categories: "Premium 分類", today: "今日推薦", loading: "正在載入…", found: "已找到",
    categoryEmpty: "目前分類沒有內容。", searchEmpty: "找不到符合的 Premium 內容。", errorTitle: "無法載入 Premium", settings: "檢查來源",
    content: "內容", results: "搜尋結果", items: "筆", loadMore: "載入更多", loadingMore: "正在載入更多…", noMore: "沒有更多內容了",
    favoriteAdded: "已收藏。", favoriteRemoved: "已取消收藏。", favoriteLimit: "收藏已達 100 項上限。", syncing: "正在同步…",
    deferred: "已儲存在本機，雲端同步待恢復。", capability: (profile: string, sources: number, videos: number) => `伺服器 ${profile} · 最多 ${sources} 個來源 · ${videos} 筆` },
  en: { title: "Premium content", description: "Separate sources, recommendations, categories, and search are authorized by the current Worker session.", lockedTitle: "Unlock Premium",
    locked: "Premium access expired. Unlock it again to continue.", password: "Premium password", unlock: "Unlock", sourceMissing: "No Premium video source is configured.",
    serviceError: "Premium is temporarily unavailable.", searchLabel: "Search Premium content", placeholder: "Enter a title, actor, or keyword…", search: "Search", cancel: "Cancel",
    clearSearch: "Back to categories", recommendations: "Recommended for you", categories: "Premium categories", today: "Today's picks", loading: "Loading…", found: "Found",
    categoryEmpty: "This category has no content.", searchEmpty: "No matching Premium content was found.", errorTitle: "Premium could not be loaded", settings: "Check sources",
    content: "Content", results: "Search results", items: "items", loadMore: "Load more", loadingMore: "Loading more…", noMore: "No more content",
    favoriteAdded: "Added to favorites.", favoriteRemoved: "Removed from favorites.", favoriteLimit: "Favorites reached the 100-item limit.", syncing: "Syncing…",
    deferred: "Saved locally; cloud sync will resume later.", capability: (profile: string, sources: number, videos: number) => `Server ${profile} · up to ${sources} sources · ${videos} items` },
} as const;

const LEGACY_COPY = {
  "zh-CN": { input: "搜索视频内容", placeholder: "输入关键词开始搜索…", search: "搜索", clear: "清除搜索",
    history: "搜索历史", clearAll: "清除所有历史", deleteItem: "删除", cancel: "取消", manage: "管理标签", empty: "暂无内容" },
  "zh-TW": { input: "搜尋影視內容", placeholder: "輸入關鍵字開始搜尋…", search: "搜尋", clear: "清除搜尋",
    history: "搜尋記錄", clearAll: "清除所有記錄", deleteItem: "刪除", cancel: "取消", manage: "管理標籤", empty: "暫無內容" },
  en: { input: "Search video content", placeholder: "Enter keywords to search…", search: "Search", clear: "Clear search",
    history: "Search history", clearAll: "Clear all history", deleteItem: "Delete", cancel: "Cancel", manage: "Manage tags", empty: "No content" },
} as const;

export function PremiumExperience() {
  const router = useRouter();
  const auth = useAuth();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const { documents, phase, upsertRecord, removeRecord } = useSync();
  const [state, setState] = useState<PremiumState>("loading");
  const [view, setView] = useState<PremiumView>("category");
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<PremiumTag[]>([]);
  const [selectedTag, setSelectedTag] = useState("recommend");
  const [videos, setVideos] = useState<Video[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [capability, setCapability] = useState<ContentCapability | null>(null);
  const [progress, setProgress] = useState<SearchProgress>({ completed: 0, total: 0, found: 0 });
  const [favoriteFeedback, setFavoriteFeedback] = useState("");
  const controller = useRef<AbortController | null>(null);
  const sources = useMemo(() => "sources" in documents.config.payload
    ? documents.config.payload.sources.filter(isVideoSource).filter(({ group }) => group === "premium") : [],
  [documents.config.payload]);
  const favorites = useMemo(() => "favorites" in documents.library.payload
    ? favoritesForMode(documents.library.payload.favorites.filter(isFavoriteRecord), "premium") : [],
  [documents.library.payload]);
  const history = useMemo(() => "history" in documents.library.payload
    ? historyForMode(documents.library.payload.history.filter(isHistoryRecord), "premium") : [],
  [documents.library.payload]);
  const recommendationTerms = useMemo(() => premiumRecommendationTerms(history), [history]);
  const favoriteIds = useMemo(() => new Set(favorites.map((favorite) => videoRecordId(favorite.source, favorite.videoId))), [favorites]);

  const fail = useCallback((error: unknown) => {
    if (error instanceof ContentApiError && error.status === 401) auth?.markSessionExpired();
    if (error instanceof ContentApiError && error.status === 403) {
      setMessage(copy.locked);
      setState("locked");
    } else {
      setMessage(error instanceof Error ? error.message : copy.serviceError);
      setState("error");
    }
  }, [auth, copy.locked, copy.serviceError]);

  const loadCategory = useCallback(async (tag: PremiumTag, nextPage: number, append: boolean, signal?: AbortSignal) => {
    if (!append) setState("loading"); else setLoadingMore(true);
    try {
      const result = await loadPremiumCategory(sources, tag.value, nextPage, signal);
      const premiumVideos = result.videos.map((video) => ({ ...video, mode: "premium" as const }));
      setCapability(result.capability);
      setVideos((current) => append ? appendPremiumVideos(current, premiumVideos) : premiumVideos);
      setPage(nextPage);
      setHasMore(premiumVideos.length === 20 && nextPage < 3);
      setMessage("");
      setState(append || premiumVideos.length > 0 ? "ready" : "empty");
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) fail(error);
    } finally { setLoadingMore(false); }
  }, [fail, sources]);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (sources.length === 0) { setMessage(copy.sourceMissing); setState("error"); return; }
    setState("loading");
    try {
      const typeResult = await loadPremiumTypes(sources, signal);
      const localizedTags = typeResult.tags.map((tag) => tag.id === "recommend" ? { ...tag, label: copy.today } : tag);
      const first = localizedTags[0] ?? { id: "recommend", label: copy.today, value: "" };
      setTags(localizedTags);
      setSelectedTag(first.id);
      setView("category");
      await loadCategory(first, 1, false, signal);
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) fail(error);
    }
  }, [copy.sourceMissing, copy.today, fail, loadCategory, sources]);

  useEffect(() => {
    const active = new AbortController();
    queueMicrotask(() => { if (!active.signal.aborted) void load(active.signal); });
    return () => active.abort();
  }, [load]);

  const selectTag = (tag: PremiumTag) => {
    controller.current?.abort();
    controller.current = new AbortController();
    setView("category");
    setSelectedTag(tag.id);
    setQuery("");
    window.history.replaceState(null, "", window.location.pathname);
    void loadCategory(tag, 1, false, controller.current.signal);
  };
  const performSearch = async (searchQuery: string) => {
    const normalized = searchQuery.trim();
    if (!normalized) return;
    controller.current?.abort();
    controller.current = new AbortController();
    setView("search");
    setSelectedTag("");
    setProgress({ completed: 0, total: sources.length, found: 0 });
    setState("loading");
    window.history.replaceState(null, "", `${window.location.pathname}?q=${encodeURIComponent(normalized)}`);
    try {
      const found = await searchVideos(normalized, sources, { signal: controller.current.signal, onProgress: (next) => {
        setProgress(next); if (next.capability) setCapability(next.capability);
      }, onVideos: (nextVideos) => setVideos(nextVideos.map((video) => ({ ...video, mode: "premium" }))) });
      setVideos(found.map((video) => ({ ...video, mode: "premium" })));
      setHasMore(false);
      setState(found.length > 0 ? "ready" : "empty");
    } catch (error) { if (!(error instanceof Error && error.name === "AbortError")) fail(error); }
  };
  const submitSearch = (event: FormEvent) => { event.preventDefault(); void performSearch(query); };
  const cancelSearch = () => {
    controller.current?.abort();
    const recommend = tags.find(({ id }) => id === "recommend") ?? tags[0];
    if (recommend) selectTag(recommend);
  };
  const submitUnlock = async (event: FormEvent) => {
    event.preventDefault();
    try { await unlockPremium(password); setPassword(""); await load(); } catch (error) { fail(error); }
  };
  const toggleFavorite = (video: Video) => {
    const id = videoRecordId(video.source, video.vod_id);
    if (favoriteIds.has(id)) {
      const record = favorites.find((favorite) => videoRecordId(favorite.source, favorite.videoId) === id);
      if (record) removeRecord("library", "favorites", record.id);
      setFavoriteFeedback(copy.favoriteRemoved);
    } else if (favorites.length >= MAX_FAVORITES) setFavoriteFeedback(copy.favoriteLimit);
    else { upsertRecord("library", "favorites", favoriteFromVideo({ ...video, mode: "premium" })); setFavoriteFeedback(copy.favoriteAdded); }
  };
  const currentTag = tags.find(({ id }) => id === selectedTag);
  const moveFocus = (event: KeyboardEvent<HTMLElement>, selector: string) => {
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    target.focus();
    target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  const handleSearchKey = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "ArrowDown") moveFocus(event, "[data-premium-stage=recommendations] [data-focusable], [data-premium-stage=categories] [data-focusable]");
  };
  const handleRecommendationsKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "ArrowUp") moveFocus(event, "[data-premium-stage=search] [data-focusable]");
    if (event.key === "ArrowDown") moveFocus(event, "[data-premium-stage=categories] [data-focusable]");
  };
  const handleCategoriesKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowUp") moveFocus(event, "[data-premium-stage=recommendations] [data-focusable], [data-premium-stage=search] [data-focusable]");
    if (event.key === "ArrowDown") moveFocus(event, "[data-premium-stage=content] [data-focusable]");
  };
  const handleContentKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowUp") return;
    const currentCard = (event.target as HTMLElement).closest(".video-card");
    const firstCard = event.currentTarget.querySelector(".video-card");
    if (currentCard && firstCard && Math.abs(currentCard.getBoundingClientRect().top - firstCard.getBoundingClientRect().top) < 10) {
      moveFocus(event, "[data-premium-stage=categories] [aria-pressed=true], [data-premium-stage=categories] [data-focusable]");
    }
  };

  if (state === "locked") return <main className="public-shell"><form className="auth-panel" data-material="regular" onSubmit={(event) => void submitUnlock(event)}>
    <h1>{copy.lockedTitle}</h1><p role="alert">{message || copy.locked}</p><label className="field-label" htmlFor="premium-password">{copy.password}</label>
    <input id="premium-password" autoFocus type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
    <button className="primary-button" type="submit" disabled={!password}>{copy.unlock}</button></form></main>;

  if (sources.length === 0) {
    const legacyCopy = LEGACY_COPY[locale];
    return <div className="content-shell kvideo-home-shell premium-legacy-shell">
      <ContentNavigation premium />
      <div className="kvideo-home-search-region"><SearchForm accountId={auth?.session.accountId ?? "anonymous"} mode="premium"
        query={query} labels={{ input: legacyCopy.input, placeholder: legacyCopy.placeholder, search: legacyCopy.search,
          clear: legacyCopy.clear, history: legacyCopy.history, clearAll: legacyCopy.clearAll, deleteItem: legacyCopy.deleteItem }}
        loading={false} progressLabel="" cancelLabel={legacyCopy.cancel} onQueryChange={setQuery}
        onSearch={() => undefined} onClear={() => setQuery("")} onCancel={() => undefined} /></div>
      <main className="kvideo-home-main premium-legacy-main">
        <button type="button" className="premium-legacy-manage" data-material="regular" data-focusable
          onClick={() => router.push("/premium/settings")}><Icon source={Tag} size={16} />{legacyCopy.manage}</button>
        <div className="kvideo-home-state premium-legacy-empty" role="status"><Icon source={Film} size={64} />{legacyCopy.empty}</div>
      </main>
      <FavoritesSidebar premium /><WatchHistorySidebar premium />
    </div>;
  }

  return <div className="content-shell"><ContentNavigation premium /><main className="content-main premium-main">
    <header className="hero-panel premium-hero"><p className="public-kicker">PREMIUM</p><h1>{copy.title}</h1><p>{copy.description}</p>
      <form className="search-form" data-material="regular" data-premium-stage="search" onKeyDown={handleSearchKey} onSubmit={submitSearch}><label htmlFor="premium-search">{copy.searchLabel}</label>
        <div><input id="premium-search" data-focusable value={query} placeholder={copy.placeholder} onChange={(event) => setQuery(event.target.value)} />
          <button className="primary-button" data-focusable type="submit" disabled={state === "loading" || !query.trim()}>{copy.search}</button>
          {view === "search" && <button type="button" data-focusable onClick={cancelSearch}>{state === "loading" ? copy.cancel : copy.clearSearch}</button>}</div></form>
      {capability && <p className="capability-hint">{copy.capability(capability.profile === "paid" ? "Paid" : "Free", capability.limits.sources, capability.limits.videos)}</p>}
    </header>
    {recommendationTerms.length > 0 && <section className="premium-recommendations" data-premium-stage="recommendations" onKeyDown={handleRecommendationsKey} aria-labelledby="premium-recommendations-title">
      <h2 id="premium-recommendations-title">{copy.recommendations}</h2><div>{recommendationTerms.map((term) => <button type="button" data-focusable key={term}
        onClick={() => { setQuery(term); void performSearch(term); }}>{term}</button>)}</div></section>}
    {tags.length > 0 && <div className="premium-tags" data-material="regular" data-premium-stage="categories" onKeyDown={handleCategoriesKey} role="group" aria-label={copy.categories}>
      {tags.map((tag) => <button type="button" data-focusable aria-pressed={tag.id === selectedTag} key={tag.id} onClick={() => selectTag(tag)}>{tag.label}</button>)}</div>}
    {state === "loading" && <p className="content-message" role="status">{copy.loading} {progress.found > 0 ? `${copy.found} ${progress.found}` : ""}</p>}
    {state === "empty" && <p className="content-message" role="status">{view === "search" ? copy.searchEmpty : copy.categoryEmpty}</p>}
    {state === "error" && <section className="empty-collection" role="alert"><h2>{copy.errorTitle}</h2><p>{message}</p>
      <Link className="primary-link" data-focusable href="/premium/settings" prefetch={false}>{copy.settings}</Link></section>}
    {state === "ready" && <section className="content-section" data-premium-stage="content" onKeyDown={handleContentKey}><div className="section-title">
      <h2>{view === "search" ? copy.results : currentTag?.label || copy.content}</h2><span>{videos.length} {copy.items}</span></div>
      <div className="video-grid">{videos.map((video) => <VideoCard key={videoRecordId(video.source, video.vod_id)} video={video} sources={sources}
        favorite={favoriteIds.has(videoRecordId(video.source, video.vod_id))} onToggleFavorite={toggleFavorite} />)}</div>
      {view === "category" && hasMore && <button className="premium-load-more" type="button" data-focusable disabled={loadingMore}
        onClick={() => currentTag && void loadCategory(currentTag, page + 1, true)}>{loadingMore ? copy.loadingMore : copy.loadMore}</button>}
      {view === "category" && !hasMore && page > 1 && <p className="content-message">{copy.noMore}</p>}
    </section>}
    {favoriteFeedback && <p className="favorite-feedback" role="status">{favoriteFeedback} {
      phase === "pending" || phase === "loading" ? copy.syncing
        : phase === "offline" || phase === "quota" || phase === "error" || phase === "conflict" ? copy.deferred : ""
    }</p>}
  </main><FavoritesSidebar premium /><WatchHistorySidebar premium /></div>;
}
