"use client";

import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HomeContentType } from "@/lib/content/api-client";

type HomeMode = "standard" | "premium";

interface UseTagManagerOptions {
  accountId: string;
  mode: HomeMode;
  contentType: HomeContentType;
  defaultTags: string[];
}

const STORAGE_PREFIX = "uxuv-home-tags:v1";
const POPULAR_TAG = "热门";

function sanitizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0 && tag.length <= 80)
    .filter((tag, index, tags) => tags.indexOf(tag) === index)
    .slice(0, 30);
}

function ensurePopularTag(tags: string[]): string[] {
  return tags.includes(POPULAR_TAG) ? tags : [POPULAR_TAG, ...tags].slice(0, 30);
}

export function homeTagsStorageKey(accountId: string, mode: HomeMode, contentType: HomeContentType): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(accountId)}:${mode}:${contentType}`;
}

export function useTagManager({ accountId, mode, contentType, defaultTags }: UseTagManagerOptions) {
  const safeDefaults = useMemo(() => ensurePopularTag(sanitizeTags(defaultTags)), [defaultTags]);
  const storageKey = useMemo(
    () => homeTagsStorageKey(accountId, mode, contentType),
    [accountId, contentType, mode],
  );
  const [tags, setTags] = useState<string[]>(safeDefaults);

  useEffect(() => {
    let active = true;
    let nextTags = safeDefaults;
    try {
      const stored = sanitizeTags(JSON.parse(window.localStorage.getItem(storageKey) ?? "null"));
      nextTags = stored.length > 0 ? ensurePopularTag(stored) : safeDefaults;
    } catch {}
    queueMicrotask(() => { if (active) setTags(nextTags); });
    return () => { active = false; };
  }, [safeDefaults, storageKey]);

  const persist = useCallback((nextTags: string[]) => {
    window.localStorage.setItem(storageKey, JSON.stringify(nextTags));
    setTags(nextTags);
  }, [storageKey]);

  const addTag = useCallback((value: string) => {
    const tag = value.trim();
    if (!tag || tag.length > 80 || tags.includes(tag) || tags.length >= 30) return;
    persist([...tags, tag]);
  }, [persist, tags]);

  const removeTag = useCallback((tag: string) => {
    if (tag === POPULAR_TAG || tags.length <= 1) return;
    persist(tags.filter((candidate) => candidate !== tag));
  }, [persist, tags]);

  const restoreDefaultTags = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    setTags(safeDefaults);
  }, [safeDefaults, storageKey]);

  const moveTag = useCallback((activeTag: string, overTag: string) => {
    const from = tags.indexOf(activeTag);
    const to = tags.indexOf(overTag);
    if (from < 0 || to < 0 || from === to) return;
    persist(arrayMove(tags, from, to));
  }, [persist, tags]);

  return { tags, addTag, removeTag, restoreDefaultTags, moveTag };
}
