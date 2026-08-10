"use client";

import { useCallback, useEffect, useState } from "react";
import type { VideoResolutionInfo } from "@/components/player/hooks/useVideoResolution";
import { probeResolutions } from "@/lib/content/probe-client";
import type { VideoSource } from "@/lib/content/types";
import type { GroupedSource } from "@/lib/media/grouped-sources-cache";
import { getCachedResolution, setCachedResolution, shouldReuseCachedResolution,
  type ResolutionCacheEntry } from "@/lib/player/resolution-cache";

export function useSourceResolutionProbe(sources: readonly GroupedSource[], configs: VideoSource[], episodeIndex: number) {
  const [resolutions, setResolutions] = useState<Record<string, ResolutionCacheEntry>>({});
  const sourceSignature = sources.map(({ source, id }) => `${source}:${id}`).join("|");
  const configSignature = configs.map(({ id, baseUrl, updatedAt }) => `${id}:${baseUrl}:${updatedAt}`).join("|");

  useEffect(() => {
    const controller = new AbortController();
    const cached: Record<string, ResolutionCacheEntry> = {};
    const configured = new Set(configs.map(({ id }) => id));
    const targets = sources.flatMap(({ source, id }) => {
      const entry = getCachedResolution(source, id);
      if (shouldReuseCachedResolution(entry, episodeIndex)) {
        cached[source] = entry!;
        return [];
      }
      return configured.has(source) ? [{ source, id, episodeIndex }] : [];
    });
    queueMicrotask(() => { if (!controller.signal.aborted) setResolutions(cached); });
    if (targets.length > 0) {
      void probeResolutions(targets, configs, controller.signal).then(({ resolutions: results }) => {
        if (controller.signal.aborted) return;
        const probed: Record<string, ResolutionCacheEntry> = {};
        for (const target of targets) {
          const resolution = results[`${target.source}:${target.id}`];
          if (!resolution) continue;
          const entry = { ...resolution, origin: "probed" as const, episodeIndex };
          setCachedResolution(target.source, target.id, entry);
          probed[target.source] = entry;
        }
        setResolutions((current) => ({ ...current, ...probed }));
      }).catch(() => undefined);
    }
    return () => controller.abort();
  // Signatures intentionally represent source/config contents without depending on array identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configSignature, episodeIndex, sourceSignature]);

  const recordPlayedResolution = useCallback((source: string, id: string | number, resolution: VideoResolutionInfo) => {
    const entry = { ...resolution, origin: "played" as const, episodeIndex };
    setCachedResolution(source, id, entry);
    setResolutions((current) => ({ ...current, [source]: entry }));
  }, [episodeIndex]);

  return { sourceResolutions: resolutions, recordPlayedResolution };
}
