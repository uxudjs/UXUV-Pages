"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ContentNavigation } from "@/components/ContentNavigation";
import { FavoritesSidebar } from "@/components/favorites/FavoritesSidebar";
import { WatchHistorySidebar } from "@/components/history/WatchHistorySidebar";
import { useLocale } from "@/components/LocaleProvider";
import { DiscoverControls } from "@/components/home/DiscoverControls";
import { useTagManager } from "@/components/home/hooks/useTagManager";
import { usePersonalizedRecommendations } from "@/components/home/hooks/usePersonalizedRecommendations";
import { MovieGrid, type HomeFeedState } from "@/components/home/MovieGrid";
import { useSync } from "@/components/SyncProvider";
import { SearchForm } from "@/components/search/SearchForm";
import { SearchResults } from "@/components/search/SearchResults";
import { ContentApiError, fetchHomeMovies, fetchHomeTags, type HomeContentType, type HomeMovie } from "@/lib/content/api-client";
import { searchVideos, type SearchProgress } from "@/lib/content/search-client";
import { favoritesForMode, MAX_FAVORITES } from "@/lib/content/favorites-policy";
import { historyForMode } from "@/lib/content/history-policy";
import { orderedSources } from "@/lib/content/source-settings-policy";
import { storeGroupedSources } from "@/lib/media/grouped-sources-cache";
import { useAuth } from "@/lib/store/auth-store";
import { traditionalToSimplified } from "@/lib/utils/chinese-convert";
import {
  favoriteFromVideo,
  isFavoriteRecord,
  isHistoryRecord,
  isVideoSource,
  type HistoryRecord,
  type Video,
  videoRecordId,
} from "@/lib/content/types";

type SearchState = "idle" | "loading" | "ready" | "empty" | "error" | "cancelled";
const HOME_PAGE_SIZE = 20;

function historyPlayerHref(item: HistoryRecord): string {
  const query = new URLSearchParams({ id: String(item.videoId), source: item.source, title: item.title });
  if (Number.isInteger(item.episodeIndex)) query.set("episode", String(item.episodeIndex));
  return `/player?${query}`;
}

function dedupeMovies(existing: HomeMovie[], incoming: HomeMovie[]): HomeMovie[] {
  const ids = new Set(existing.map(({ id }) => id));
  const titles = new Set(existing.map(({ title }) => title.trim().toLocaleLowerCase()));
  return [...existing, ...incoming.filter((movie) => {
    const title = movie.title.trim().toLocaleLowerCase();
    if (ids.has(movie.id) || titles.has(title)) return false;
    ids.add(movie.id);
    titles.add(title);
    return true;
  })];
}

const HOME_COPY = {
  "zh-CN": {
    searchLabel: "搜索视频内容",
    searchPlaceholder: "搜索电影、电视剧、综艺...",
    search: "搜索",
    clearSearch: "清除搜索",
    searchHistory: "搜索历史",
    clearAllHistory: "清除所有历史",
    deleteHistory: "删除",
    cancel: "取消",
    sourceMissing: "尚未配置可用视频源，请先前往设置。",
    action: "播放",
    loading: "正在加载热门内容…",
    empty: "暂无内容",
    error: "无法加载热门内容。",
    retry: "重试",
    typeLabel: "内容类型",
    movie: "电影",
    television: "电视剧",
    tags: "豆瓣分类",
    tagsLoading: "正在加载豆瓣分类…",
    tagManager: { manage: "管理标签", done: "完成", input: "新标签", add: "添加", restore: "恢复默认标签", sort: "排序", delete: "删除" },
    personalized: "为你推荐",
    popular: "热门内容",
    loadingMore: "正在加载更多内容…",
    noMore: "没有更多内容了",
    history: "继续观看",
    continue: "继续播放",
    searching: "正在搜索",
    cancelled: "已取消搜索。",
    noResults: "没有找到匹配结果，请尝试其他关键词。",
    searchError: "搜索失败，请稍后重试。",
    results: "搜索结果",
    items: "条",
    view: "查看",
    playAgain: "再次点击播放 →",
    sourceCount: (count: number) => `${count} 源`,
    favorite: "收藏",
    unfavorite: "取消收藏",
    resolutionProbe: "探测清晰度",
    resolutionProbing: "探测中…",
    resolutionUnknown: "未识别",
    resolutionError: "探测失败",
    latency: (value: number) => `${value} ms`,
    resultControls: {
      filters: "搜索结果筛选与排序", source: "来源", type: "类型", language: "语言", clear: "清除筛选", sort: "排序",
      sortOptions: { default: "综合", relevance: "相关性", "latency-asc": "延迟低优先", "date-desc": "发布时间从新到旧",
        "date-asc": "发布时间从旧到新", "rating-desc": "评分从高到低", "name-asc": "名称升序", "name-desc": "名称降序" },
      realtimeLatency: "实时延迟", pinging: "正在测量延迟…", blockPlaceholder: "例如：伦理", addBlock: "屏蔽类别", blocked: "类别屏蔽",
    },
    favoriteAdded: "已收藏。", favoriteRemoved: "已取消收藏。", favoriteLimit: "收藏已达 100 项上限。",
    favoritePending: "正在同步", favoriteDeferred: "已保存在本地，云端同步待恢复",
  },
  "zh-TW": {
    searchLabel: "搜尋影視內容",
    searchPlaceholder: "搜尋電影、電視劇、綜藝...",
    search: "搜尋",
    clearSearch: "清除搜尋",
    searchHistory: "搜尋記錄",
    clearAllHistory: "清除所有記錄",
    deleteHistory: "刪除",
    cancel: "取消",
    sourceMissing: "尚未設定可用影片來源，請先前往設定。",
    action: "播放",
    loading: "正在載入熱門內容…",
    empty: "暫無內容",
    error: "無法載入熱門內容。",
    retry: "重試",
    typeLabel: "內容類型",
    movie: "電影",
    television: "電視劇",
    tags: "豆瓣分類",
    tagsLoading: "正在載入豆瓣分類…",
    tagManager: { manage: "管理標籤", done: "完成", input: "新標籤", add: "新增", restore: "恢復預設標籤", sort: "排序", delete: "刪除" },
    personalized: "為你推薦",
    popular: "熱門內容",
    loadingMore: "正在載入更多內容…",
    noMore: "沒有更多內容了",
    history: "繼續觀看",
    continue: "繼續播放",
    searching: "正在搜尋",
    cancelled: "已取消搜尋。",
    noResults: "找不到相符結果，請嘗試其他關鍵字。",
    searchError: "搜尋失敗，請稍後再試。",
    results: "搜尋結果",
    items: "筆",
    view: "查看",
    playAgain: "再次點擊播放 →",
    sourceCount: (count: number) => `${count} 個來源`,
    favorite: "收藏",
    unfavorite: "取消收藏",
    resolutionProbe: "探測清晰度",
    resolutionProbing: "探測中…",
    resolutionUnknown: "未識別",
    resolutionError: "探測失敗",
    latency: (value: number) => `${value} ms`,
    resultControls: {
      filters: "搜尋結果篩選與排序", source: "來源", type: "類型", language: "語言", clear: "清除篩選", sort: "排序",
      sortOptions: { default: "綜合", relevance: "相關性", "latency-asc": "延遲低優先", "date-desc": "發佈時間由新到舊",
        "date-asc": "發佈時間由舊到新", "rating-desc": "評分由高到低", "name-asc": "名稱升序", "name-desc": "名稱降序" },
      realtimeLatency: "即時延遲", pinging: "正在測量延遲…", blockPlaceholder: "例如：倫理", addBlock: "封鎖類別", blocked: "類別封鎖",
    },
    favoriteAdded: "已收藏。", favoriteRemoved: "已取消收藏。", favoriteLimit: "收藏已達 100 項上限。",
    favoritePending: "正在同步", favoriteDeferred: "已儲存在本機，雲端同步待恢復",
  },
  en: {
    searchLabel: "Search videos",
    searchPlaceholder: "Search movies, series, shows...",
    search: "Search",
    clearSearch: "Clear search",
    searchHistory: "Search history",
    clearAllHistory: "Clear all history",
    deleteHistory: "Delete",
    cancel: "Cancel",
    sourceMissing: "No video source is configured. Open Settings first.",
    action: "Play",
    loading: "Loading popular titles…",
    empty: "No titles yet",
    error: "Unable to load popular titles.",
    retry: "Retry",
    typeLabel: "Content type",
    movie: "Movies",
    television: "TV series",
    tags: "Douban categories",
    tagsLoading: "Loading Douban categories…",
    tagManager: { manage: "Manage tags", done: "Done", input: "New tag", add: "Add", restore: "Restore default tags", sort: "Sort", delete: "Delete" },
    personalized: "Recommended for you",
    popular: "Popular titles",
    loadingMore: "Loading more titles…",
    noMore: "No more content",
    history: "Continue watching",
    continue: "Continue",
    searching: "Searching",
    cancelled: "Search cancelled.",
    noResults: "No matching results. Try another keyword.",
    searchError: "Search failed. Try again later.",
    results: "Search results",
    items: "items",
    view: "View",
    playAgain: "Tap again to play →",
    sourceCount: (count: number) => `${count} sources`,
    favorite: "Favorite",
    unfavorite: "Remove favorite",
    resolutionProbe: "Probe resolution",
    resolutionProbing: "Probing…",
    resolutionUnknown: "Unknown",
    resolutionError: "Probe failed",
    latency: (value: number) => `${value} ms`,
    resultControls: {
      filters: "Search result filters and sorting", source: "Source", type: "Type", language: "Language", clear: "Clear filters", sort: "Sort",
      sortOptions: { default: "Default", relevance: "Relevance", "latency-asc": "Lowest latency", "date-desc": "Newest first",
        "date-asc": "Oldest first", "rating-desc": "Highest rating", "name-asc": "Name A–Z", "name-desc": "Name Z–A" },
      realtimeLatency: "Live latency", pinging: "Measuring latency…", blockPlaceholder: "e.g. unwanted", addBlock: "Block category", blocked: "Blocked categories",
    },
    favoriteAdded: "Added to favorites.", favoriteRemoved: "Removed from favorites.", favoriteLimit: "The 100-item favorite limit is full.",
    favoritePending: "Syncing", favoriteDeferred: "Saved locally; cloud sync is waiting to recover",
  },
} as const;

export function HomeExperience() {
  const router = useRouter();
  const { documents, phase, upsertRecord, removeRecord } = useSync();
  const auth = useAuth();
  const { locale } = useLocale();
  const [homeMovies, setHomeMovies] = useState<HomeMovie[]>([]);
  const [homeState, setHomeState] = useState<HomeFeedState>("loading");
  const [nextPageStart, setNextPageStart] = useState(HOME_PAGE_SIZE);
  const [hasMoreHomeMovies, setHasMoreHomeMovies] = useState(false);
  const [loadingMoreHomeMovies, setLoadingMoreHomeMovies] = useState(false);
  const [contentType, setContentType] = useState<HomeContentType>("movie");
  const [defaultTags, setDefaultTags] = useState(["热门"]);
  const [selectedTag, setSelectedTag] = useState("热门");
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagManagementOpen, setTagManagementOpen] = useState(false);
  const [recommendationSelected, setRecommendationSelected] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Video[]>([]);
  const [favoriteFeedback, setFavoriteFeedback] = useState("");
  const [state, setState] = useState<SearchState>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<SearchProgress>({ completed: 0, total: 0, found: 0 });
  const homeController = useRef<AbortController | null>(null);
  const tagsController = useRef<AbortController | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const copy = HOME_COPY[locale];
  const { tags, addTag, removeTag, restoreDefaultTags, moveTag } = useTagManager({
    accountId: auth?.session.accountId ?? "anonymous",
    mode: "standard",
    contentType,
    defaultTags,
  });
  const activeTag = tags.includes(selectedTag) ? selectedTag : (tags[0] ?? "热门");

  const sources = useMemo(
    () => "sources" in documents.config.payload
      ? orderedSources(documents.config.payload.sources.filter(isVideoSource).filter(({ group }) => group !== "premium")) : [],
    [documents.config.payload],
  );
  const favorites = useMemo(
    () => "favorites" in documents.library.payload
      ? favoritesForMode(documents.library.payload.favorites.filter(isFavoriteRecord), "standard") : [],
    [documents.library.payload],
  );
  const history = useMemo(
    () => "history" in documents.library.payload
      ? historyForMode(documents.library.payload.history.filter(isHistoryRecord), "standard").slice(0, 6)
      : [],
    [documents.library.payload],
  );
  const personalized = usePersonalizedRecommendations(contentType, history);
  const effectiveRecommendationSelected = personalized.hasHistory && recommendationSelected;
  const favoriteIds = useMemo(() => new Set(favorites.map((favorite) => videoRecordId(favorite.source, favorite.videoId))), [favorites]);

  const loadHome = useCallback(async () => {
    homeController.current?.abort();
    const controller = new AbortController();
    homeController.current = controller;
    setHomeState("loading");
    setLoadingMoreHomeMovies(false);
    try {
      const movies = await fetchHomeMovies({ type: contentType, tag: activeTag, pageStart: 0, pageLimit: HOME_PAGE_SIZE }, controller.signal);
      if (controller.signal.aborted) return;
      setHomeMovies(dedupeMovies([], movies));
      setNextPageStart(HOME_PAGE_SIZE);
      setHasMoreHomeMovies(movies.length === HOME_PAGE_SIZE);
      setHomeState(movies.length > 0 ? "ready" : "empty");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof ContentApiError && error.status === 401) auth?.markSessionExpired();
      setHomeMovies([]);
      setHasMoreHomeMovies(false);
      setHomeState("error");
    }
  }, [activeTag, auth, contentType]);

  const loadMoreHomeMovies = useCallback(async () => {
    if (homeState !== "ready" || loadingMoreHomeMovies || !hasMoreHomeMovies) return;
    homeController.current?.abort();
    const controller = new AbortController();
    homeController.current = controller;
    setLoadingMoreHomeMovies(true);
    try {
      const movies = await fetchHomeMovies({
        type: contentType,
        tag: activeTag,
        pageStart: nextPageStart,
        pageLimit: HOME_PAGE_SIZE,
      }, controller.signal);
      if (controller.signal.aborted) return;
      setHomeMovies((current) => dedupeMovies(current, movies));
      setNextPageStart((current) => current + HOME_PAGE_SIZE);
      setHasMoreHomeMovies(movies.length === HOME_PAGE_SIZE);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof ContentApiError && error.status === 401) auth?.markSessionExpired();
      setHasMoreHomeMovies(false);
    } finally {
      if (!controller.signal.aborted) setLoadingMoreHomeMovies(false);
    }
  }, [activeTag, auth, contentType, hasMoreHomeMovies, homeState, loadingMoreHomeMovies, nextPageStart]);

  useEffect(() => {
    tagsController.current?.abort();
    const controller = new AbortController();
    tagsController.current = controller;
    const loadTags = async () => {
      try {
        const nextTags = await fetchHomeTags(contentType, controller.signal);
        if (!controller.signal.aborted) setDefaultTags(nextTags);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        if (error instanceof ContentApiError && error.status === 401) auth?.markSessionExpired();
        if (!controller.signal.aborted) setDefaultTags(["热门"]);
      } finally {
        if (!controller.signal.aborted) setTagsLoading(false);
      }
    };
    void loadTags();
    return () => controller.abort();
  }, [auth, contentType]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void loadHome(); });
    return () => {
      active = false;
      homeController.current?.abort();
    };
  }, [loadHome]);

  const runSearch = async (searchQuery: string) => {
    const originalQuery = searchQuery.trim();
    if (!originalQuery || sources.length === 0) return [];
    const normalized = traditionalToSimplified(originalQuery);
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setQuery(originalQuery);
    setState("loading");
    setMessage("");
    setResults([]);
    setProgress({ completed: 0, total: sources.length, found: 0 });
    try {
      const found = await searchVideos(normalized, sources, {
        signal: controller.signal,
        onProgress: setProgress,
        onVideos: (videos) => { if (!controller.signal.aborted) setResults(videos); },
      });
      setResults(found);
      setState(found.length > 0 ? "ready" : "empty");
      return found;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return [];
      if (error instanceof ContentApiError && error.status === 401) auth?.markSessionExpired();
      setMessage(error instanceof Error ? error.message : copy.searchError);
      setState("error");
      return [];
    }
  };

  const openHomeMovie = async (movie: HomeMovie) => {
    const found = await runSearch(movie.title);
    const normalizedTitle = traditionalToSimplified(movie.title).trim().toLocaleLowerCase();
    const exactMatches = found.filter((video) => (
      traditionalToSimplified(video.vod_name).trim().toLocaleLowerCase() === normalizedTitle
    ));
    const matches = exactMatches;
    const representative = matches[0];
    if (!representative) return;
    const parameters = new URLSearchParams({
      id: String(representative.vod_id),
      source: representative.source,
      title: representative.vod_name,
    });
    if (matches.length > 1) {
      const groupedSourcesKey = storeGroupedSources(matches.map((video) => ({
        id: video.vod_id,
        source: video.source,
        sourceName: video.sourceName,
        pic: video.vod_pic,
        typeName: video.type_name,
        remarks: video.vod_remarks,
      })));
      if (groupedSourcesKey) parameters.set("gs", groupedSourcesKey);
    }
    router.push(`/player?${parameters.toString()}`);
  };

  const cancelSearch = () => {
    searchController.current?.abort();
    setMessage(copy.cancelled);
    setState("cancelled");
  };

  const clearSearch = () => {
    searchController.current?.abort();
    setQuery("");
    setResults([]);
    setMessage("");
    setProgress({ completed: 0, total: 0, found: 0 });
    setState("idle");
  };

  const toggleFavorite = (video: Video) => {
    const id = videoRecordId(video.source, video.vod_id);
    if (favoriteIds.has(id)) {
      const record = favorites.find((favorite) => videoRecordId(favorite.source, favorite.videoId) === id);
      if (record) removeRecord("library", "favorites", record.id);
      setFavoriteFeedback(copy.favoriteRemoved);
    } else if (favorites.length >= MAX_FAVORITES) {
      setFavoriteFeedback(copy.favoriteLimit);
    } else {
      upsertRecord("library", "favorites", favoriteFromVideo({ ...video, mode: "standard" }));
      setFavoriteFeedback(copy.favoriteAdded);
    }
  };

  return (
    <div className="content-shell kvideo-home-shell">
      <ContentNavigation />
      <div className="kvideo-home-search-region">
        <SearchForm accountId={auth?.session.accountId ?? "anonymous"} mode="standard" query={query}
          labels={{ input: copy.searchLabel, placeholder: copy.searchPlaceholder, search: copy.search,
            clear: copy.clearSearch, history: copy.searchHistory, clearAll: copy.clearAllHistory, deleteItem: copy.deleteHistory }}
          disabled={sources.length === 0} loading={state === "loading"}
          progressLabel={`${copy.searching}… ${progress.completed}/${progress.total} · ${progress.found}`}
          cancelLabel={copy.cancel} onQueryChange={setQuery} onSearch={(nextQuery) => void runSearch(nextQuery)}
          onClear={clearSearch} onCancel={cancelSearch} />
        {sources.length === 0 && <p className="kvideo-source-message">{copy.sourceMissing}</p>}
      </div>

      <main className="kvideo-home-main">
        {state === "idle" && (
          <section className="kvideo-home-feature" aria-label={copy.results}>
            <DiscoverControls
              contentType={contentType}
              tags={tags}
              selectedTag={effectiveRecommendationSelected ? "" : activeTag}
              loading={tagsLoading}
              movieLabel={copy.movie}
              televisionLabel={copy.television}
              tagsLabel={copy.tags}
              loadingLabel={copy.tagsLoading}
              tagManagerLabels={copy.tagManager}
              showTypeToggle={!tagManagementOpen && !effectiveRecommendationSelected}
              recommendation={personalized.hasHistory ? {
                label: copy.personalized,
                selected: effectiveRecommendationSelected,
                onSelect: () => setRecommendationSelected(true),
              } : undefined}
              onTypeChange={(nextType) => {
                if (nextType === contentType) return;
                setRecommendationSelected(false);
                setTagsLoading(true);
                setContentType(nextType);
                setSelectedTag("热门");
                setDefaultTags(["热门"]);
              }}
              onTagChange={(tag) => {
                if (tag === "高级") {
                  router.push("/premium");
                  return;
                }
                setRecommendationSelected(false);
                setSelectedTag(tag);
              }}
              onTagAdd={addTag}
              onTagDelete={removeTag}
              onTagRestore={() => {
                restoreDefaultTags();
                setSelectedTag(defaultTags[0] ?? "热门");
              }}
              onTagMove={moveTag}
              onTagManagementChange={setTagManagementOpen}
            />
            {!tagManagementOpen && <section className="kvideo-popular-feed"
              aria-labelledby={effectiveRecommendationSelected ? "personalized-title" : "popular-title"}>
              <h2 id={effectiveRecommendationSelected ? "personalized-title" : "popular-title"} className="sr-only">
                {effectiveRecommendationSelected ? copy.personalized : copy.popular}
              </h2>
              <MovieGrid
                movies={effectiveRecommendationSelected ? personalized.movies : homeMovies}
                state={effectiveRecommendationSelected
                  ? (personalized.loading && personalized.movies.length === 0 ? "loading" : personalized.movies.length > 0 ? "ready" : "empty")
                  : homeState}
                actionLabel={copy.action}
                loadingLabel={copy.loading}
                emptyLabel={copy.empty}
                errorLabel={copy.error}
                retryLabel={copy.retry}
                onMovieClick={(movie) => void openHomeMovie(movie)}
                onRetry={() => void loadHome()}
                hasMore={effectiveRecommendationSelected ? personalized.hasMore : hasMoreHomeMovies}
                loadingMore={effectiveRecommendationSelected ? personalized.loading : loadingMoreHomeMovies}
                loadingMoreLabel={copy.loadingMore}
                noMoreLabel={copy.noMore}
                onLoadMore={effectiveRecommendationSelected ? personalized.loadMore : loadMoreHomeMovies}
              />
            </section>}
          </section>
        )}

        {history.length > 0 && state === "idle" && (
          <section className="content-section" aria-labelledby="history-title">
            <div className="section-title"><h2 id="history-title">{copy.history}</h2></div>
            <div className="history-row">
              {history.map((item) => (
                <Link key={item.id} prefetch={false} href={historyPlayerHref(item)}>
                  <strong>{item.title}</strong><span>{copy.continue}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {progress.capability && <p className="capability-hint">{
          locale === "zh-CN"
            ? `服务端 ${progress.capability.profile === "paid" ? "Paid" : "Free"}：最多 ${progress.capability.limits.sources} 个源、${progress.capability.limits.videos} 条结果。每次最多探测 ${progress.capability.limits.probeVideos} 条。`
            : locale === "zh-TW"
              ? `伺服器 ${progress.capability.profile === "paid" ? "Paid" : "Free"}：最多 ${progress.capability.limits.sources} 個來源、${progress.capability.limits.videos} 筆結果。每次最多探測 ${progress.capability.limits.probeVideos} 筆。`
              : `Server ${progress.capability.profile === "paid" ? "Paid" : "Free"}: up to ${progress.capability.limits.sources} sources and ${progress.capability.limits.videos} results. Up to ${progress.capability.limits.probeVideos} probes per request.`
        }</p>}
        {state === "cancelled" && <p className="content-message" role="status">{message}</p>}
        {state === "empty" && <p className="content-message" role="status">{copy.noResults}</p>}
        {state === "error" && <p className="form-error content-message" role="alert">{message}</p>}
        {(state === "ready" || state === "loading") && <SearchResults videos={results} sources={sources}
          accountId={auth?.session.accountId ?? "anonymous"} mode="standard" favoriteIds={favoriteIds}
          title={copy.results} itemLabel={copy.items}
          labels={{ view: copy.view, playAgain: copy.playAgain, sourceCount: copy.sourceCount,
            favorite: copy.favorite, unfavorite: copy.unfavorite, resolutionProbe: copy.resolutionProbe,
            resolutionProbing: copy.resolutionProbing, resolutionUnknown: copy.resolutionUnknown,
            resolutionError: copy.resolutionError, latency: copy.latency }}
          controlLabels={copy.resultControls} onToggleFavorite={toggleFavorite} />}
        {favoriteFeedback && <p className="favorite-feedback" role="status">{favoriteFeedback}{
          phase === "pending" || phase === "loading" ? ` ${copy.favoritePending}…`
            : phase === "offline" || phase === "quota" || phase === "error" || phase === "conflict" ? ` ${copy.favoriteDeferred}。` : ""
        }</p>}
      </main>
      <FavoritesSidebar />
      <WatchHistorySidebar />
    </div>
  );
}
