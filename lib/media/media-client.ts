import { responseError } from "@/lib/content/api-client";
import type { VideoSource } from "@/lib/content/types";

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

export interface IptvSource {
  id: string;
  name: string;
  url: string;
  updatedAt: number;
  kind: "builtin" | "custom";
}

export interface IptvChannel {
  id: string;
  name: string;
  url: string;
  group: string;
  logo?: string;
  userAgent?: string;
  referer?: string;
  sourceId: string;
  sourceName: string;
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
  options: { userAgent?: string; referer?: string } = {},
): string {
  const query = new URLSearchParams({ url: target });
  if (options.userAgent) query.set("ua", options.userAgent);
  if (options.referer) query.set("referer", options.referer);
  return `${route === "proxy" ? "/api/proxy" : "/api/iptv/stream"}?${query}`;
}

export function parseIptvSources(raw: string, kind: IptvSource["kind"] = "builtin"): IptvSource[] {
  let candidates: Array<{ name?: unknown; url?: unknown }> = [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) candidates = parsed.filter(isRecord);
  } catch {
    candidates = raw.split(",").map((url) => ({ url: url.trim() }));
  }
  return candidates.slice(0, 32).flatMap((candidate, index) => {
    const url = safeHttpUrl(candidate.url);
    if (!url) return [];
    const name = typeof candidate.name === "string" && candidate.name.trim()
      ? candidate.name.trim().slice(0, 80) : `直播源 ${index + 1}`;
    return [{ id: `${kind}-${index}-${name}`, name, url, updatedAt: 0, kind }];
  });
}

function attribute(line: string, name: string): string | undefined {
  const match = line.match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match?.[1];
}

export function parseIptvPlaylist(text: string, source: IptvSource): IptvChannel[] {
  const lines = text.split(/\r?\n/);
  const channels: IptvChannel[] = [];
  let metadata: { name: string; group: string; logo?: string; userAgent?: string; referer?: string } | null = null;
  for (const line of lines) {
    const value = line.trim();
    if (value.startsWith("#EXTINF:")) {
      metadata = {
        name: value.slice(value.lastIndexOf(",") + 1).trim() || `频道 ${channels.length + 1}`,
        group: attribute(value, "group-title") || "未分组",
        logo: attribute(value, "tvg-logo"),
      };
    } else if (metadata && value.startsWith("#EXTVLCOPT:http-user-agent=")) {
      metadata.userAgent = value.slice(value.indexOf("=") + 1).trim();
    } else if (metadata && value.startsWith("#EXTVLCOPT:http-referrer=")) {
      metadata.referer = value.slice(value.indexOf("=") + 1).trim();
    } else if (metadata && value && !value.startsWith("#")) {
      const url = safeHttpUrl(value, source.url);
      if (url) channels.push({
        id: `${source.id}:${channels.length}:${metadata.name}`,
        ...metadata,
        url,
        sourceId: source.id,
        sourceName: source.name,
      });
      metadata = null;
      if (channels.length >= 5_000) break;
    }
  }
  return channels;
}

export async function loadIptvPlaylist(source: IptvSource, signal?: AbortSignal): Promise<IptvChannel[]> {
  const query = new URLSearchParams({ url: source.url });
  const response = await fetch(`/api/iptv?${query}`, { credentials: "same-origin", signal });
  if (!response.ok) throw await responseError(response, "无法加载 IPTV 频道。");
  return parseIptvPlaylist(await response.text(), source);
}
