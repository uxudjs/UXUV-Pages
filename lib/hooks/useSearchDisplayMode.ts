"use client";

import { useCallback, useSyncExternalStore } from "react";

export type SearchDisplayMode = "normal" | "grouped";

export function searchDisplayModeKey(accountId: string, mode: "standard" | "premium"): string {
  return `uxuv-search-display:v1:${encodeURIComponent(accountId)}:${mode}`;
}

export function useSearchDisplayModePreference(accountId: string, mode: "standard" | "premium") {
  const key = searchDisplayModeKey(accountId, mode);
  const subscribe = useCallback((listener: () => void) => {
    const onStorage = (event: StorageEvent) => { if (event.key === key) listener(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("uxuv-search-display-mode-change", listener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("uxuv-search-display-mode-change", listener);
    };
  }, [key]);
  const getSnapshot = useCallback(() => {
    try {
      const value = localStorage.getItem(key);
      return value === "grouped" ? "grouped" : "normal";
    }
    catch { return "normal"; }
  }, [key]);
  const displayMode = useSyncExternalStore(subscribe, getSnapshot, () => "normal") as SearchDisplayMode;
  return {
    displayMode,
    setDisplayMode: (next: SearchDisplayMode) => {
      try {
        localStorage.setItem(key, next);
        window.dispatchEvent(new Event("uxuv-search-display-mode-change"));
      } catch { /* Storage is optional. */ }
    },
  };
}

export function useSearchDisplayMode(accountId: string, mode: "standard" | "premium"): SearchDisplayMode {
  return useSearchDisplayModePreference(accountId, mode).displayMode;
}
