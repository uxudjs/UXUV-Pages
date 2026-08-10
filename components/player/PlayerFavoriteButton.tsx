"use client";

import { Heart } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { useSync } from "@/components/SyncProvider";
import { Icon } from "@/components/ui/Icon";
import { favoritesForMode, MAX_FAVORITES } from "@/lib/content/favorites-policy";
import { favoriteFromVideo, isFavoriteRecord, type Video } from "@/lib/content/types";

const COPY = {
  "zh-CN": { add: "收藏", remove: "取消收藏", label: "收藏这个视频", limit: "收藏已达 100 项上限。" },
  "zh-TW": { add: "收藏", remove: "取消收藏", label: "收藏這部影片", limit: "收藏已達 100 項上限。" },
  en: { add: "Favorite", remove: "Remove favorite", label: "Favorite this video", limit: "The 100-item favorites limit has been reached." },
} as const;

export function PlayerFavoriteButton({ video }: Readonly<{ video: Video }>) {
  const { locale } = useLocale();
  const { documents, upsertRecord, removeRecord } = useSync();
  const [message, setMessage] = useState("");
  const copy = COPY[locale];
  const mode = video.mode ?? "standard";
  const records = "favorites" in documents.library.payload
    ? favoritesForMode(documents.library.payload.favorites.filter(isFavoriteRecord), mode) : [];
  const favorite = records.find((record) => record.source === video.source && String(record.videoId) === String(video.vod_id));

  const toggle = () => {
    setMessage("");
    if (favorite) {
      removeRecord("library", "favorites", favorite.id);
      return;
    }
    if (records.length >= MAX_FAVORITES) {
      setMessage(copy.limit);
      return;
    }
    upsertRecord("library", "favorites", favoriteFromVideo(video));
  };

  return <div className="player-favorite-row">
    <button type="button" aria-label={favorite ? copy.remove : copy.add} aria-pressed={Boolean(favorite)}
      onClick={toggle} data-focusable><Icon source={Heart} size={20} /></button>
    <span>{copy.label}</span>
    {message && <span role="alert">{message}</span>}
  </div>;
}
