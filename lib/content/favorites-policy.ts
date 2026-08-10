import type { FavoriteRecord } from "@/lib/content/types";
import { recordBelongsToMode } from "@/lib/content/library-isolation";

export const MAX_FAVORITES = 100;

export function favoritesForMode(records: FavoriteRecord[], mode: "standard" | "premium"): FavoriteRecord[] {
  return records.filter((favorite) => recordBelongsToMode(favorite.mode, mode));
}

export function canAddFavorite(records: FavoriteRecord[], mode: "standard" | "premium"): boolean {
  return favoritesForMode(records, mode).length < MAX_FAVORITES;
}
