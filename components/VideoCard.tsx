"use client";

import Link from "next/link";
import { ResolutionProbeButton } from "@/components/ResolutionProbeButton";
import type { Video, VideoSource } from "@/lib/content/types";

interface VideoCardProps {
  video: Video;
  favorite: boolean;
  onToggleFavorite: (video: Video) => void;
  sources?: VideoSource[];
}

export function VideoCard({ video, favorite, onToggleFavorite, sources = [] }: VideoCardProps) {
  const href = `/player?${new URLSearchParams({
    id: String(video.vod_id),
    source: video.source,
    title: video.vod_name,
  }).toString()}`;

  return (
    <article className="video-card">
      <Link className="video-card-link" href={href} prefetch={false} aria-label={`查看 ${video.vod_name}`}>
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
          <p>{[video.type_name, video.vod_year, video.vod_lang].filter(Boolean).join(" · ") || "视频"}</p>
          {video.vod_remarks && <span>{video.vod_remarks}</span>}
        </div>
      </Link>
      <ResolutionProbeButton video={video} sources={sources} />
      <button
        className="favorite-toggle"
        type="button"
        aria-label={favorite ? `取消收藏 ${video.vod_name}` : `收藏 ${video.vod_name}`}
        aria-pressed={favorite}
        onClick={() => onToggleFavorite(video)}
      >
        {favorite ? "已收藏" : "收藏"}
      </button>
    </article>
  );
}
