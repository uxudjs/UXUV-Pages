import type { SourceSubscription, VideoSource } from "@/lib/content/types";

export const SOURCE_ID = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
export const DEFAULT_SOURCE_PATH = "/api.php/provide/vod/";

export type SourceDraftError = "required" | "id" | "duplicate" | "url";
export interface SourceDraft { name: string; id: string; baseUrl: string }

export function sourceIdFromName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

export function normalizeSourceDraft(
  draft: SourceDraft,
  existingIds: readonly string[],
  initial?: VideoSource | null,
  now = Date.now(),
  group: "normal" | "premium" = "normal",
): { source: VideoSource } | { error: SourceDraftError } {
  const name = draft.name.trim().slice(0, 160);
  const id = draft.id.trim().toLowerCase();
  if (!name || !id || !draft.baseUrl.trim()) return { error: "required" };
  if (!SOURCE_ID.test(id)) return { error: "id" };
  if (id !== initial?.id && existingIds.includes(id)) return { error: "duplicate" };
  let url: URL;
  try { url = new URL(draft.baseUrl.trim()); } catch { return { error: "url" }; }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.href.length > 2_048) return { error: "url" };
  return { source: {
    ...initial,
    id,
    updatedAt: now,
    name,
    baseUrl: url.href.replace(/\/$/, ""),
    searchPath: initial?.searchPath || DEFAULT_SOURCE_PATH,
    detailPath: initial?.detailPath || DEFAULT_SOURCE_PATH,
    enabled: initial?.enabled !== false,
    group,
    kind: initial?.kind ?? "standalone",
    priority: initial?.priority ?? existingIds.length + 1,
  } };
}

export function orderedSources(sources: readonly VideoSource[]): VideoSource[] {
  return sources.map((source, originalIndex) => ({ source, originalIndex }))
    .sort((left, right) => (left.source.priority ?? Number.MAX_SAFE_INTEGER) - (right.source.priority ?? Number.MAX_SAFE_INTEGER)
      || left.originalIndex - right.originalIndex)
    .map(({ source }) => source);
}

function belongsToMode(source: VideoSource, mode: "standard" | "premium"): boolean {
  return mode === "premium" ? source.group === "premium" : source.group !== "premium";
}

export function subscriptionOwnedSourceIds(
  sources: readonly VideoSource[],
  subscription: SourceSubscription,
  mode: "standard" | "premium",
): string[] {
  return sources.filter((source) => source.kind === "subscription"
    && source.subscriptionId === subscription.id
    && belongsToMode(source, mode)).map(({ id }) => id).sort();
}

export function prepareSubscriptionResync(
  existingSources: readonly VideoSource[],
  currentSubscription: SourceSubscription,
  importedSources: readonly VideoSource[],
  mode: "standard" | "premium",
  now = Date.now(),
): { sources: VideoSource[]; subscription: SourceSubscription; removeIds: string[] }
  | { error: "conflict"; conflictingIds: string[] } {
  const group = mode === "premium" ? "premium" : "normal";
  const ownedIds = new Set(subscriptionOwnedSourceIds(existingSources, currentSubscription, mode));
  const existingById = new Map(existingSources.map((source) => [source.id, source]));
  const conflictingIds = [...new Set(importedSources
    .filter((source) => existingById.has(source.id) && !ownedIds.has(source.id))
    .map(({ id }) => id))].sort();
  if (conflictingIds.length > 0) return { error: "conflict", conflictingIds };
  const sources = importedSources.map<VideoSource>((source) => ({
    ...source,
    updatedAt: now,
    group,
    kind: "subscription" as const,
    subscriptionId: currentSubscription.id,
  }));
  const nextIds = new Set(sources.map(({ id }) => id));
  const removeIds = existingSources
    .filter((source) => ownedIds.has(source.id) && !nextIds.has(source.id))
    .map(({ id }) => id);
  return {
    sources,
    subscription: {
      ...currentSubscription,
      updatedAt: now,
      lastUpdated: now,
      lastError: undefined,
      sourceIds: sources.map(({ id }) => id),
      mode,
    },
    removeIds,
  };
}

export function reorderSources(sources: readonly VideoSource[], activeId: string, overId: string): VideoSource[] {
  const ordered = orderedSources(sources);
  const from = ordered.findIndex(({ id }) => id === activeId);
  const to = ordered.findIndex(({ id }) => id === overId);
  if (from < 0 || to < 0 || from === to) return ordered;
  const [active] = ordered.splice(from, 1);
  ordered.splice(to, 0, active);
  return ordered.map((source, index) => ({ ...source, priority: index + 1 }));
}

export function moveSource(sources: readonly VideoSource[], id: string, direction: -1 | 1): VideoSource[] {
  const ordered = orderedSources(sources);
  const from = ordered.findIndex((source) => source.id === id);
  const to = from + direction;
  return from < 0 || to < 0 || to >= ordered.length ? ordered : reorderSources(ordered, id, ordered[to].id);
}
