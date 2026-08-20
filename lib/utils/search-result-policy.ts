import type { Video } from "@/lib/content/types";

export const SEARCH_SORT_OPTIONS = [
  "default", "relevance", "latency-asc", "date-desc", "date-asc", "rating-desc", "name-asc", "name-desc",
] as const;
export type SearchSortOption = typeof SEARCH_SORT_OPTIONS[number];
export type SearchTypeFamily = "movie" | "tv" | "anime" | "variety" | "documentary" | "other" | "unknown";

export interface SearchVideoGroup {
  key: string;
  name: string;
  representative: Video;
  videos: Video[];
}

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

function normalizedTitle(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

export function searchTypeFamily(value?: string): SearchTypeFamily {
  const normalized = value?.normalize("NFC").trim().toLocaleLowerCase() ?? "";
  if (!normalized) return "unknown";
  if (/(电影|電影|影片|movie|film)/iu.test(normalized)) return "movie";
  if (/(电视剧|電視劇|连续剧|連續劇|剧集|劇集|television|series|\btv\b)/iu.test(normalized)) return "tv";
  if (/(动漫|動漫|动画|動畫|番剧|番劇|anime|animation)/iu.test(normalized)) return "anime";
  if (/(综艺|綜藝|variety|reality)/iu.test(normalized)) return "variety";
  if (/(纪录|紀錄|记录|紀實|纪实|documentary)/iu.test(normalized)) return "documentary";
  return "other";
}

function normalizedYear(value?: string): string {
  const normalized = value?.trim() ?? "";
  if (!/^\d{4}$/.test(normalized)) return "unknown";
  const year = Number(normalized);
  return year >= 1888 && year <= 2100 ? normalized : "unknown";
}

export function searchGroupKey(video: Video): string {
  return `${normalizedTitle(video.vod_name)}\0${searchTypeFamily(video.type_name)}\0${normalizedYear(video.vod_year)}`;
}

export function groupSearchVideos(videos: Video[], latencies: Record<string, number>): SearchVideoGroup[] {
  const grouped = new Map<string, { key: string; name: string; videos: Video[] }>();
  for (const video of videos) {
    const key = searchGroupKey(video);
    const existing = grouped.get(key);
    if (existing) existing.videos.push(video);
    else grouped.set(key, { key, name: video.vod_name.trim(), videos: [video] });
  }
  return [...grouped.values()].map((group) => {
    const ranked = group.videos.map((video, index) => ({ video, index })).sort((a, b) => {
      const difference = (latencies[a.video.source] ?? Number.POSITIVE_INFINITY)
        - (latencies[b.video.source] ?? Number.POSITIVE_INFINITY);
      return Number.isNaN(difference) || difference === 0 ? a.index - b.index : difference;
    }).map(({ video }) => video);
    return { ...group, representative: ranked[0], videos: ranked };
  });
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
