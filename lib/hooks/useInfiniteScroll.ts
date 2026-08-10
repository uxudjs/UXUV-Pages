"use client";

import { useEffect, useRef } from "react";

interface InfiniteScrollOptions {
  enabled: boolean;
  onLoadMore: () => void | Promise<void>;
}

export function useInfiniteScroll({ enabled, onLoadMore }: InfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!enabled || !sentinel) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void onLoadMore();
    }, { rootMargin: "300px 0px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, onLoadMore]);

  return sentinelRef;
}
