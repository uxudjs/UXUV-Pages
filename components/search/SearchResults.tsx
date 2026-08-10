"use client";

import { useMemo, useState } from "react";
import { SearchResultControls, type SearchFilterBadge, type SearchResultControlLabels } from "@/components/search/SearchResultControls";
import { VideoGrid } from "@/components/search/VideoGrid";
import type { SearchResultLabels } from "@/components/search/SearchResultCard";
import type { Video, VideoSource } from "@/lib/content/types";
import { useLatencyPing } from "@/lib/hooks/useLatencyPing";
import { useSearchResultPreferences } from "@/lib/hooks/useSearchResultPreferences";
import { filterVideos, normalizeTypeName, sortVideos } from "@/lib/utils/search-result-policy";

interface SearchResultsProps {
  videos: Video[];
  sources: VideoSource[];
  accountId: string;
  mode: "standard" | "premium";
  favoriteIds: Set<string>;
  title: string;
  itemLabel: string;
  labels: SearchResultLabels;
  controlLabels: SearchResultControlLabels;
  onToggleFavorite: (video: Video) => void;
}

function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
  setter((current) => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; });
}

function badges(values: { value: string; label: string }[]): SearchFilterBadge[] {
  const counts = new Map<string, SearchFilterBadge>();
  for (const item of values) {
    const current = counts.get(item.value);
    if (current) current.count += 1;
    else counts.set(item.value, { ...item, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "zh-CN"));
}

export function SearchResults({ videos, sources, accountId, mode, favoriteIds, title, itemLabel, labels, controlLabels, onToggleFavorite }: SearchResultsProps) {
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const preferences = useSearchResultPreferences(accountId, mode);
  const { latencies, isPinging } = useLatencyPing(sources, preferences.realtimeLatency);
  const available = useMemo(() => {
    const unblocked = filterVideos(videos, { blockedCategories: preferences.blockedCategories,
      selectedSources: new Set(), selectedTypes: new Set(), selectedLanguages: new Set() });
    return {
      sources: badges(unblocked.map((video) => ({ value: video.source, label: video.sourceName || video.source }))),
      types: badges(unblocked.filter((video) => video.type_name?.trim()).map((video) => ({
        value: normalizeTypeName(video.type_name!), label: video.type_name!.trim(),
      }))),
      languages: badges(unblocked.filter((video) => video.vod_lang?.trim()).map((video) => ({
        value: video.vod_lang!.trim(), label: video.vod_lang!.trim(),
      }))),
    };
  }, [preferences.blockedCategories, videos]);
  const effectiveSources = useMemo(() => new Set([...selectedSources]
    .filter((value) => available.sources.some((badge) => badge.value === value))), [available.sources, selectedSources]);
  const effectiveTypes = useMemo(() => new Set([...selectedTypes]
    .filter((value) => available.types.some((badge) => badge.value === value))), [available.types, selectedTypes]);
  const effectiveLanguages = useMemo(() => new Set([...selectedLanguages]
    .filter((value) => available.languages.some((badge) => badge.value === value))), [available.languages, selectedLanguages]);
  const displayed = useMemo(() => sortVideos(filterVideos(videos, {
    blockedCategories: preferences.blockedCategories, selectedSources: effectiveSources,
    selectedTypes: effectiveTypes, selectedLanguages: effectiveLanguages,
  }), preferences.sortBy, latencies),
  [effectiveLanguages, effectiveSources, effectiveTypes, latencies, preferences.blockedCategories, preferences.sortBy, videos]);
  if (videos.length === 0) return null;
  return <section className="content-section kvideo-search-results" aria-labelledby="results-title">
    <div className="section-title"><h2 id="results-title">{title}</h2><span>{displayed.length} {itemLabel}</span></div>
    <SearchResultControls labels={controlLabels} sourceBadges={available.sources} typeBadges={available.types}
      languageBadges={available.languages} selectedSources={effectiveSources} selectedTypes={effectiveTypes}
      selectedLanguages={effectiveLanguages} sortBy={preferences.sortBy} realtimeLatency={preferences.realtimeLatency}
      isPinging={isPinging} blockedCategories={preferences.blockedCategories}
      onToggleSource={(value) => toggle(setSelectedSources, value)} onToggleType={(value) => toggle(setSelectedTypes, value)}
      onToggleLanguage={(value) => toggle(setSelectedLanguages, value)} onClearFilters={() => {
        setSelectedSources(new Set()); setSelectedTypes(new Set()); setSelectedLanguages(new Set());
      }} onSortChange={preferences.setSortBy} onRealtimeLatencyChange={preferences.setRealtimeLatency}
      onAddBlockedCategory={preferences.addBlockedCategory} onRemoveBlockedCategory={preferences.removeBlockedCategory} />
    <VideoGrid videos={displayed} sources={sources} latencies={latencies} accountId={accountId} mode={mode} favoriteIds={favoriteIds}
      labels={labels} onToggleFavorite={onToggleFavorite} />
  </section>;
}
