"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { SearchResultCard, type SearchResultLabels } from "@/components/search/SearchResultCard";
import { VideoGroupCard, type GroupedVideo } from "@/components/search/VideoGroupCard";
import type { Video, VideoSource } from "@/lib/content/types";
import { videoRecordId } from "@/lib/content/types";
import { useSearchDisplayMode } from "@/lib/hooks/useSearchDisplayMode";

interface VideoGridProps {
  videos: Video[];
  sources: VideoSource[];
  latencies: Record<string, number>;
  accountId: string;
  mode: "standard" | "premium";
  favoriteIds: Set<string>;
  labels: SearchResultLabels;
  onToggleFavorite: (video: Video) => void;
}

export function VideoGrid({ videos, sources, latencies, accountId, mode, favoriteIds, labels, onToggleFavorite }: VideoGridProps) {
  const displayMode = useSearchDisplayMode(accountId, mode);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const groups = useMemo<GroupedVideo[]>(() => {
    const byName = new Map<string, GroupedVideo>();
    for (const video of videos) {
      const normalizedName = video.vod_name.trim().toLocaleLowerCase();
      const existing = byName.get(normalizedName);
      if (existing) existing.videos.push(video);
      else byName.set(normalizedName, { name: video.vod_name, representative: video, videos: [video] });
    }
    return [...byName.values()].map((group) => {
      const ranked = group.videos.map((video, index) => ({ video, index })).sort((a, b) => {
        const difference = (latencies[a.video.source] ?? Number.POSITIVE_INFINITY)
          - (latencies[b.video.source] ?? Number.POSITIVE_INFINITY);
        return Number.isNaN(difference) || difference === 0 ? a.index - b.index : difference;
      }).map(({ video }) => video);
      return { ...group, representative: ranked[0], videos: ranked };
    });
  }, [latencies, videos]);
  const activate = (_event: MouseEvent<HTMLAnchorElement>, cardId: string) => setActiveCardId(cardId);

  return <div className="kvideo-result-grid" role="list" aria-label={labels.view}>
    {displayMode === "grouped" ? groups.map((group) => {
      const cardId = `group:${group.name.trim().toLocaleLowerCase()}`;
      return <VideoGroupCard key={cardId} group={group} active={activeCardId === cardId}
        favorite={group.videos.some((video) => favoriteIds.has(videoRecordId(video.source, video.vod_id)))}
        labels={labels} sources={sources} latency={latencies[group.representative.source]}
        onActivate={activate} onToggleFavorite={onToggleFavorite} />;
    }) : videos.map((video) => {
      const cardId = videoRecordId(video.source, video.vod_id);
      return <SearchResultCard key={cardId} video={video} active={activeCardId === cardId}
        favorite={favoriteIds.has(cardId)} labels={labels} sources={sources} latency={latencies[video.source]}
        onActivate={activate} onToggleFavorite={onToggleFavorite} />;
    })}
  </div>;
}
