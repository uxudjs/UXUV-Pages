import type { ConfigPayload } from "@/lib/sync/document-types";

export type FullscreenType = "auto" | "native" | "window";
export type ProxyMode = "retry" | "none" | "always";
export type AdFilterMode = "off" | "keyword" | "heuristic" | "aggressive";

export const MIN_SEEK_STEP_SECONDS = 1;
export const MAX_SEEK_STEP_SECONDS = 120;
export const MAX_SKIP_SECONDS = 600;
export const PLAYER_SETTINGS_MIGRATION_KEY = "uxuv-player-settings-account-migration-v1";

export interface PlayerSettingsSnapshot {
  autoNextEpisode: boolean;
  autoSkipIntro: boolean;
  skipIntroSeconds: number;
  autoSkipOutro: boolean;
  skipOutroSeconds: number;
  seekStepSeconds: number;
  showModeIndicator: boolean;
  adFilterMode: AdFilterMode;
  adKeywords: string[];
  fullscreenType: FullscreenType;
  proxyMode: ProxyMode;
  videoTogetherEnabled: boolean;
  danmakuEnabled: boolean;
  danmakuOpacity: number;
  danmakuFontSize: number;
  danmakuDisplayArea: number;
}

export interface DanmakuApiEntry {
  id: string;
  name: string;
  url: string;
}

export const DEFAULT_PLAYER_SETTINGS: PlayerSettingsSnapshot = {
  autoNextEpisode: true,
  autoSkipIntro: false,
  skipIntroSeconds: 0,
  autoSkipOutro: false,
  skipOutroSeconds: 0,
  seekStepSeconds: 10,
  showModeIndicator: false,
  adFilterMode: "heuristic",
  adKeywords: [],
  fullscreenType: "auto",
  proxyMode: "retry",
  videoTogetherEnabled: false,
  danmakuEnabled: false,
  danmakuOpacity: 0.7,
  danmakuFontSize: 20,
  danmakuDisplayArea: 0.5,
};

export const PLAYER_SETTING_KEYS = Object.keys(DEFAULT_PLAYER_SETTINGS) as Array<keyof PlayerSettingsSnapshot>;

function choice<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number, round = false): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const bounded = Math.min(maximum, Math.max(minimum, value));
  return round ? Math.round(bounded) : bounded;
}

function numericChoice(value: unknown, allowed: readonly number[], fallback: number): number {
  return typeof value === "number" && allowed.includes(value) ? value : fallback;
}

export function normalizeAdKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string")
    .map((item) => item.trim()).filter(Boolean).map((item) => item.slice(0, 40)))].slice(0, 32);
}

export function playerSettingsFromFields(fields: ConfigPayload["fields"], serverAdKeywords: readonly string[] = [], prefix = ""): PlayerSettingsSnapshot {
  const field = (key: keyof PlayerSettingsSnapshot) => fields[`${prefix}${key}`]?.value;
  const defaults = DEFAULT_PLAYER_SETTINGS;
  return {
    autoNextEpisode: typeof field("autoNextEpisode") === "boolean" ? field("autoNextEpisode") as boolean : defaults.autoNextEpisode,
    autoSkipIntro: typeof field("autoSkipIntro") === "boolean" ? field("autoSkipIntro") as boolean : defaults.autoSkipIntro,
    skipIntroSeconds: boundedNumber(field("skipIntroSeconds"), defaults.skipIntroSeconds, 0, MAX_SKIP_SECONDS, true),
    autoSkipOutro: typeof field("autoSkipOutro") === "boolean" ? field("autoSkipOutro") as boolean : defaults.autoSkipOutro,
    skipOutroSeconds: boundedNumber(field("skipOutroSeconds"), defaults.skipOutroSeconds, 0, MAX_SKIP_SECONDS, true),
    seekStepSeconds: boundedNumber(field("seekStepSeconds"), defaults.seekStepSeconds, MIN_SEEK_STEP_SECONDS, MAX_SEEK_STEP_SECONDS, true),
    showModeIndicator: typeof field("showModeIndicator") === "boolean" ? field("showModeIndicator") as boolean : defaults.showModeIndicator,
    adFilterMode: choice(field("adFilterMode"), ["off", "keyword", "heuristic", "aggressive"], defaults.adFilterMode),
    adKeywords: normalizeAdKeywords([...serverAdKeywords, ...normalizeAdKeywords(field("adKeywords"))]),
    fullscreenType: choice(field("fullscreenType"), ["auto", "native", "window"], defaults.fullscreenType),
    proxyMode: choice(field("proxyMode"), ["retry", "none", "always"], defaults.proxyMode),
    videoTogetherEnabled: typeof field("videoTogetherEnabled") === "boolean" ? field("videoTogetherEnabled") as boolean : defaults.videoTogetherEnabled,
    danmakuEnabled: typeof field("danmakuEnabled") === "boolean" ? field("danmakuEnabled") as boolean : defaults.danmakuEnabled,
    danmakuOpacity: boundedNumber(field("danmakuOpacity"), defaults.danmakuOpacity, 0.1, 1),
    danmakuFontSize: numericChoice(field("danmakuFontSize"), [14, 18, 20, 24, 28], defaults.danmakuFontSize),
    danmakuDisplayArea: numericChoice(field("danmakuDisplayArea"), [0.25, 0.5, 0.75, 1], defaults.danmakuDisplayArea),
  };
}

export function legacyPlayerSettings(value: unknown): Partial<PlayerSettingsSnapshot> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const fields = Object.fromEntries(PLAYER_SETTING_KEYS.map((key) => [key, { value: (value as Record<string, unknown>)[key], updatedAt: 0 }]));
  const normalized = playerSettingsFromFields(fields, []);
  return Object.fromEntries(PLAYER_SETTING_KEYS.filter((key) => Object.hasOwn(value, key)).map((key) => [key, normalized[key]]));
}

const SENSITIVE_QUERY_KEYS = new Set(["token", "access_token", "api_key", "apikey", "key", "secret", "password", "pass", "auth", "authorization", "signature", "sig"]);

export function unsafeDanmakuUrlReason(raw: string): "required" | "invalid" | "credentials" | "secret" | null {
  const value = raw.trim();
  if (!value) return "required";
  if (value.length > 2048) return "invalid";
  try {
    const url = new URL(value);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.hostname) return "invalid";
    if (url.username || url.password) return "credentials";
    if ([...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEYS.has(key.toLowerCase()))) return "secret";
    return null;
  } catch { return "invalid"; }
}

export function normalizeDanmakuApis(value: unknown): DanmakuApiEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item): DanmakuApiEntry[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const name = typeof record.name === "string" ? record.name.trim().slice(0, 40) : "";
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !name || seen.has(id) || unsafeDanmakuUrlReason(url)) return [];
    seen.add(id);
    return [{ id, name, url }];
  }).slice(0, 10);
}
