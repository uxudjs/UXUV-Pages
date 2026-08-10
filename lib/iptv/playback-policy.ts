const MAX_VISIBLE_ROUTES = 3;
const MAX_PROBED_ROUTES = 12;
const MAX_CONCURRENT_PROBES = 3;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface HlsLevelCodec {
  videoCodec?: string | null;
}

function routeCodec(route: string): "h264" | "hevc" | "unknown" {
  if (/(?:^|[\W_])(?:h265|hevc|hev1|hvc1)(?:[\W_]|$)/i.test(route)) return "hevc";
  if (/(?:^|[\W_])(?:h264|avc1)(?:[\W_]|$)/i.test(route)) return "h264";
  return "unknown";
}

export function isHevcRoute(route: string): boolean {
  return routeCodec(route) === "hevc";
}

export function visibleIptvRoutes(routes: readonly string[], expanded: boolean): string[] {
  return routes.slice(0, expanded ? routes.length : MAX_VISIBLE_ROUTES);
}

export function orderIptvRoutes(routes: readonly string[], latencies: ReadonlyMap<string, number>, supportsHevc: boolean): string[] {
  return [...new Set(routes)].map((route, index) => ({ route, index, codec: routeCodec(route), latency: latencies.get(route) }))
    .sort((left, right) => {
      const codecRank = (codec: "h264" | "hevc" | "unknown") => codec === "h264" ? 0
        : codec === "unknown" ? 1 : supportsHevc ? 2 : 3;
      return codecRank(left.codec) - codecRank(right.codec)
        || (left.latency ?? Number.POSITIVE_INFINITY) - (right.latency ?? Number.POSITIVE_INFINITY)
        || left.index - right.index;
    }).map(({ route }) => route);
}

export function selectCompatibleHlsLevel(levels: readonly HlsLevelCodec[], supportsHevc: boolean): { level: number | null; incompatible: boolean } {
  const h264 = levels.findIndex(({ videoCodec }) => /(?:^|[.,])avc1/i.test(videoCodec || ""));
  if (h264 >= 0) return { level: h264, incompatible: false };
  const unknown = levels.findIndex(({ videoCodec }) => !videoCodec || !/(?:hev1|hvc1)/i.test(videoCodec));
  if (unknown >= 0) return { level: unknown, incompatible: false };
  return supportsHevc && levels.length > 0 ? { level: 0, incompatible: false } : { level: null, incompatible: levels.length > 0 };
}

export function supportsHevcPlayback(video: Pick<HTMLVideoElement, "canPlayType">): boolean {
  return Boolean(video.canPlayType('video/mp4; codecs="hvc1"') || video.canPlayType('video/mp4; codecs="hev1"'));
}

export async function probeIptvRoutes(routes: readonly string[], options: {
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
} = {}): Promise<Map<string, number>> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const queue = [...new Set(routes)].slice(0, MAX_PROBED_ROUTES);
  const latencies = new Map<string, number>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length) {
      const route = queue[cursor];
      cursor += 1;
      try {
        const response = await fetchImpl("/api/ping", {
          method: "POST", credentials: "same-origin", signal: options.signal,
          headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: route }),
        });
        const body: unknown = await response.json();
        if (response.ok && body && typeof body === "object" && (body as { success?: unknown }).success === true
          && Number.isFinite((body as { latency?: unknown }).latency)) {
          latencies.set(route, Math.max(0, Number((body as { latency: number }).latency)));
        }
      } catch (error) {
        if (options.signal?.aborted) throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_PROBES, queue.length) }, worker));
  return latencies;
}
