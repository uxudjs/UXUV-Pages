import { apiErrorFromPayload, responseError } from "./api-client";
import { videoFromApi, type ContentCapability, type Video, type VideoSource } from "./types";

export interface SearchProgress {
  completed: number;
  total: number;
  found: number;
  capability?: ContentCapability;
}

interface SearchOptions {
  signal: AbortSignal;
  onProgress: (progress: SearchProgress) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function searchVideos(
  query: string,
  sources: VideoSource[],
  { signal, onProgress }: SearchOptions,
): Promise<Video[]> {
  const response = await fetch("/api/search-parallel", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ query, sources, page: 1 }),
    signal,
  });
  if (!response.ok) throw await responseError(response, `搜索失败（${response.status}）。`);
  if (!response.body) throw new Error("搜索服务没有返回数据流。");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const videos = new Map<string, Video>();
  let buffer = "";
  let progress: SearchProgress = { completed: 0, total: sources.length, found: 0 };

  const consume = (block: string) => {
    const payload = block.split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!payload) return;
    const event: unknown = JSON.parse(payload);
    if (!isRecord(event) || typeof event.type !== "string") return;
    if (event.type === "start" && typeof event.totalSources === "number") {
      progress = { ...progress, total: event.totalSources,
        capability: isRecord(event.capability) ? event.capability as unknown as ContentCapability : undefined };
    } else if (event.type === "videos" && Array.isArray(event.videos)) {
      const source = typeof event.source === "string" ? event.source : "";
      for (const value of event.videos) {
        const video = videoFromApi(value, source);
        if (video) videos.set(`${video.source}:${video.vod_id}`, video);
      }
    } else if (event.type === "progress") {
      progress = {
        completed: typeof event.completedSources === "number" ? event.completedSources : progress.completed,
        total: progress.total,
        found: typeof event.totalVideosFound === "number" ? event.totalVideosFound : videos.size,
        capability: progress.capability,
      };
    } else if (event.type === "error") {
      throw apiErrorFromPayload(event, 502, "搜索失败，请稍后重试。");
    }
    onProgress({ ...progress, found: Math.max(progress.found, videos.size) });
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";
    for (const block of blocks) consume(block);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  return [...videos.values()];
}
