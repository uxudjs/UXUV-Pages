"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { SEARCH_SORT_OPTIONS, type SearchSortOption } from "@/lib/utils/search-result-policy";

interface SearchResultPreferences {
  sortBy: SearchSortOption;
  realtimeLatency: boolean;
  blockedCategories: string[];
}

const DEFAULTS: SearchResultPreferences = { sortBy: "default", realtimeLatency: false, blockedCategories: [] };
export const searchResultPreferencesStorageKey = (accountId: string, mode: "standard" | "premium") =>
  `uxuv-search-policy:v1:${encodeURIComponent(accountId)}:${mode}`;

function parsePreferences(raw: string): SearchResultPreferences {
  try {
    const parsed = JSON.parse(raw || "null") as Partial<SearchResultPreferences> | null;
    return {
      sortBy: parsed && SEARCH_SORT_OPTIONS.includes(parsed.sortBy as SearchSortOption) ? parsed.sortBy as SearchSortOption : "default",
      realtimeLatency: parsed?.realtimeLatency === true,
      blockedCategories: Array.isArray(parsed?.blockedCategories)
        ? [...new Set(parsed.blockedCategories.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 20)
        : [],
    };
  } catch {
    return DEFAULTS;
  }
}

export function useSearchResultPreferences(accountId: string, mode: "standard" | "premium") {
  const key = searchResultPreferencesStorageKey(accountId, mode);
  const subscribe = useCallback((listener: () => void) => {
    const onStorage = (event: StorageEvent) => { if (event.key === key) listener(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("uxuv-search-policy-change", listener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("uxuv-search-policy-change", listener);
    };
  }, [key]);
  const getSnapshot = useCallback(() => {
    try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
  }, [key]);
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => "");
  const preferences = useMemo(() => parsePreferences(raw), [raw]);
  const update = (next: SearchResultPreferences) => {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      window.dispatchEvent(new Event("uxuv-search-policy-change"));
    } catch { /* Storage is optional. */ }
  };
  return {
    ...preferences,
    setSortBy: (sortBy: SearchSortOption) => update({ ...preferences, sortBy }),
    setRealtimeLatency: (realtimeLatency: boolean) => update({ ...preferences, realtimeLatency }),
    addBlockedCategory: (value: string) => {
      const category = value.trim();
      if (!category || preferences.blockedCategories.includes(category) || preferences.blockedCategories.length >= 20) return;
      update({ ...preferences, blockedCategories: [...preferences.blockedCategories, category] });
    },
    removeBlockedCategory: (value: string) => update({
      ...preferences, blockedCategories: preferences.blockedCategories.filter((category) => category !== value),
    }),
  };
}
