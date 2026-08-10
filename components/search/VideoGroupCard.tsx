"use client";

import Link from "next/link";
import { Layers } from "lucide-react";
import type { MouseEvent } from "react";
import { ResolutionProbeButton } from "@/components/ResolutionProbeButton";
import type { Video, VideoSource } from "@/lib/content/types";
import type { SearchResultLabels } from "@/components/search/SearchResultCard";

export interface GroupedVideo {
  name: string;
  representative: Video;
  videos: Video[];
}

interface VideoGroupCardProps {
  group: GroupedVideo;
  active: boolean;
  favorite: boolean;
  labels: SearchResultLabels;
  sources: VideoSource[];
  latency?: number;
  onActivate: (event: MouseEvent<HTMLAnchorElement>, cardId: string) => void;
  onToggleFavorite: (video: Video) => void;
}

export function VideoGroupCard({ group, active, favorite, labels, sources, latency, onActivate, onToggleFavorite }: VideoGroupCardProps) {
  const { representative, videos } = group;
  const cardId = `group:${group.name.trim().toLocaleLowerCase()}`;
  const groupKey = encodeURIComponent(`${representative.source}:${representative.vod_id}:${group.name.trim().toLocaleLowerCase()}`);
  const parameters = new URLSearchParams({ id: String(representative.vod_id), source: representative.source, title: representative.vod_name });
  const poster = !representative.vod_pic || representative.vod_pic === "/placeholder-poster.svg" ? "placeholder-poster.svg" : representative.vod_pic;
  if (videos.length > 1) parameters.set("gs", groupKey);

  const activate = (event: MouseEvent<HTMLAnchorElement>) => {
    if (videos.length > 1) {
      sessionStorage.setItem(`uxuv-grouped-sources:v1:${groupKey}`, JSON.stringify(videos.map((video) => ({
        id: video.vod_id, source: video.source, sourceName: video.sourceName, pic: video.vod_pic,
        typeName: video.type_name, remarks: video.vod_remarks,
      }))));
    }
    onActivate(event, cardId);
  };

  return <article role="listitem" className={`kvideo-result-card kvideo-result-group${active ? " is-active" : ""}`}
    data-result-kind="group" data-result-id={cardId}>
    <Link className="kvideo-result-link" href={`/player?${parameters.toString()}`} prefetch={false} data-focusable
      aria-label={`${labels.view} ${group.name.trim()}，${labels.sourceCount(videos.length)}`} onClick={activate}>
      <div className="kvideo-result-poster">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt="" loading="eager" referrerPolicy="no-referrer"
          onError={(event) => { if (!event.currentTarget.src.endsWith("/placeholder-poster.svg")) event.currentTarget.src = "placeholder-poster.svg"; }} />
        <span className="kvideo-result-source kvideo-result-source-count"><Layers size={12} aria-hidden="true" />{labels.sourceCount(videos.length)}</span>
        <div className="kvideo-result-overlay" aria-hidden={!active}>
          {active && <strong>{labels.playAgain}</strong>}
          {representative.type_name && <span className="kvideo-result-type">{representative.type_name}</span>}
          {representative.vod_year && <span>{representative.vod_year}</span>}
        </div>
      </div>
      <div className="kvideo-result-copy">
        <h3>{group.name.trim()}</h3>
        <div className="kvideo-result-meta">
          {representative.vod_lang && <span>{representative.vod_lang}</span>}
          {typeof latency === "number" && <span className="kvideo-result-latency">{labels.latency(latency)}</span>}
        </div>
      </div>
    </Link>
    <ResolutionProbeButton video={representative} sources={sources} className="kvideo-result-probe"
      labels={{ action: labels.resolutionProbe, loading: labels.resolutionProbing,
        unknown: labels.resolutionUnknown, error: labels.resolutionError }} />
    <button type="button" className="kvideo-result-favorite" data-focusable aria-pressed={favorite}
      aria-label={`${favorite ? labels.unfavorite : labels.favorite} ${group.name.trim()}`}
      onClick={() => onToggleFavorite(representative)}>{favorite ? "★" : "☆"}</button>
  </article>;
}
