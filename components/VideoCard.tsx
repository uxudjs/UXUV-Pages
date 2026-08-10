"use client";

import Link from "next/link";
import { useLocale } from "@/components/LocaleProvider";
import { ResolutionProbeButton } from "@/components/ResolutionProbeButton";
import type { Video, VideoSource } from "@/lib/content/types";

const COPY = {
  "zh-CN": { view: "查看", video: "视频", favorite: "收藏", favorited: "已收藏", unfavorite: "取消收藏" },
  "zh-TW": { view: "查看", video: "影片", favorite: "收藏", favorited: "已收藏", unfavorite: "取消收藏" },
  en: { view: "View", video: "Video", favorite: "Favorite", favorited: "Favorited", unfavorite: "Remove favorite" },
} as const;

interface VideoCardProps {
  video: Video;
  favorite: boolean;
  onToggleFavorite: (video: Video) => void;
  sources?: VideoSource[];
}

export function VideoCard({ video, favorite, onToggleFavorite, sources = [] }: VideoCardProps) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const parameters = new URLSearchParams({
    id: String(video.vod_id),
    source: video.source,
    title: video.vod_name,
  });
  if (video.mode === "premium") parameters.set("premium", "1");
  const href = `/player?${parameters.toString()}`;

  return (
    <article className="video-card">
      <Link
        className="video-card-link"
        href={href}
        prefetch={false}
        aria-label={`${copy.view} ${video.vod_name}`}
        data-focusable
      >
        <div className="poster-frame">
          {video.vod_pic ? (
            // Static export deliberately avoids the Next image optimizer.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              src={video.vod_pic}
              onError={(event) => { event.currentTarget.hidden = true; }}
            />
          ) : null}
          <span className="poster-fallback" aria-hidden="true">UXU</span>
          <span className="source-badge">{video.sourceName || video.source}</span>
        </div>
        <div className="video-card-copy">
          <h3>{video.vod_name}</h3>
          <p>{[video.type_name, video.vod_year, video.vod_lang].filter(Boolean).join(" · ") || copy.video}</p>
          {video.vod_remarks && <span>{video.vod_remarks}</span>}
        </div>
      </Link>
      <ResolutionProbeButton video={video} sources={sources} />
      <button
        className="favorite-toggle"
        type="button"
        aria-label={favorite ? `${copy.unfavorite} ${video.vod_name}` : `${copy.favorite} ${video.vod_name}`}
        aria-pressed={favorite}
        data-focusable
        onClick={() => onToggleFavorite(video)}
      >
        {favorite ? copy.favorited : copy.favorite}
      </button>
    </article>
  );
}
