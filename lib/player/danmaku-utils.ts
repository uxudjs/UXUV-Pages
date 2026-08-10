export type DanmakuType = "scroll" | "top" | "bottom";

export interface DanmakuComment {
  text: string;
  time: number;
  type: DanmakuType;
  color?: string;
}

export interface DanmakuEpisode {
  episodeId: string;
  episodeTitle: string;
}

export interface DanmakuSearchResult {
  animeId: string;
  animeTitle: string;
  episodes: DanmakuEpisode[];
}

export const MAX_DANMAKU_COMMENTS = 5_000;
const MAX_COMMENT_LENGTH = 200;
const MAX_COMMENT_TIME = 24 * 60 * 60;
const MAX_SEARCH_RESULTS = 50;
const MAX_EPISODES_PER_RESULT = 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown, maximum = 200): string | null {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return text ? text.slice(0, maximum) : null;
}

function normalizedColor(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 0xffffff) {
    return `#${value.toString(16).padStart(6, "0")}`;
  }
  if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  return undefined;
}

function normalizedComment(value: unknown): DanmakuComment | null {
  if (!isRecord(value)) return null;
  let time: number;
  let type: DanmakuType;
  let color: string | undefined;
  let text: string | null;

  if (typeof value.p === "string") {
    const [rawTime, rawType, rawColor] = value.p.split(",");
    time = Number(rawTime);
    const typeNumber = Number.parseInt(rawType ?? "1", 10);
    type = typeNumber === 5 ? "top" : typeNumber === 4 ? "bottom" : "scroll";
    const colorNumber = Number.parseInt(rawColor ?? "", 10);
    color = normalizedColor(colorNumber);
    text = nonEmptyString(value.m, MAX_COMMENT_LENGTH);
  } else {
    time = value.time as number;
    type = value.type === undefined ? "scroll" : value.type as DanmakuType;
    if (!(["scroll", "top", "bottom"] as const).includes(type)) return null;
    color = normalizedColor(value.color);
    text = nonEmptyString(value.text, MAX_COMMENT_LENGTH);
  }

  if (!text || typeof time !== "number" || !Number.isFinite(time) || time < 0 || time > MAX_COMMENT_TIME) return null;
  return { text, time, type, ...(color ? { color } : {}) };
}

export function parseDanmakuResponse(value: unknown): DanmakuComment[] {
  const source = Array.isArray(value) ? value
    : isRecord(value) && Array.isArray(value.comments) ? value.comments
      : isRecord(value) && Array.isArray(value.data) ? value.data : [];
  return source.slice(0, MAX_DANMAKU_COMMENTS)
    .map(normalizedComment)
    .filter((comment): comment is DanmakuComment => comment !== null)
    .sort((left, right) => left.time - right.time);
}

export function parseSearchResults(value: unknown): DanmakuSearchResult[] {
  const source = Array.isArray(value) ? value
    : isRecord(value) && Array.isArray(value.animes) ? value.animes
      : isRecord(value) && Array.isArray(value.data) ? value.data : [];
  return source.slice(0, MAX_SEARCH_RESULTS).flatMap((candidate): DanmakuSearchResult[] => {
    if (!isRecord(candidate)) return [];
    const animeId = nonEmptyString(candidate.animeId ?? candidate.id, 120);
    const animeTitle = nonEmptyString(candidate.animeTitle ?? candidate.title, 200);
    if (!animeId || !animeTitle) return [];
    const rawEpisodes = Array.isArray(candidate.episodes) ? candidate.episodes : [];
    const episodes = rawEpisodes.slice(0, MAX_EPISODES_PER_RESULT).flatMap((episode): DanmakuEpisode[] => {
      if (!isRecord(episode)) return [];
      const episodeId = nonEmptyString(episode.episodeId ?? episode.id, 120);
      const episodeTitle = nonEmptyString(episode.episodeTitle ?? episode.title, 200);
      return episodeId && episodeTitle ? [{ episodeId, episodeTitle }] : [];
    });
    return [{ animeId, animeTitle, episodes }];
  });
}

const CHINESE_DIGITS: Record<string, number> = {
  "零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4,
  "五": 5, "六": 6, "七": 7, "八": 8, "九": 9,
};

function chineseNumber(value: string): number | null {
  const match = value.match(/[零〇一二两三四五六七八九十]+/);
  if (!match) return null;
  const token = match[0];
  if (!token.includes("十")) return CHINESE_DIGITS[token] ?? null;
  const [tens, units] = token.split("十");
  return (tens ? CHINESE_DIGITS[tens] ?? 0 : 1) * 10 + (units ? CHINESE_DIGITS[units] ?? 0 : 0);
}

function episodeNumber(value: string): number | null {
  const digits = value.match(/\d+/);
  return digits ? Number.parseInt(digits[0], 10) : chineseNumber(value);
}

export function matchEpisode(episodes: readonly DanmakuEpisode[], episodeName: string,
  episodeIndex?: number): DanmakuEpisode | null {
  if (!episodes.length) return null;
  const localNumber = episodeNumber(episodeName);
  if (localNumber !== null) {
    const numbered = episodes.find((episode) => episodeNumber(episode.episodeTitle) === localNumber);
    if (numbered) return numbered;
  }
  const normalized = episodeName.trim().toLocaleLowerCase();
  const exact = episodes.find((episode) => episode.episodeTitle.trim().toLocaleLowerCase() === normalized);
  if (exact) return exact;
  if (episodeIndex !== undefined && episodeIndex >= 0 && episodeIndex < episodes.length) return episodes[episodeIndex];
  return episodes[0] ?? null;
}

export function fuzzyMatchTitle(results: readonly DanmakuSearchResult[], title: string): DanmakuSearchResult | null {
  if (!results.length) return null;
  const normalized = title.trim().toLocaleLowerCase();
  const exact = results.find((result) => result.animeTitle.trim().toLocaleLowerCase() === normalized);
  if (exact) return exact;
  return results.find((result) => {
    const candidate = result.animeTitle.trim().toLocaleLowerCase();
    return candidate.includes(normalized) || normalized.includes(candidate);
  }) ?? results[0] ?? null;
}

