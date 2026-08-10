"use client";

import Link from "next/link";
import type { MouseEvent } from "react";
import { ResolutionProbeButton } from "@/components/ResolutionProbeButton";
import type { Video, VideoSource } from "@/lib/content/types";
import { videoRecordId } from "@/lib/content/types";

export interface SearchResultLabels {
  view: string;
  playAgain: string;
  sourceCount: (count: number) => string;
  favorite: string;
  unfavorite: string;
  resolutionProbe: string;
  resolutionProbing: string;
  resolutionUnknown: string;
  resolutionError: string;
  latency: (value: number) => string;
}

interface SearchResultCardProps {
  video: Video;
  active: boolean;
  favorite: boolean;
  labels: SearchResultLabels;
  sources: VideoSource[];
  latency?: number;
  onActivate: (event: MouseEvent<HTMLAnchorElement>, cardId: string) => void;
  onToggleFavorite: (video: Video) => void;
}

export function SearchResultCard({ video, active, favorite, labels, sources, latency, onActivate, onToggleFavorite }: SearchResultCardProps) {
  const cardId = videoRecordId(video.source, video.vod_id);
  const href = `/player?${new URLSearchParams({ id: String(video.vod_id), source: video.source, title: video.vod_name }).toString()}`;
  const poster = !video.vod_pic || video.vod_pic === "/placeholder-poster.svg" ? "placeholder-poster.svg" : video.vod_pic;

  return <article role="listitem" className={`kvideo-result-card${active ? " is-active" : ""}`}
    data-result-kind="video" data-result-id={cardId}>
    <Link className="kvideo-result-link" href={href} prefetch={false} data-focusable
      aria-label={`${labels.view} ${video.vod_name.trim()}`} onClick={(event) => onActivate(event, cardId)}>
      <div className="kvideo-result-poster">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt="" loading="eager" referrerPolicy="no-referrer"
          onError={(event) => { if (!event.currentTarget.src.endsWith("/placeholder-poster.svg")) event.currentTarget.src = "placeholder-poster.svg"; }} />
        <span className="kvideo-result-source">{video.sourceName || video.source}</span>
        <div className="kvideo-result-overlay" aria-hidden={!active}>
          {active && <strong>{labels.playAgain}</strong>}
          {video.type_name && <span className="kvideo-result-type">{video.type_name}</span>}
          {video.vod_year && <span>{video.vod_year}</span>}
        </div>
      </div>
      <div className="kvideo-result-copy">
        <h3>{video.vod_name.trim()}</h3>
        <div className="kvideo-result-meta">
          {video.vod_lang && <span>{video.vod_lang}</span>}
          {typeof latency === "number" && <span className="kvideo-result-latency">{labels.latency(latency)}</span>}
        </div>
      </div>
    </Link>
    <ResolutionProbeButton video={video} sources={sources} className="kvideo-result-probe"
      labels={{ action: labels.resolutionProbe, loading: labels.resolutionProbing,
        unknown: labels.resolutionUnknown, error: labels.resolutionError }} />
    <button type="button" className="kvideo-result-favorite" data-focusable aria-pressed={favorite}
      aria-label={`${favorite ? labels.unfavorite : labels.favorite} ${video.vod_name.trim()}`}
      onClick={() => onToggleFavorite(video)}>{favorite ? "★" : "☆"}</button>
  </article>;
}
