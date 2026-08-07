import { apiErrorFromPayload, responseError } from "./api-client";
import type { ContentCapability, ResolutionInfo, Video, VideoSource } from "./types";

interface ProbeResult {
  resolution: ResolutionInfo | null;
  capability: ContentCapability | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function probeResolution(video: Video, sources: VideoSource[], signal: AbortSignal): Promise<ProbeResult> {
  const sourceConfigs = sources.filter(({ id }) => id === video.source);
  const response = await fetch("/api/probe-resolution", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ videos: [{ id: video.vod_id, source: video.source }], sourceConfigs }),
    signal,
  });
  if (!response.ok) throw await responseError(response, "清晰度探测失败。");
  if (!response.body) throw new Error("探测服务没有返回数据流。");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let capability: ContentCapability | null = null;
  let resolution: ResolutionInfo | null = null;
  const consume = (block: string) => {
    const data = block.split(/\r?\n/).find((line) => line.startsWith("data:"));
    if (!data) return;
    const event: unknown = JSON.parse(data.slice(5).trimStart());
    if (!isRecord(event)) return;
    if (event.type === "error" || isRecord(event.error)) throw apiErrorFromPayload(event, 502, "清晰度探测失败。");
    if (event.type === "start" && isRecord(event.capability)) capability = event.capability as unknown as ContentCapability;
    if (event.id === video.vod_id && event.source === video.source && isRecord(event.resolution)) {
      resolution = event.resolution as unknown as ResolutionInfo;
    }
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
  return { resolution, capability };
}
