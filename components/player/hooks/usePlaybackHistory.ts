import { useCallback, useEffect, useMemo, useRef } from "react";
import { libraryRecordId } from "@/lib/content/library-isolation";
import type { HistoryRecord } from "@/lib/content/types";

export const HISTORY_LOCAL_WRITE_MS = 5_000;
export const HISTORY_REMOTE_SYNC_DELAY_MS = 60_000;

export interface PlaybackProgress {
  currentTime: number;
  duration: number;
}

interface UsePlaybackHistoryProps {
  records: readonly HistoryRecord[];
  videoId?: string | number;
  title?: string;
  source?: string;
  poster?: string;
  episodeIndex: number;
  mode: "standard" | "premium";
  requestedTime?: number;
  upsert: (record: HistoryRecord, syncDelay: number) => void;
}

export function normalizePlaybackTitle(title: string): string {
  return title.trim().toLocaleLowerCase();
}

export function findPlaybackHistory(records: readonly HistoryRecord[], title: string, mode: "standard" | "premium") {
  const normalized = normalizePlaybackTitle(title);
  return records.find((record) => normalizePlaybackTitle(record.title) === normalized
    && (mode === "premium" ? record.mode === "premium" : record.mode !== "premium"));
}

export function usePlaybackHistory({ records, videoId, title = "", source = "", poster, episodeIndex, mode,
  requestedTime, upsert }: UsePlaybackHistoryProps) {
  const latest = useRef<PlaybackProgress>({ currentTime: 0, duration: 0 });
  const lastWriteAt = useRef(0);
  const historyKey = `${mode}:${normalizePlaybackTitle(title)}:${episodeIndex}`;
  const existing = useMemo(() => findPlaybackHistory(records, title, mode), [mode, records, title]);
  const initialTime = requestedTime && requestedTime > 0
    ? requestedTime
    : existing?.episodeIndex === episodeIndex && existing.playbackPosition && existing.playbackPosition > 0
      ? existing.playbackPosition : 0;

  useEffect(() => {
    latest.current = { currentTime: 0, duration: 0 };
    lastWriteAt.current = 0;
  }, [historyKey]);

  const persist = useCallback((progress: PlaybackProgress, force = false) => {
    if (!videoId || !title || !source || progress.currentTime <= 1 || progress.duration <= 0) return;
    const now = Date.now();
    if (force ? now - lastWriteAt.current < 1_000 : now - lastWriteAt.current < HISTORY_LOCAL_WRITE_MS) return;
    lastWriteAt.current = now;
    const current = findPlaybackHistory(records, title, mode);
    upsert({
      id: current?.id ?? libraryRecordId(mode, source, videoId),
      updatedAt: now,
      videoId,
      title,
      source,
      poster: poster || current?.poster,
      episodeIndex,
      playbackPosition: progress.currentTime,
      duration: progress.duration,
      mode,
    }, HISTORY_REMOTE_SYNC_DELAY_MS);
  }, [episodeIndex, mode, poster, records, source, title, upsert, videoId]);

  const onProgress = useCallback((progress: PlaybackProgress) => {
    latest.current = progress;
    persist(progress);
  }, [persist]);

  useEffect(() => {
    const flush = () => persist(latest.current, true);
    const visibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [persist]);

  return { initialTime, onProgress };
}
