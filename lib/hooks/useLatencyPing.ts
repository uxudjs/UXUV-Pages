"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoSource } from "@/lib/content/types";

export function useLatencyPing(sources: VideoSource[], enabled: boolean, intervalMs = 30_000) {
  const [latencies, setLatencies] = useState<Record<string, number>>({});
  const [isPinging, setIsPinging] = useState(false);
  const active = useRef<AbortController | null>(null);
  const targets = sources.map(({ id, baseUrl }) => ({ id, baseUrl }));
  const signature = targets.map(({ id, baseUrl }) => `${id}:${baseUrl}`).join("|");

  const refresh = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setIsPinging(true);
    try {
      const settled = await Promise.all(targets.map(async ({ id, baseUrl }) => {
        try {
          const response = await fetch("/api/ping", {
            method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: baseUrl }), signal: controller.signal,
          });
          const body = response.ok ? await response.json() as { success?: boolean; latency?: number } : null;
          return body?.success && typeof body.latency === "number" ? [id, body.latency] as const : null;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") throw error;
          return null;
        }
      }));
      if (!controller.signal.aborted) setLatencies((current) => ({
        ...current, ...Object.fromEntries(settled.filter((entry): entry is readonly [string, number] => entry !== null)),
      }));
    } finally {
      if (!controller.signal.aborted) setIsPinging(false);
    }
  // The signature intentionally represents the target list without depending on array identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    if (!enabled || targets.length === 0) {
      active.current?.abort();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    const poll = async () => {
      await refresh().catch(() => undefined);
      if (!cancelled) timer = setTimeout(poll, intervalMs);
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); active.current?.abort(); };
  // The signature intentionally represents the target list without depending on array identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, refresh, signature]);

  return { latencies, isPinging: enabled && isPinging, refresh };
}
