import type { TimestampedRecord } from "@/lib/sync/document-types";
import { libraryRecordId } from "@/lib/content/library-isolation";

export interface VideoSource extends TimestampedRecord {
  name: string;
  baseUrl: string;
  searchPath?: string;
  detailPath?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  group?: "normal" | "premium";
  kind?: "system" | "personal";
  priority?: number;
}

export interface SourceSubscription extends TimestampedRecord {
  name: string;
  url: string;
  lastUpdated: number;
  lastError?: string;
  sourceIds?: string[];
  mode?: "standard" | "premium";
}

export interface ContentCapability {
  profile: "free" | "paid";
  limits: {
    sources: number;
    searchConcurrency: number;
    maxPages: number;
    videos: number;
    probeVideos: number;
    probeConcurrency: number;
    probeVariants: number;
  };
}

export interface ResolutionInfo {
  width: number;
  height: number;
  label: string;
  color?: string;
}

export interface Video {
  vod_id: string | number;
  vod_name: string;
  vod_pic?: string;
  vod_remarks?: string;
  vod_year?: string;
  vod_score?: string | number;
  relevanceScore?: number;
  type_name?: string;
  vod_lang?: string;
  source: string;
  sourceName?: string;
  mode?: "standard" | "premium";
}

export interface FavoriteRecord extends TimestampedRecord {
  videoId: string | number;
  title: string;
  source: string;
  sourceName?: string;
  poster?: string;
  remarks?: string;
  type?: string;
  year?: string;
  addedAt: number;
  mode?: "standard" | "premium";
}

export interface HistoryRecord extends TimestampedRecord {
  videoId: string | number;
  title: string;
  source: string;
  poster?: string;
  episodeIndex?: number;
  playbackPosition?: number;
  duration?: number;
  mode?: "standard" | "premium";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isVideoSource(value: unknown): value is VideoSource {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.baseUrl === "string"
    && value.enabled !== false;
}

export function isFavoriteRecord(value: unknown): value is FavoriteRecord {
  return isRecord(value)
    && typeof value.id === "string"
    && (typeof value.videoId === "string" || typeof value.videoId === "number")
    && typeof value.title === "string"
    && typeof value.source === "string"
    && typeof value.addedAt === "number";
}

export function isHistoryRecord(value: unknown): value is HistoryRecord {
  return isRecord(value)
    && typeof value.id === "string"
    && (typeof value.videoId === "string" || typeof value.videoId === "number")
    && typeof value.title === "string"
    && typeof value.source === "string";
}

export function videoRecordId(source: string, videoId: string | number): string {
  return `${source}:${videoId}`;
}

export function videoFromApi(value: unknown, fallbackSource = ""): Video | null {
  if (!isRecord(value)
    || (typeof value.vod_id !== "string" && typeof value.vod_id !== "number")
    || typeof value.vod_name !== "string") return null;
  const source = typeof value.source === "string" ? value.source : fallbackSource;
  if (!source) return null;
  const text = (key: string) => typeof value[key] === "string" ? value[key] : undefined;
  const numeric = (key: string) => typeof value[key] === "number" ? value[key] : undefined;
  return {
    vod_id: value.vod_id,
    vod_name: value.vod_name,
    vod_pic: text("vod_pic"),
    vod_remarks: text("vod_remarks"),
    vod_year: text("vod_year"),
    vod_score: numeric("vod_score") ?? text("vod_score"),
    relevanceScore: numeric("relevanceScore"),
    type_name: text("type_name"),
    vod_lang: text("vod_lang"),
    source,
    sourceName: text("sourceName") ?? text("sourceDisplayName"),
  };
}

export function favoriteFromVideo(video: Video, now = Date.now()): FavoriteRecord {
  const mode = video.mode ?? "standard";
  return {
    id: libraryRecordId(mode, video.source, video.vod_id),
    updatedAt: now,
    videoId: video.vod_id,
    title: video.vod_name,
    source: video.source,
    sourceName: video.sourceName,
    poster: video.vod_pic,
    remarks: video.vod_remarks,
    type: video.type_name,
    year: video.vod_year,
    addedAt: now,
    mode,
  };
}
