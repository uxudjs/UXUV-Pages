export interface GroupedSource {
  id: string | number;
  source: string;
  sourceName?: string;
  pic?: string;
  typeName?: string;
  remarks?: string;
  latency?: number;
}

export function sortPlaybackSources(sources: readonly GroupedSource[]): GroupedSource[] {
  return sources.map((source, index) => ({ source, index })).sort((left, right) => {
    const leftLatency = left.source.latency ?? Number.POSITIVE_INFINITY;
    const rightLatency = right.source.latency ?? Number.POSITIVE_INFINITY;
    return leftLatency - rightLatency || left.index - right.index;
  }).map(({ source }) => source);
}

const CACHE_PREFIX = "uxuv-grouped-sources:v1:";
export const MAX_CACHE_ENTRIES = 100;
const MAX_GROUPED_SOURCES = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseGroupedSources(value: unknown): GroupedSource[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_GROUPED_SOURCES).flatMap((item): GroupedSource[] => {
    if (!isRecord(item) || (typeof item.id !== "string" && typeof item.id !== "number")
      || typeof item.source !== "string" || item.source.length > 160) return [];
    const text = (key: string, max = 240) => typeof item[key] === "string" ? item[key].slice(0, max) : undefined;
    return [{
      id: item.id,
      source: item.source,
      sourceName: text("sourceName", 100),
      pic: text("pic", 2_048),
      typeName: text("typeName", 100),
      remarks: text("remarks", 240),
      latency: typeof item.latency === "number" && Number.isFinite(item.latency) ? item.latency : undefined,
    }];
  });
}

function cleanupGroupedSourcesCache() {
  const entries: Array<{ key: string; storedAt: number }> = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (!key?.startsWith(CACHE_PREFIX)) continue;
    try {
      const parsed: unknown = JSON.parse(sessionStorage.getItem(key) || "null");
      entries.push({ key, storedAt: isRecord(parsed) && typeof parsed.storedAt === "number" ? parsed.storedAt : 0 });
    } catch { entries.push({ key, storedAt: 0 }); }
  }
  if (entries.length < MAX_CACHE_ENTRIES) return;
  entries.sort((left, right) => left.storedAt - right.storedAt);
  entries.slice(0, Math.floor(entries.length / 2)).forEach(({ key }) => sessionStorage.removeItem(key));
}

export function storeGroupedSources(sources: GroupedSource[]): string {
  const safe = parseGroupedSources(sources);
  if (typeof window === "undefined" || safe.length === 0) return "";
  const key = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  try {
    cleanupGroupedSourcesCache();
    sessionStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify({ data: safe, storedAt: Date.now() }));
    return key;
  } catch { return ""; }
}

export function readGroupedSources(key: string): GroupedSource[] {
  if (typeof window === "undefined" || !/^[A-Za-z0-9:%_.-]{1,240}$/.test(key)) return [];
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(`${CACHE_PREFIX}${key}`) || "null");
    return parseGroupedSources(isRecord(parsed) && Array.isArray(parsed.data) ? parsed.data : parsed);
  } catch { return []; }
}
