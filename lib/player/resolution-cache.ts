export interface ResolutionCacheEntry {
  width?: number;
  height?: number;
  label: string;
  origin?: "probed" | "played" | "hint";
  episodeIndex?: number;
}

const CACHE_PREFIX = "uxuv-resolution:v1:";

export function getResolutionCacheKey(source: string, id: string | number): string {
  return `${CACHE_PREFIX}${source}:${id}`;
}

function validEntry(value: unknown): value is ResolutionCacheEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.label === "string" && entry.label.length <= 20
    && (entry.width === undefined || typeof entry.width === "number")
    && (entry.height === undefined || typeof entry.height === "number")
    && (entry.episodeIndex === undefined || typeof entry.episodeIndex === "number");
}

export function getCachedResolution(source: string, id: string | number): ResolutionCacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(getResolutionCacheKey(source, id)) || "null");
    return validEntry(value) ? value : null;
  } catch { return null; }
}

export function setCachedResolution(source: string, id: string | number, info: ResolutionCacheEntry) {
  if (typeof window === "undefined" || !validEntry(info)) return;
  try { sessionStorage.setItem(getResolutionCacheKey(source, id), JSON.stringify(info)); } catch { /* optional cache */ }
}

export function shouldReuseCachedResolution(entry: ResolutionCacheEntry | null, episodeIndex?: number): boolean {
  return Boolean(entry && entry.origin !== "hint" && entry.episodeIndex === episodeIndex);
}
