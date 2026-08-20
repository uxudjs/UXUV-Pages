"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Heart, Inbox } from "lucide-react";
import { ContentNavigation } from "@/components/ContentNavigation";
import { FavoritesSidebar } from "@/components/favorites/FavoritesSidebar";
import { WatchHistorySidebar } from "@/components/history/WatchHistorySidebar";
import { useLocale } from "@/components/LocaleProvider";
import { VideoCard } from "@/components/VideoCard";
import { useSync } from "@/components/SyncProvider";
import { favoritesForMode, MAX_FAVORITES } from "@/lib/content/favorites-policy";
import { isFavoriteRecord, isVideoSource, type FavoriteRecord, type Video } from "@/lib/content/types";
import { useDialogFocusTrap } from "@/lib/hooks/useDialogFocusTrap";
import { Icon } from "@/components/ui/Icon";

const COPY = {
  "zh-CN": { standardTitle: "我的收藏", premiumTitle: "Premium 收藏", summary: "部影片，按账户安全同步。", sort: "排序",
    recent: "最近收藏", title: "片名", grid: "网格", list: "列表", clear: "清空收藏", emptyTitle: "还没有收藏",
    emptyBody: "在搜索结果中点击“收藏”，影片会出现在这里。", search: "去搜索", remove: "取消收藏", capacity: "收藏容量", sync: "同步状态",
    confirmClear: "清空全部收藏？", irreversible: "只会清除此模式的收藏，且无法撤销。", confirm: "确认清空", cancel: "取消" },
  "zh-TW": { standardTitle: "我的收藏", premiumTitle: "Premium 收藏", summary: "部影片，依帳戶安全同步。", sort: "排序",
    recent: "最近收藏", title: "片名", grid: "網格", list: "列表", clear: "清空收藏", emptyTitle: "尚無收藏",
    emptyBody: "在搜尋結果中點擊「收藏」，影片會顯示在這裡。", search: "前往搜尋", remove: "取消收藏", capacity: "收藏容量", sync: "同步狀態",
    confirmClear: "清空全部收藏？", irreversible: "只會清除此模式的收藏，且無法復原。", confirm: "確認清空", cancel: "取消" },
  en: { standardTitle: "My favorites", premiumTitle: "Premium favorites", summary: "titles, securely synced per account.", sort: "Sort",
    recent: "Recently added", title: "Title", grid: "Grid", list: "List", clear: "Clear favorites", emptyTitle: "No favorites yet",
    emptyBody: "Favorite a search result and it will appear here.", search: "Search videos", remove: "Remove favorite", capacity: "Favorite capacity", sync: "Sync status",
    confirmClear: "Clear all favorites?", irreversible: "Only this mode's favorites will be cleared. This cannot be undone.", confirm: "Clear", cancel: "Cancel" },
} as const;

const LEGACY_COPY = {
  "zh-CN": { back: "返回上一页", title: "我的收藏", count: "共 {count} 个视频", recent: "最新添加", byTitle: "标题排序", empty: "暂无收藏", hint: "点击视频上的心形按钮即可收藏" },
  "zh-TW": { back: "返回上一頁", title: "我的收藏", count: "共 {count} 個影片", recent: "最新加入", byTitle: "標題排序", empty: "暫無收藏", hint: "點擊影片上的愛心按鈕即可收藏" },
  en: { back: "Go back", title: "My favorites", count: "{count} videos", recent: "Recently added", byTitle: "Title", empty: "No favorites", hint: "Use the heart button on a video to save it" },
} as const;

function favoriteHref(favorite: FavoriteRecord, mode: "standard" | "premium") {
  const parameters = new URLSearchParams({ id: String(favorite.videoId), source: favorite.source, title: favorite.title });
  if (mode === "premium") parameters.set("premium", "1");
  return `/player?${parameters.toString()}`;
}

function toVideo(favorite: FavoriteRecord): Video {
  return {
    vod_id: favorite.videoId,
    vod_name: favorite.title,
    vod_pic: favorite.poster,
    vod_remarks: favorite.remarks,
    vod_year: favorite.year,
    type_name: favorite.type,
    source: favorite.source,
    sourceName: favorite.sourceName,
    mode: favorite.mode,
  };
}

export function FavoritesExperience({ mode = "standard" }: Readonly<{ mode?: "standard" | "premium" }>) {
  const { documents, phase, removeRecord } = useSync();
  const { locale } = useLocale();
  const [sort, setSort] = useState<"date" | "title">("date");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [confirmClear, setConfirmClear] = useState(false);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const clearDialogRef = useRef<HTMLElement>(null);
  const copy = COPY[locale];
  const favorites = useMemo(() => {
    const records = "favorites" in documents.library.payload
      ? favoritesForMode(documents.library.payload.favorites.filter(isFavoriteRecord), mode) : [];
    return [...records].sort(sort === "title"
      ? (a, b) => a.title.localeCompare(b.title, "zh-CN")
      : (a, b) => b.addedAt - a.addedAt);
  }, [documents.library.payload, mode, sort]);
  const sources = useMemo(() => "sources" in documents.config.payload
    ? documents.config.payload.sources.filter(isVideoSource).filter(({ group }) =>
      mode === "premium" ? group === "premium" : group !== "premium")
    : [], [documents.config.payload, mode]);

  const remove = (video: Video) => {
    const record = favorites.find((favorite) => favorite.source === video.source && String(favorite.videoId) === String(video.vod_id));
    if (record) removeRecord("library", "favorites", record.id);
  };
  const closeClear = useCallback(() => setConfirmClear(false), []);
  useDialogFocusTrap({ open: confirmClear, dialogRef: clearDialogRef, returnFocusRef: clearButtonRef, onEscape: closeClear });
  const clear = () => {
    favorites.forEach(({ id }) => removeRecord("library", "favorites", id));
    setConfirmClear(false);
  };

  if (favorites.length === 0) {
    const legacy = LEGACY_COPY[locale];
    return <div className="content-shell"><ContentNavigation premium={mode === "premium"} />
      <main className="favorites-legacy-main"><header className="favorites-legacy-header" data-material="regular">
        <button type="button" className="favorites-legacy-back" data-focusable onClick={() => history.back()}>
          <Icon source={ArrowLeft} size={20} />{legacy.back}</button>
        <div className="favorites-legacy-row"><div className="favorites-legacy-title"><span><Icon source={Heart} size={24} /></span><div>
          <h1>{legacy.title}</h1><p>{legacy.count.replace("{count}", "0")}</p></div></div>
          <div className="favorites-legacy-sort"><button type="button" data-focusable aria-pressed={sort === "date"}
            onClick={() => setSort("date")}>{legacy.recent}</button><button type="button" data-focusable aria-pressed={sort === "title"}
            onClick={() => setSort("title")}>{legacy.byTitle}</button></div></div>
      </header><section className="favorites-legacy-empty"><Icon source={Inbox} size={64} /><p>{legacy.empty}</p><small>{legacy.hint}</small></section></main>
      <FavoritesSidebar premium={mode === "premium"} /><WatchHistorySidebar premium={mode === "premium"} />
      </div>;
  }

  return (
    <div className="content-shell">
      <ContentNavigation premium={mode === "premium"} />
      <main className="content-main">
        <header className="collection-header">
          <div><p className="public-kicker">YOUR LIBRARY</p><h1>{mode === "premium" ? copy.premiumTitle : copy.standardTitle}</h1>
            <p>{favorites.length} {copy.summary}</p><p className="favorites-capacity">{copy.capacity}{locale === "en" ? ": " : "："}{favorites.length}/{MAX_FAVORITES} · {copy.sync}{locale === "en" ? ": " : "："}{phase}</p></div>
          <div className="collection-actions" data-material="regular">
            <label htmlFor="favorite-sort">{copy.sort}</label>
            <select id="favorite-sort" data-focusable value={sort} onChange={(event) => setSort(event.target.value as "date" | "title")}>
              <option value="date">{copy.recent}</option><option value="title">{copy.title}</option>
            </select>
            <div className="favorites-view-switch" aria-label={`${copy.grid}/${copy.list}`}>
              <button type="button" data-focusable aria-pressed={view === "grid"} onClick={() => setView("grid")}>{copy.grid}</button>
              <button type="button" data-focusable aria-pressed={view === "list"} onClick={() => setView("list")}>{copy.list}</button>
            </div>
            <button ref={clearButtonRef} className="danger-button" type="button" data-focusable disabled={favorites.length === 0}
              onClick={() => setConfirmClear(true)}>{copy.clear}</button>
          </div>
        </header>

        {favorites.length === 0 ? (
          <section className="empty-collection"><h2>{copy.emptyTitle}</h2><p>{copy.emptyBody}</p>
            <Link className="primary-link" data-focusable href={mode === "premium" ? "/premium" : "/"} prefetch={false}>{copy.search}</Link></section>
        ) : view === "list" ? (
          <ul className="favorites-list-view" aria-label={copy.list}>{favorites.map((favorite) => (
            <li key={favorite.id}><Link href={favoriteHref(favorite, mode)} data-focusable
              prefetch={false}><strong>{favorite.title}</strong><span>{[favorite.sourceName || favorite.source, favorite.type, favorite.year].filter(Boolean).join(" · ")}</span></Link>
              <button type="button" data-focusable aria-label={`${copy.remove} ${favorite.title}`}
                onClick={() => removeRecord("library", "favorites", favorite.id)}>{copy.remove}</button></li>
          ))}</ul>
        ) : (
          <section className="favorites-grid-view video-grid" aria-label={copy.grid}>{favorites.map((favorite) => (
            <VideoCard key={favorite.id} video={toVideo(favorite)} sources={sources} favorite onToggleFavorite={remove} />
          ))}</section>
        )}
        {confirmClear && <><button type="button" className="collection-confirm-backdrop" aria-label={copy.cancel} onClick={closeClear} />
          <section ref={clearDialogRef} className="collection-confirm" data-material="regular" role="alertdialog" aria-modal="true" aria-labelledby="favorites-clear-title">
            <h2 id="favorites-clear-title">{copy.confirmClear}</h2><p>{copy.irreversible}</p><div>
              <button type="button" data-autofocus data-focusable onClick={closeClear}>{copy.cancel}</button>
              <button type="button" className="danger-button" data-focusable onClick={clear}>{copy.confirm}</button>
            </div></section></>}
      </main>
      <FavoritesSidebar premium={mode === "premium"} />
      <WatchHistorySidebar premium={mode === "premium"} />
    </div>
  );
}
