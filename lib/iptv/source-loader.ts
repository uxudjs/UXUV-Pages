import { extractIptvReferences, mergeIptvChannels, parseIptvPlaylist, type IptvChannel, type IptvSource,
  type IptvReference } from "./playlist";

export type IptvSourceState = "loading" | "ready" | "empty" | "error";

export interface IptvSourceResult {
  source: IptvSource;
  channels: IptvChannel[];
  groups: string[];
  state: IptvSourceState;
  cached: boolean;
  updatedAt?: number;
  status?: number;
  error?: string;
}

interface LoadOptions {
  signal?: AbortSignal;
  force?: boolean;
  fetcher?: typeof fetch;
  onResult?: (result: IptvSourceResult) => void;
}

const MAX_CONCURRENT = 3;
const MAX_REFERENCE_DEPTH = 3;
const CACHE_TTL_MS = 5 * 60_000;
const CACHE_LIMIT = 16;
const sourceCache = new Map<string, Omit<IptvSourceResult, "cached">>();

function sourceKey(source: IptvSource): string {
  return [source.id, source.url, source.userAgent || "", source.referer || ""].join("\n");
}

function createLimiter(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= limit) return;
    const run = queue.shift();
    if (!run) return;
    active += 1;
    run();
  };
  return <T>(task: () => Promise<T>) => new Promise<T>((resolve, reject) => {
    queue.push(() => { void task().then(resolve, reject).finally(() => { active -= 1; next(); }); });
    next();
  });
}

function requestUrl(target: { url: string; userAgent?: string; referer?: string }): string {
  const query = new URLSearchParams({ url: target.url });
  if (target.userAgent) query.set("ua", target.userAgent.slice(0, 512));
  if (target.referer) query.set("referer", target.referer);
  return `/api/iptv?${query}`;
}

async function loadTree(root: IptvSource, target: IptvSource | IptvReference, depth: number, visited: Set<string>,
  limitedFetch: <T>(task: () => Promise<T>) => Promise<T>, fetcher: typeof fetch, signal?: AbortSignal): Promise<IptvChannel[]> {
  if (depth > MAX_REFERENCE_DEPTH || visited.has(target.url)) return [];
  visited.add(target.url);
  const response = await limitedFetch(() => fetcher(requestUrl(target), { credentials: "same-origin", signal }));
  if (!response.ok) {
    const error = new Error(`IPTV source returned ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  const content = await response.text();
  const parseSource = { ...root, url: target.url, userAgent: target.userAgent || root.userAgent,
    referer: target.referer || root.referer };
  const direct = parseIptvPlaylist(content, parseSource).channels.map((channel) => ({ ...channel,
    group: depth > 0 && channel.group === "未分组" ? target.name : channel.group }));
  const references = extractIptvReferences(content, target.url);
  const nested = await Promise.all(references.map((reference) => loadTree(root, reference, depth + 1, visited,
    limitedFetch, fetcher, signal).catch((error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") throw error;
      return [];
    })));
  return mergeIptvChannels([...direct, ...nested.flat()]);
}

function storeCache(key: string, result: Omit<IptvSourceResult, "cached">) {
  sourceCache.delete(key);
  sourceCache.set(key, result);
  while (sourceCache.size > CACHE_LIMIT) sourceCache.delete(sourceCache.keys().next().value!);
}

export async function loadIptvSources(sources: readonly IptvSource[], options: LoadOptions = {}): Promise<IptvSourceResult[]> {
  const fetcher = options.fetcher || fetch;
  const limitedFetch = createLimiter(MAX_CONCURRENT);
  return Promise.all(sources.slice(0, 32).map(async (source): Promise<IptvSourceResult> => {
    const key = sourceKey(source);
    const cached = sourceCache.get(key);
    if (!options.force && cached?.updatedAt && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
      const result = { ...cached, cached: true };
      options.onResult?.(result);
      return result;
    }
    try {
      const channels = await loadTree(source, source, 0, new Set(), limitedFetch, fetcher, options.signal);
      const updatedAt = Date.now();
      const result: Omit<IptvSourceResult, "cached"> = { source, channels,
        groups: [...new Set(channels.map(({ group }) => group))].sort(),
        state: channels.length > 0 ? "ready" : "empty", updatedAt };
      storeCache(key, result);
      const delivered = { ...result, cached: false };
      options.onResult?.(delivered);
      return delivered;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      const result: IptvSourceResult = { source, channels: [], groups: [], state: "error", cached: false,
        status: error && typeof error === "object" && "status" in error ? Number(error.status) : undefined,
        error: error instanceof Error ? error.message : "IPTV source failed" };
      options.onResult?.(result);
      return result;
    }
  }));
}
