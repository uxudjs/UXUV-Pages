import { responseError } from "@/lib/content/api-client";
import type { VideoSource } from "@/lib/content/types";
import type { AdFilterMode } from "@/lib/player/player-settings";

export interface Episode {
  name: string;
  url: string;
  index: number;
}

export interface VideoDetail {
  vod_id: string | number;
  vod_name: string;
  vod_pic?: string;
  vod_remarks?: string;
  vod_year?: string;
  vod_area?: string;
  vod_actor?: string;
  vod_director?: string;
  vod_content?: string;
  type_name?: string;
  vod_lang?: string;
  source: string;
  episodes: Episode[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeHttpUrl(value: unknown, base?: string): string | null {
  if (typeof value !== "string" || value.length > 8_192) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export async function getVideoDetail(
  id: string,
  source: VideoSource,
  signal?: AbortSignal,
): Promise<VideoDetail> {
  const response = await fetch("/api/detail", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, source }),
    signal,
  });
  if (!response.ok) throw await responseError(response, "无法加载视频详情。");
  const payload: unknown = await response.json();
  const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null;
  if (!data || (typeof data.vod_id !== "string" && typeof data.vod_id !== "number")
    || typeof data.vod_name !== "string" || !Array.isArray(data.episodes)) {
    throw new Error("视频详情格式无效。");
  }
  const episodes = data.episodes.flatMap((value): Episode[] => {
    if (!isRecord(value) || typeof value.name !== "string" || typeof value.index !== "number") return [];
    const url = safeHttpUrl(value.url);
    return url ? [{ name: value.name, url, index: value.index }] : [];
  });
  return { ...(data as unknown as Omit<VideoDetail, "episodes">), episodes };
}

export function buildMediaUrl(
  route: "proxy" | "iptv-stream",
  target: string,
  options: { userAgent?: string; referer?: string; adFilterMode?: AdFilterMode; adKeywords?: readonly string[] } = {},
): string {
  const query = new URLSearchParams({ url: target });
  if (options.userAgent) query.set("ua", options.userAgent);
  if (options.referer) query.set("referer", options.referer);
  if (options.adFilterMode) query.set("ad", options.adFilterMode);
  const keywords = [...new Set((options.adKeywords || []).map((value) => value.trim().slice(0, 40)).filter(Boolean))].slice(0, 32);
  for (const keyword of keywords) query.append("adkw", keyword);
  return `${route === "proxy" ? "/api/proxy" : "/api/iptv/stream"}?${query}`;
}
