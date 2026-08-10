import type { Video } from "@/lib/content/types";

export const SEARCH_SORT_OPTIONS = [
  "default", "relevance", "latency-asc", "date-desc", "date-asc", "rating-desc", "name-asc", "name-desc",
] as const;
export type SearchSortOption = typeof SEARCH_SORT_OPTIONS[number];

export interface SearchFilters {
  blockedCategories: string[];
  selectedSources: Set<string>;
  selectedTypes: Set<string>;
  selectedLanguages: Set<string>;
}

export function normalizeTypeName(value: string): string {
  let normalized = value.replace(/\s+/g, "").trim().normalize("NFC").toLocaleLowerCase();
  if (normalized.length > 2 && /[片剧類类]$/.test(normalized)) normalized = normalized.slice(0, -1);
  return normalized;
}

export function filterVideos(videos: Video[], filters: SearchFilters): Video[] {
  const blocked = filters.blockedCategories.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean);
  const types = new Set([...filters.selectedTypes].map(normalizeTypeName));
  return videos.filter((video) => {
    const type = video.type_name?.trim() ?? "";
    if (blocked.some((category) => type.toLocaleLowerCase().includes(category))) return false;
    if (filters.selectedSources.size > 0 && !filters.selectedSources.has(video.source)) return false;
    if (types.size > 0 && !types.has(normalizeTypeName(type))) return false;
    if (filters.selectedLanguages.size > 0 && (!video.vod_lang || !filters.selectedLanguages.has(video.vod_lang.trim()))) return false;
    return true;
  });
}

function finite(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sortVideos(videos: Video[], sortBy: SearchSortOption, latencies: Record<string, number>): Video[] {
  const ranked = videos.map((video, originalIndex) => ({ video, originalIndex }));
  const latency = (video: Video) => latencies[video.source] ?? Number.POSITIVE_INFINITY;
  const compare = (left: typeof ranked[number], right: typeof ranked[number]) => {
    const a = left.video;
    const b = right.video;
    let result = 0;
    switch (sortBy) {
      case "relevance": result = finite(b.relevanceScore) - finite(a.relevanceScore); break;
      case "latency-asc": result = latency(a) - latency(b); break;
      case "date-desc": result = finite(b.vod_year) - finite(a.vod_year); break;
      case "date-asc": result = finite(a.vod_year) - finite(b.vod_year); break;
      case "rating-desc": result = finite(b.vod_score) - finite(a.vod_score); break;
      case "name-asc": result = a.vod_name.localeCompare(b.vod_name, "zh-CN"); break;
      case "name-desc": result = b.vod_name.localeCompare(a.vod_name, "zh-CN"); break;
      case "default":
      default:
        result = finite(b.relevanceScore) - finite(a.relevanceScore);
        if (result === 0) result = latency(a) - latency(b);
    }
    return Number.isNaN(result) || result === 0 ? left.originalIndex - right.originalIndex : result;
  };
  return ranked.sort(compare).map(({ video }) => video);
}
