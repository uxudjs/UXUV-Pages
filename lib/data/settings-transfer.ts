import type { ConfigPayload, LibraryPayload, SyncPayload, TimestampedRecord } from "@/lib/sync/document-types";
import { SEARCH_SORT_OPTIONS, type SearchSortOption } from "@/lib/utils/search-result-policy";

export const MAX_SETTINGS_IMPORT_BYTES = 1024 * 1024;
const RECORD_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const BLOCKED_KEYS = new Set([
  "password", "passwd", "token", "accesstoken", "refreshtoken", "secret", "clientsecret",
  "authorization", "auth", "cookie", "setcookie", "apikey", "privatekey", "credential", "credentials",
  "headers", "session", "sessionid", "__proto__", "prototype", "constructor",
]);

export interface StandardPreferences {
  searchDisplayMode?: "normal" | "grouped";
  searchPolicy?: { sortBy: SearchSortOption; realtimeLatency: boolean; blockedCategories: string[] };
  searchHistory?: Array<{ query: string; timestamp: number; resultCount?: number }>;
  homeTags?: { movie?: string[]; tv?: string[] };
}

export interface StandardSettingsExport {
  schemaVersion: 1;
  product: "UXUVideo";
  mode: "standard";
  exportedAt: string;
  included: { searchHistory: boolean; watchHistory: boolean };
  config: ConfigPayload;
  library: LibraryPayload;
  preferences: StandardPreferences;
}

export interface AllSettingsExport {
  schemaVersion: 2;
  product: "UXUVideo";
  mode: "all";
  exportedAt: string;
  included: { searchHistory: boolean; watchHistory: boolean };
  config: ConfigPayload;
  library: LibraryPayload;
  preferences: { standard: StandardPreferences; premium: StandardPreferences };
}

export type SettingsExportEnvelope = StandardSettingsExport | AllSettingsExport;

export interface SettingsImportPreview {
  envelope: SettingsExportEnvelope;
  summary: { fields: number; sources: number; subscriptions: number; history: number; favorites: number; preferences: number };
}

export class SettingsTransferError extends Error {
  constructor(readonly code: "empty" | "size" | "json" | "schema" | "premium" | "sensitive" | "invalid") {
    super(code);
    this.name = "SettingsTransferError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function unsafeUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return !!url.username || !!url.password || [...url.searchParams.keys()].some((key) => BLOCKED_KEYS.has(normalizedKey(key)));
  } catch { return false; }
}

export function sensitiveDataPath(value: unknown, path = "$", depth = 0): string | null {
  if (depth > 16) return path;
  if (typeof value === "string") {
    return /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value) || unsafeUrl(value) ? path : null;
  }
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = sensitiveDataPath(value[index], `${path}[${index}]`, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (BLOCKED_KEYS.has(normalizedKey(key))) return `${path}.${key}`;
    const found = sensitiveDataPath(child, `${path}.${key}`, depth + 1);
    if (found) return found;
  }
  return null;
}

function validTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function validRecords(value: unknown, maximum: number): value is TimestampedRecord[] {
  return Array.isArray(value) && value.length <= maximum && value.every((item) => isRecord(item)
    && typeof item.id === "string" && RECORD_ID.test(item.id) && validTimestamp(item.updatedAt));
}

function validTombstones(value: unknown, collections: readonly string[]): boolean {
  return Array.isArray(value) && value.length <= 400 && value.every((item) => isRecord(item)
    && typeof item.id === "string" && RECORD_ID.test(item.id)
    && typeof item.collection === "string" && collections.includes(item.collection)
    && validTimestamp(item.deletedAt));
}

function configPayload(value: unknown, allowPremium = false): ConfigPayload {
  if (!isRecord(value) || !isRecord(value.fields) || Object.keys(value.fields).length > 128
    || Object.keys(value.fields).some((key) => !/^[A-Za-z0-9_.-]{1,128}$/.test(key) || ["__proto__", "prototype", "constructor"].includes(key))
    || Object.values(value.fields).some((field) => !isRecord(field) || !Object.hasOwn(field, "value") || !validTimestamp(field.updatedAt))
    || !validRecords(value.sources, 200) || !validRecords(value.subscriptions, 50)
    || !validTombstones(value.tombstones, ["sources", "subscriptions"])) throw new SettingsTransferError("invalid");
  if (!allowPremium && value.sources.some((source) => source.group === "premium")) throw new SettingsTransferError("premium");
  return value as unknown as ConfigPayload;
}

function libraryPayload(value: unknown): LibraryPayload {
  if (!isRecord(value) || !validRecords(value.history, 200) || !validRecords(value.favorites, 200)
    || !validTombstones(value.tombstones, ["history", "favorites"])) throw new SettingsTransferError("invalid");
  return value as unknown as LibraryPayload;
}

function tags(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 30 || value.some((item) => typeof item !== "string" || !item.trim() || item.length > 80)) {
    throw new SettingsTransferError("invalid");
  }
  return [...new Set(value.map((item) => item.trim()))];
}

function preferences(value: unknown): StandardPreferences {
  if (!isRecord(value) || Object.keys(value).some((key) => !["searchDisplayMode", "searchPolicy", "searchHistory", "homeTags"].includes(key))) {
    throw new SettingsTransferError("invalid");
  }
  const result: StandardPreferences = {};
  if (value.searchDisplayMode !== undefined) {
    if (value.searchDisplayMode !== "normal" && value.searchDisplayMode !== "grouped") throw new SettingsTransferError("invalid");
    result.searchDisplayMode = value.searchDisplayMode;
  }
  if (value.searchPolicy !== undefined) {
    if (!isRecord(value.searchPolicy) || !SEARCH_SORT_OPTIONS.includes(value.searchPolicy.sortBy as SearchSortOption)
      || typeof value.searchPolicy.realtimeLatency !== "boolean" || !Array.isArray(value.searchPolicy.blockedCategories)
      || value.searchPolicy.blockedCategories.length > 20 || value.searchPolicy.blockedCategories.some((item) => typeof item !== "string" || item.length > 40)) {
      throw new SettingsTransferError("invalid");
    }
    result.searchPolicy = { sortBy: value.searchPolicy.sortBy as SearchSortOption, realtimeLatency: value.searchPolicy.realtimeLatency,
      blockedCategories: [...new Set(value.searchPolicy.blockedCategories.map((item) => String(item).trim()).filter(Boolean))] };
  }
  if (value.searchHistory !== undefined) {
    if (!Array.isArray(value.searchHistory) || value.searchHistory.length > 20 || value.searchHistory.some((item) => !isRecord(item)
      || typeof item.query !== "string" || !item.query.trim() || item.query.length > 200 || !validTimestamp(item.timestamp)
      || (item.resultCount !== undefined && (typeof item.resultCount !== "number" || !Number.isSafeInteger(item.resultCount) || item.resultCount < 0)))) throw new SettingsTransferError("invalid");
    result.searchHistory = value.searchHistory as StandardPreferences["searchHistory"];
  }
  if (value.homeTags !== undefined) {
    if (!isRecord(value.homeTags) || Object.keys(value.homeTags).some((key) => key !== "movie" && key !== "tv")) throw new SettingsTransferError("invalid");
    result.homeTags = { movie: tags(value.homeTags.movie), tv: tags(value.homeTags.tv) };
  }
  return result;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function buildSettingsExport(input: {
  config: ConfigPayload; library: LibraryPayload; preferences: StandardPreferences; exportedAt?: string;
  includeSearchHistory?: boolean; includeWatchHistory?: boolean;
}): StandardSettingsExport {
  const config = {
    ...input.config,
    fields: Object.fromEntries(Object.entries(input.config.fields).filter(([key]) => !key.startsWith("premium."))),
    sources: input.config.sources.filter((source) => source.group !== "premium"),
    subscriptions: input.config.subscriptions.filter((subscription) => subscription.mode !== "premium"),
    tombstones: [],
  };
  const library = {
    ...input.library,
    history: input.library.history.filter((record) => record.mode !== "premium"),
    favorites: input.library.favorites.filter((record) => record.mode !== "premium"),
    tombstones: [],
  };
  const envelope: StandardSettingsExport = {
    schemaVersion: 1, product: "UXUVideo", mode: "standard", exportedAt: input.exportedAt ?? new Date().toISOString(),
    included: { searchHistory: input.includeSearchHistory !== false, watchHistory: input.includeWatchHistory !== false },
    config: configPayload(clone(config)),
    library: libraryPayload(clone({ ...library, history: input.includeWatchHistory === false ? [] : library.history })),
    preferences: preferences(clone({ ...input.preferences, ...(input.includeSearchHistory === false ? { searchHistory: undefined } : {}) })),
  };
  if (sensitiveDataPath(envelope)) throw new SettingsTransferError("sensitive");
  return envelope;
}

export function buildAllSettingsExport(input: {
  config: ConfigPayload; library: LibraryPayload;
  preferences: { standard: StandardPreferences; premium: StandardPreferences };
  exportedAt?: string; includeSearchHistory?: boolean; includeWatchHistory?: boolean;
}): AllSettingsExport {
  const includeSearchHistory = input.includeSearchHistory !== false;
  const envelope: AllSettingsExport = {
    schemaVersion: 2, product: "UXUVideo", mode: "all", exportedAt: input.exportedAt ?? new Date().toISOString(),
    included: { searchHistory: includeSearchHistory, watchHistory: input.includeWatchHistory !== false },
    config: configPayload(clone(input.config), true),
    library: libraryPayload(clone({ ...input.library, history: input.includeWatchHistory === false ? [] : input.library.history })),
    preferences: {
      standard: preferences(clone({ ...input.preferences.standard, ...(includeSearchHistory ? {} : { searchHistory: undefined }) })),
      premium: preferences(clone({ ...input.preferences.premium, ...(includeSearchHistory ? {} : { searchHistory: undefined }) })),
    },
  };
  if (sensitiveDataPath(envelope)) throw new SettingsTransferError("sensitive");
  return envelope;
}

export function serializeSettingsExport(envelope: SettingsExportEnvelope): string {
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

export function previewSettingsImport(text: string): SettingsImportPreview {
  if (!text.trim()) throw new SettingsTransferError("empty");
  if (new TextEncoder().encode(text).byteLength > MAX_SETTINGS_IMPORT_BYTES) throw new SettingsTransferError("size");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new SettingsTransferError("json"); }
  if (sensitiveDataPath(value)) throw new SettingsTransferError("sensitive");
  if (!isRecord(value) || value.product !== "UXUVideo") throw new SettingsTransferError("schema");
  const standard = value.schemaVersion === 1 && value.mode === "standard";
  const all = value.schemaVersion === 2 && value.mode === "all";
  if (!standard && !all) throw new SettingsTransferError(value.mode === "premium" ? "premium" : "schema");
  if (typeof value.exportedAt !== "string" || Number.isNaN(Date.parse(value.exportedAt))) throw new SettingsTransferError("invalid");
  if (!isRecord(value.included) || typeof value.included.searchHistory !== "boolean" || typeof value.included.watchHistory !== "boolean"
    || Object.keys(value.included).some((key) => key !== "searchHistory" && key !== "watchHistory")) throw new SettingsTransferError("invalid");
  let envelope: SettingsExportEnvelope;
  if (standard) envelope = {
    schemaVersion: 1, product: "UXUVideo", mode: "standard", exportedAt: value.exportedAt,
    included: { searchHistory: value.included.searchHistory, watchHistory: value.included.watchHistory },
    config: configPayload(value.config), library: libraryPayload(value.library), preferences: preferences(value.preferences),
  };
  else {
    if (!isRecord(value.preferences) || Object.keys(value.preferences).some((key) => key !== "standard" && key !== "premium")) {
      throw new SettingsTransferError("invalid");
    }
    envelope = {
      schemaVersion: 2, product: "UXUVideo", mode: "all", exportedAt: value.exportedAt,
      included: { searchHistory: value.included.searchHistory, watchHistory: value.included.watchHistory },
      config: configPayload(value.config, true), library: libraryPayload(value.library),
      preferences: { standard: preferences(value.preferences.standard), premium: preferences(value.preferences.premium) },
    };
  }
  const preferenceCount = envelope.mode === "all"
    ? Object.keys(envelope.preferences.standard).length + Object.keys(envelope.preferences.premium).length
    : Object.keys(envelope.preferences).length;
  return { envelope, summary: { fields: Object.keys(envelope.config.fields).length, sources: envelope.config.sources.length,
    subscriptions: envelope.config.subscriptions.length, history: envelope.library.history.length, favorites: envelope.library.favorites.length,
    preferences: preferenceCount } };
}

export function prepareImportedPayloads(preview: SettingsImportPreview,
  current: { config: ConfigPayload; library: LibraryPayload }, now = Date.now()): { config: ConfigPayload; library: LibraryPayload } {
  const stampRecords = (records: TimestampedRecord[]) => records.map((record) => ({ ...record, updatedAt: now }));
  const stamp = (payload: SyncPayload): SyncPayload => "sources" in payload ? {
    ...payload, fields: Object.fromEntries(Object.entries(payload.fields).map(([key, field]) => [key, { ...field, updatedAt: now }])),
    sources: stampRecords(payload.sources), subscriptions: stampRecords(payload.subscriptions),
    tombstones: payload.tombstones.map((item) => ({ ...item, deletedAt: now })),
  } : { ...payload, history: stampRecords(payload.history), favorites: stampRecords(payload.favorites),
    tombstones: payload.tombstones.map((item) => ({ ...item, deletedAt: now })) };
  let config = preview.envelope.config;
  let library = preview.envelope.included.watchHistory ? preview.envelope.library : {
    ...preview.envelope.library, history: current.library.history,
  };
  if (preview.envelope.mode === "standard") {
    const preservePremiumRecord = (record: TimestampedRecord) => record.mode === "premium" || record.id.startsWith("premium:");
    const sources = [...current.config.sources.filter((source) => source.group === "premium"), ...config.sources];
    const subscriptions = [...current.config.subscriptions.filter((subscription) => subscription.mode === "premium"), ...config.subscriptions];
    config = {
      ...config,
      fields: { ...Object.fromEntries(Object.entries(current.config.fields).filter(([key]) => key.startsWith("premium."))), ...config.fields },
      sources,
      subscriptions,
      tombstones: current.config.tombstones.filter((item) => item.collection === "sources"
        ? !sources.some((record) => record.id === item.id)
        : !subscriptions.some((record) => record.id === item.id)),
    };
    const history = [...current.library.history.filter(preservePremiumRecord), ...(preview.envelope.included.watchHistory ? library.history : current.library.history.filter((record) => !preservePremiumRecord(record)))];
    const favorites = [...current.library.favorites.filter(preservePremiumRecord), ...library.favorites];
    library = {
      ...library,
      history,
      favorites,
      tombstones: current.library.tombstones.filter((item) => item.collection === "history"
        ? !history.some((record) => record.id === item.id)
        : !favorites.some((record) => record.id === item.id)),
    };
  }
  return { config: stamp(config) as ConfigPayload, library: stamp(library) as LibraryPayload };
}
