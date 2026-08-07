"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ContentNavigation } from "@/components/ContentNavigation";
import { VideoCard } from "@/components/VideoCard";
import { useSync } from "@/components/SyncProvider";
import { isFavoriteRecord, isVideoSource, type FavoriteRecord, type Video } from "@/lib/content/types";

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
  const { documents, removeRecord } = useSync();
  const [sort, setSort] = useState<"date" | "title">("date");
  const favorites = useMemo(() => {
    const records = "favorites" in documents.library.payload
      ? documents.library.payload.favorites.filter(isFavoriteRecord).filter((favorite) =>
        mode === "premium" ? favorite.mode === "premium" : favorite.mode !== "premium") : [];
    return [...records].sort(sort === "title"
      ? (a, b) => a.title.localeCompare(b.title, "zh-CN")
      : (a, b) => b.addedAt - a.addedAt);
  }, [documents.library.payload, mode, sort]);
  const sources = useMemo(() => "sources" in documents.config.payload
    ? documents.config.payload.sources.filter(isVideoSource).filter(({ group }) =>
      mode === "premium" ? group === "premium" : group !== "premium")
    : [], [documents.config.payload, mode]);

  const remove = (video: Video) => removeRecord("library", "favorites", `${video.source}:${video.vod_id}`);
  const clear = () => {
    if (window.confirm("确定要清空全部收藏吗？")) {
      favorites.forEach(({ id }) => removeRecord("library", "favorites", id));
    }
  };

  return (
    <div className="content-shell">
      <ContentNavigation premium={mode === "premium"} />
      <main className="content-main">
        <header className="collection-header">
          <div><p className="public-kicker">YOUR LIBRARY</p><h1>{mode === "premium" ? "Premium 收藏" : "我的收藏"}</h1><p>{favorites.length} 部影片，按账户安全同步。</p></div>
          <div className="collection-actions">
            <label htmlFor="favorite-sort">排序</label>
            <select id="favorite-sort" value={sort} onChange={(event) => setSort(event.target.value as "date" | "title")}>
              <option value="date">最近收藏</option><option value="title">片名</option>
            </select>
            <button className="danger-button" type="button" disabled={favorites.length === 0} onClick={clear}>清空收藏</button>
          </div>
        </header>

        {favorites.length === 0 ? (
          <section className="empty-collection"><h2>还没有收藏</h2><p>在搜索结果中点击“收藏”，影片会出现在这里。</p><Link className="primary-link" href={mode === "premium" ? "/premium" : "/"} prefetch={false}>去搜索</Link></section>
        ) : (
          <section className="video-grid" aria-label="收藏列表">{favorites.map((favorite) => (
            <VideoCard key={favorite.id} video={toVideo(favorite)} sources={sources} favorite onToggleFavorite={remove} />
          ))}</section>
        )}
      </main>
    </div>
  );
}
