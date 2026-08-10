"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface SearchHistoryItem {
  query: string;
  timestamp: number;
  resultCount?: number;
}

type SearchMode = "standard" | "premium";
const MAX_HISTORY_ITEMS = 20;
const STORAGE_PREFIX = "uxuv-search-history:v1";

function normalizeQuery(query: string): string {
  return query.trim().toLocaleLowerCase();
}

function sanitizeHistory(value: unknown): SearchHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): SearchHistoryItem[] => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<SearchHistoryItem>;
    if (typeof candidate.query !== "string" || !candidate.query.trim() || typeof candidate.timestamp !== "number") return [];
    return [{ query: candidate.query.trim(), timestamp: candidate.timestamp,
      ...(typeof candidate.resultCount === "number" ? { resultCount: candidate.resultCount } : {}) }];
  }).slice(0, MAX_HISTORY_ITEMS);
}

export function searchHistoryStorageKey(accountId: string, mode: SearchMode): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(accountId)}:${mode}`;
}

export function useSearchHistory({
  accountId,
  mode,
  onSelect,
}: {
  accountId: string;
  mode: SearchMode;
  onSelect: (query: string) => void;
}) {
  const storageKey = useMemo(() => searchHistoryStorageKey(accountId, mode), [accountId, mode]);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    let stored: SearchHistoryItem[] = [];
    try { stored = sanitizeHistory(JSON.parse(window.localStorage.getItem(storageKey) ?? "null")); } catch {}
    queueMicrotask(() => { if (active) setHistory(stored); });
    return () => { active = false; };
  }, [storageKey]);

  useEffect(() => () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
  }, []);

  const persist = useCallback((next: SearchHistoryItem[]) => {
    window.localStorage.setItem(storageKey, JSON.stringify(next));
    setHistory(next);
  }, [storageKey]);

  const addSearch = useCallback((query: string, resultCount?: number) => {
    const original = query.trim();
    if (!original) return;
    const normalized = normalizeQuery(original);
    const next = [{ query: original, timestamp: Date.now(), ...(resultCount === undefined ? {} : { resultCount }) },
      ...history.filter((item) => normalizeQuery(item.query) !== normalized)].slice(0, MAX_HISTORY_ITEMS);
    persist(next);
  }, [history, persist]);

  const removeSearch = useCallback((query: string) => {
    const normalized = normalizeQuery(query);
    persist(history.filter((item) => normalizeQuery(item.query) !== normalized));
    setHighlightedIndex(-1);
  }, [history, persist]);

  const clearAll = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    setHistory([]);
    setOpen(false);
    setHighlightedIndex(-1);
  }, [storageKey]);

  const show = useCallback(() => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    setOpen(true);
    setHighlightedIndex(-1);
  }, []);
  const hide = useCallback(() => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      setOpen(false);
      setHighlightedIndex(-1);
    }, 150);
  }, []);
  const select = useCallback((query: string) => {
    onSelect(query);
    setOpen(false);
    setHighlightedIndex(-1);
  }, [onSelect]);
  const navigate = useCallback((direction: "up" | "down") => {
    const recentLength = Math.min(history.length, 10);
    if (!open || recentLength === 0) return;
    setHighlightedIndex((current) => direction === "down"
      ? (current < recentLength - 1 ? current + 1 : 0)
      : (current > 0 ? current - 1 : recentLength - 1));
  }, [history.length, open]);

  return {
    history: history.slice(0, 10),
    open: open && history.length > 0,
    highlightedIndex,
    show,
    hide,
    addSearch,
    removeSearch,
    clearAll,
    select,
    navigate,
    resetHighlight: () => setHighlightedIndex(-1),
  };
}
