"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchHomeMovies, type HomeContentType, type HomeMovie } from "@/lib/content/api-client";
import type { HistoryRecord } from "@/lib/content/types";

const CACHE_DURATION = 30 * 60 * 1000;
const PAGE_SIZE = 8;
const MAX_PAGES = 8;

interface RecommendationPage {
  movies: HomeMovie[];
  hasMore: boolean;
}

function interleave(groups: HomeMovie[][], excludedTitles: Set<string>, excludedIds: Set<string>): HomeMovie[] {
  const movies: HomeMovie[] = [];
  const titles = new Set(excludedTitles);
  const ids = new Set(excludedIds);
  const longest = Math.max(...groups.map(({ length }) => length), 0);
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) {
      const movie = group[index];
      if (!movie) continue;
      const title = movie.title.trim().toLocaleLowerCase();
      if (titles.has(title) || ids.has(movie.id)) continue;
      titles.add(title);
      ids.add(movie.id);
      movies.push(movie);
    }
  }
  return movies;
}

export function usePersonalizedRecommendations(contentType: HomeContentType, history: HistoryRecord[]) {
  const [movies, setMovies] = useState<HomeMovie[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<{ key: string; movies: HomeMovie[]; page: number; hasMore: boolean; timestamp: number } | null>(null);
  const watchedTitles = useMemo(
    () => new Set(history.map(({ title }) => title.trim().toLocaleLowerCase())),
    [history],
  );
  const recommendationTags = useMemo(() => history
    .map(({ title }) => title.trim())
    .filter((title, index, titles) => title && titles.indexOf(title) === index)
    .slice(0, 4), [history]);
  const cacheKey = `${contentType}:${recommendationTags.join("|")}`;

  const fetchPage = useCallback(async (
    pageNumber: number,
    signal: AbortSignal,
    existing: HomeMovie[] = [],
  ): Promise<RecommendationPage> => {
    const groups = await Promise.all(recommendationTags.map((tag) => fetchHomeMovies({
      type: contentType,
      tag,
      pageStart: pageNumber * PAGE_SIZE,
      pageLimit: PAGE_SIZE,
    }, signal)));
    const excludedIds = new Set(existing.map(({ id }) => id));
    const excluded = new Set([...watchedTitles, ...existing.map(({ title }) => title.trim().toLocaleLowerCase())]);
    return {
      movies: interleave(groups, excluded, excludedIds),
      hasMore: groups.some(({ length }) => length === PAGE_SIZE),
    };
  }, [contentType, recommendationTags, watchedTitles]);

  useEffect(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (history.length < 2 || recommendationTags.length < 2) {
      queueMicrotask(() => {
        if (controller.signal.aborted) return;
        setMovies([]);
        setLoading(false);
        setHasMore(false);
        setPage(0);
      });
      return () => controller.abort();
    }

    const cached = cacheRef.current;
    if (cached?.key === cacheKey && Date.now() - cached.timestamp < CACHE_DURATION) {
      queueMicrotask(() => {
        if (controller.signal.aborted) return;
        setMovies(cached.movies);
        setPage(cached.page);
        setHasMore(cached.hasMore);
        setLoading(false);
      });
      return () => controller.abort();
    }

    const load = async () => {
      setLoading(true);
      try {
        const result = await fetchPage(0, controller.signal);
        if (controller.signal.aborted) return;
        setMovies(result.movies);
        setPage(0);
        setHasMore(result.hasMore && result.movies.length > 0);
        cacheRef.current = { key: cacheKey, movies: result.movies, page: 0,
          hasMore: result.hasMore && result.movies.length > 0, timestamp: Date.now() };
      } catch (error) {
        if (!(error instanceof Error && error.name === "AbortError") && !controller.signal.aborted) {
          setMovies([]);
          setHasMore(false);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [cacheKey, fetchPage, history.length, recommendationTags.length]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || page + 1 >= MAX_PAGES) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    try {
      const nextPage = page + 1;
      const result = await fetchPage(nextPage, controller.signal, movies);
      if (controller.signal.aborted) return;
      const nextMovies = [...movies, ...result.movies];
      const nextHasMore = result.hasMore && result.movies.length > 0;
      setMovies(nextMovies);
      setPage(nextPage);
      setHasMore(nextHasMore);
      cacheRef.current = { key: cacheKey, movies: nextMovies, page: nextPage, hasMore: nextHasMore, timestamp: Date.now() };
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError") && !controller.signal.aborted) setHasMore(false);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [cacheKey, fetchPage, hasMore, loading, movies, page]);

  return { movies, loading, hasMore, hasHistory: history.length >= 2, loadMore };
}
