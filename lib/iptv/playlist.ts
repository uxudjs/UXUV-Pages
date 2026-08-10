export type IptvSourceKind = "builtin" | "custom";

export interface IptvSource {
  id: string;
  name: string;
  url: string;
  updatedAt: number;
  kind: IptvSourceKind;
  userAgent?: string;
  referer?: string;
}

export interface IptvChannel {
  id: string;
  name: string;
  url: string;
  routes?: string[];
  group: string;
  logo?: string;
  tvgId?: string;
  tvgName?: string;
  userAgent?: string;
  referer?: string;
  sourceId: string;
  sourceName: string;
}

export interface IptvPlaylist {
  channels: IptvChannel[];
  groups: string[];
}

export interface IptvReference {
  kind: "playlist" | "config";
  name: string;
  url: string;
  userAgent?: string;
  referer?: string;
}

export const IPTV_PAGE_SIZE = 100;
const MAX_CHANNELS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function safeHttpUrl(value: unknown, base?: string): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 8_192) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch { return null; }
}

function boundedHeader(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 512) : undefined;
}

function referer(value: unknown): string | undefined {
  return safeHttpUrl(value) || undefined;
}

export function parseIptvSources(raw: string, kind: IptvSourceKind = "builtin"): IptvSource[] {
  let candidates: Record<string, unknown>[] = [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) candidates = parsed.filter(isRecord);
    else if (isRecord(parsed) && Array.isArray(parsed.sources)) candidates = parsed.sources.filter(isRecord);
  } catch {
    candidates = raw.split(",").map((url) => ({ url: url.trim() }));
  }
  return candidates.slice(0, 32).flatMap((candidate, index): IptvSource[] => {
    const url = safeHttpUrl(candidate.url);
    if (!url) return [];
    const name = (firstString(candidate.name, candidate.title) || `直播源 ${index + 1}`).slice(0, 80);
    const explicitId = firstString(candidate.id);
    return [{
      id: explicitId && /^[A-Za-z0-9_.:-]{1,160}$/.test(explicitId) ? explicitId : `${kind}-${index}-${name}`,
      name,
      url,
      updatedAt: typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : 0,
      kind,
      userAgent: boundedHeader(candidate.userAgent ?? candidate.ua ?? candidate.httpUserAgent ?? candidate.http_user_agent),
      referer: referer(candidate.referer ?? candidate.referrer ?? candidate.httpReferrer ?? candidate.http_referrer),
    }];
  });
}

function attribute(line: string, name: string): string | undefined {
  return line.match(new RegExp(`${name}="([^"]*)"`, "i"))?.[1];
}

function routeValues(value: unknown, baseUrl: string): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return [...new Set(values.flatMap((item) => typeof item === "string" ? item.split(/\r?\n/).map((part) => part.trim()) : [])
    .map((item) => safeHttpUrl(item, baseUrl)).filter((item): item is string => Boolean(item)))];
}

function jsonEntries(data: unknown): Array<{ entry: Record<string, unknown>; group?: string }> {
  if (Array.isArray(data)) return data.filter(isRecord).map((entry) => ({ entry }));
  if (!isRecord(data)) return [];
  for (const value of [data.channels, data.list, data.items, data.data]) {
    if (Array.isArray(value)) return value.filter(isRecord).map((entry) => ({ entry }));
  }
  if (!Array.isArray(data.lives)) return [];
  return data.lives.filter(isRecord).flatMap((live) => Array.isArray(live.channels)
    ? live.channels.filter(isRecord).map((entry) => ({ entry, group: firstString(live.group, live.name, live.title) })) : []);
}

function groupChannels(channels: IptvChannel[]): IptvChannel[] {
  const grouped = new Map<string, IptvChannel>();
  for (const channel of channels) {
    const key = `${channel.sourceId}:${channel.name.trim().toLowerCase()}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, { ...channel, routes: channel.routes ? [...channel.routes] : undefined });
      continue;
    }
    const routes = [...new Set([...(current.routes || [current.url]), ...(channel.routes || [channel.url])])];
    current.routes = routes.length > 1 ? routes : undefined;
    if (!current.logo && channel.logo) current.logo = channel.logo;
  }
  return [...grouped.values()].slice(0, MAX_CHANNELS);
}

export function mergeIptvChannels(channels: IptvChannel[]): IptvChannel[] {
  return groupChannels(channels);
}

function fromJson(content: string, source: IptvSource): IptvChannel[] | null {
  try {
    const entries = jsonEntries(JSON.parse(content));
    if (entries.length === 0) return null;
    const channels = entries.flatMap(({ entry, group }, index): IptvChannel[] => {
      const name = firstString(entry.name, entry.title, entry.channel_name, entry.channel, entry.tvg_name, entry.tvgName);
      const routes = routeValues(entry.urls ?? entry.url ?? entry.stream_url ?? entry.src ?? entry.link ?? entry.stream
        ?? entry.playUrl ?? entry.play_url, source.url);
      if (!name || routes.length === 0) return [];
      return [{
        id: `${source.id}:${index}:${name}`,
        name: name.slice(0, 200), url: routes[0], routes: routes.length > 1 ? routes : undefined,
        group: (firstString(entry.group, entry.group_title, entry.groupName, entry.category, group) || "未分组").slice(0, 100),
        logo: firstString(entry.logo, entry.icon, entry.tvg_logo), tvgId: firstString(entry.tvg_id, entry.tvgId),
        tvgName: firstString(entry.tvg_name, entry.tvgName),
        userAgent: boundedHeader(entry.userAgent ?? entry.ua ?? entry.httpUserAgent ?? entry.http_user_agent) || source.userAgent,
        referer: referer(entry.referer ?? entry.referrer ?? entry.httpReferrer ?? entry.http_referrer) || source.referer,
        sourceId: source.id, sourceName: source.name,
      }];
    });
    return groupChannels(channels);
  } catch { return null; }
}

export function parseIptvPlaylist(content: string, source: IptvSource): IptvPlaylist {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const channels = fromJson(trimmed, source);
    if (channels) return { channels, groups: [...new Set(channels.map(({ group }) => group))].sort() };
  }
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const channels: IptvChannel[] = [];
  for (let index = 0; index < lines.length && channels.length < MAX_CHANNELS; index += 1) {
    const line = lines[index];
    if (!line.startsWith("#EXTINF:")) continue;
    const comma = line.lastIndexOf(",");
    const name = (comma >= 0 ? line.slice(comma + 1).trim() : "") || attribute(line, "tvg-name") || "";
    let userAgent = boundedHeader(attribute(line, "http-user-agent")) || source.userAgent;
    let httpReferer = referer(attribute(line, "http-referrer")) || source.referer;
    let url: string | null = null;
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next];
      if (candidate.startsWith("#EXTVLCOPT:http-user-agent=")) userAgent = boundedHeader(candidate.slice(candidate.indexOf("=") + 1)) || userAgent;
      else if (candidate.startsWith("#EXTVLCOPT:http-referrer=")) httpReferer = referer(candidate.slice(candidate.indexOf("=") + 1)) || httpReferer;
      else if (candidate.startsWith("#EXTINF:")) break;
      else if (!candidate.startsWith("#")) { url = safeHttpUrl(candidate, source.url); index = next; break; }
    }
    if (!name || !url) continue;
    channels.push({ id: `${source.id}:${channels.length}:${name}`, name: name.slice(0, 200), url,
      group: (attribute(line, "group-title") || "未分组").slice(0, 100), logo: attribute(line, "tvg-logo"),
      tvgId: attribute(line, "tvg-id"), tvgName: attribute(line, "tvg-name"), userAgent, referer: httpReferer,
      sourceId: source.id, sourceName: source.name });
  }
  const grouped = groupChannels(channels);
  return { channels: grouped, groups: [...new Set(grouped.map(({ group }) => group))].sort() };
}

export function extractIptvReferences(content: string, baseUrl: string): IptvReference[] {
  try {
    const data: unknown = JSON.parse(content);
    if (!isRecord(data)) return [];
    const references: IptvReference[] = [];
    for (const [kind, values] of [["playlist", data.lives], ["config", data.urls]] as const) {
      if (!Array.isArray(values)) continue;
      for (const entry of values.filter(isRecord)) {
        if (Array.isArray(entry.channels)) continue;
        const targets = Array.isArray(entry.urls) ? entry.urls : [entry.url];
        for (const target of targets) {
          const url = safeHttpUrl(target, baseUrl);
          if (!url || references.length >= 25) continue;
          references.push({ kind, name: (firstString(entry.name, entry.title) || "直播源").slice(0, 80), url,
            userAgent: boundedHeader(entry.userAgent ?? entry.ua ?? entry.httpUserAgent ?? entry.http_user_agent),
            referer: referer(entry.referer ?? entry.referrer ?? entry.httpReferrer ?? entry.http_referrer) });
        }
      }
    }
    return references;
  } catch { return []; }
}

export function filterIptvChannels(channels: readonly IptvChannel[], options: { sourceId?: string; group?: string; query?: string }): IptvChannel[] {
  const query = (options.query || "").trim().toLowerCase();
  return channels.filter((channel) => (!options.sourceId || channel.sourceId === options.sourceId)
    && (!options.group || channel.group === options.group) && (!query || channel.name.toLowerCase().includes(query)));
}

export function paginateIptvChannels(channels: readonly IptvChannel[], page: number) {
  const visible = Math.max(1, Math.floor(page || 1)) * IPTV_PAGE_SIZE;
  return { channels: channels.slice(0, visible), hasMore: visible < channels.length };
}
