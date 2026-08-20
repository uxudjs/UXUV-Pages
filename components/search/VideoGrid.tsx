"use client";

import { useMemo, useState, type MouseEvent } from "react";
import { SearchResultCard, type SearchResultLabels } from "@/components/search/SearchResultCard";
import { VideoGroupCard, type GroupedVideo } from "@/components/search/VideoGroupCard";
import type { Video, VideoSource } from "@/lib/content/types";
import { videoRecordId } from "@/lib/content/types";
import { useSearchDisplayMode } from "@/lib/hooks/useSearchDisplayMode";
import { groupSearchVideos } from "@/lib/utils/search-result-policy";

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
  const groups = useMemo<GroupedVideo[]>(() => groupSearchVideos(videos, latencies), [latencies, videos]);
  const activate = (_event: MouseEvent<HTMLAnchorElement>, cardId: string) => setActiveCardId(cardId);

  return <div className="kvideo-result-grid" role="list" aria-label={labels.view}>
    {displayMode === "grouped" ? groups.map((group) => {
      const cardId = `group:${encodeURIComponent(group.key)}`;
      const favoriteVideo = group.videos.find((video) => favoriteIds.has(videoRecordId(video.source, video.vod_id)));
      return <VideoGroupCard key={cardId} group={group} active={activeCardId === cardId}
        favorite={!!favoriteVideo} favoriteVideo={favoriteVideo}
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
