"use client";

import { useEffect, useMemo, useState } from "react";
import { useSync } from "@/components/SyncProvider";
import { normalizeDanmakuApis } from "@/lib/player/player-settings";
import { fuzzyMatchTitle, matchEpisode, parseDanmakuResponse, parseSearchResults,
  type DanmakuComment } from "@/lib/player/danmaku-utils";
import type { ConfigPayload } from "@/lib/sync/document-types";

export type DanmakuStatus = "idle" | "loading" | "ready" | "empty" | "error";

interface UseDanmakuOptions {
  enabled: boolean;
  mode: "standard" | "premium";
  videoTitle?: string;
  episodeName?: string;
  episodeIndex?: number;
}

interface DanmakuState {
  status: DanmakuStatus;
  comments: DanmakuComment[];
}

const EMPTY_STATE: DanmakuState = { status: "idle", comments: [] };

async function requestDanmaku(action: "search" | "comments", apiUrl: string,
  parameters: Record<string, string>, signal: AbortSignal): Promise<unknown> {
  const query = new URLSearchParams({ action, apiUrl, ...parameters });
  const response = await fetch(`/api/danmaku?${query}`, { credentials: "same-origin", signal });
  if (!response.ok) throw new Error("DANMAKU_UPSTREAM_FAILED");
  return response.json();
}

export function useDanmaku({ enabled, mode, videoTitle, episodeName, episodeIndex }: UseDanmakuOptions): DanmakuState {
  const sync = useSync();
  const fields = (sync.documents.config.payload as ConfigPayload).fields;
  const prefix = mode === "premium" ? "premium." : "";
  const apis = useMemo(() => normalizeDanmakuApis(fields[`${prefix}danmakuApis`]?.value),
    [fields, prefix]);
  const activeValue = fields[`${prefix}activeDanmakuApiId`]?.value;
  const activeApi = typeof activeValue === "string" ? apis.find(({ id }) => id === activeValue) : undefined;
  const apiUrl = activeApi?.url ?? "";
  const available = enabled && Boolean(apiUrl && videoTitle && episodeName);
  const [state, setState] = useState<DanmakuState>(EMPTY_STATE);

  useEffect(() => {
    if (!available || !videoTitle || !episodeName) {
      queueMicrotask(() => setState(EMPTY_STATE));
      return;
    }
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setState({ status: "loading", comments: [] });
    });
    const load = async () => {
      const searchBody = await requestDanmaku("search", apiUrl, { keyword: videoTitle }, controller.signal);
      const match = fuzzyMatchTitle(parseSearchResults(searchBody), videoTitle);
      const episode = match ? matchEpisode(match.episodes, episodeName, episodeIndex) : null;
      if (!episode) {
        setState({ status: "empty", comments: [] });
        return;
      }
      const commentsBody = await requestDanmaku("comments", apiUrl, { episodeId: episode.episodeId }, controller.signal);
      const comments = parseDanmakuResponse(commentsBody);
      setState({ status: comments.length ? "ready" : "empty", comments });
    };
    void load().catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") return;
      setState({ status: "error", comments: [] });
    });
    return () => controller.abort();
  }, [apiUrl, available, episodeIndex, episodeName, videoTitle]);

  return state;
}
