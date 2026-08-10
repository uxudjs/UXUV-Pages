import type { HistoryRecord, Video } from "./types";

export function premiumRecommendationTerms(history: readonly Pick<HistoryRecord, "mode" | "title" | "updatedAt">[], limit = 6): string[] {
  const seen = new Set<string>();
  return [...history].filter(({ mode }) => mode === "premium").sort((left, right) => right.updatedAt - left.updatedAt)
    .flatMap(({ title }) => {
      const value = title.trim().slice(0, 120);
      const key = value.toLocaleLowerCase();
      if (!value || seen.has(key)) return [];
      seen.add(key);
      return [value];
    }).slice(0, limit);
}

export function appendPremiumVideos(existing: readonly Video[], incoming: readonly Video[]): Video[] {
  const seen = new Set(existing.map(({ source, vod_id }) => `${source}:${vod_id}`));
  return [...existing, ...incoming.filter(({ source, vod_id }) => {
    const id = `${source}:${vod_id}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  })];
}
