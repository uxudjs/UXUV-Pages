import type { ProxyMode } from "@/lib/player/player-settings";

export interface PlaybackSources {
  primarySrc: string;
  fallbackSrc: string | null;
}

function browserDirectMediaUrl(value: string): string | null {
  if (value.length > 8_192) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function resolvePlaybackSources(
  target: string,
  protectedSrc: string,
  proxyMode: ProxyMode,
): PlaybackSources {
  const directSrc = browserDirectMediaUrl(target);
  if (!directSrc) return { primarySrc: protectedSrc, fallbackSrc: null };
  if (proxyMode === "none") return { primarySrc: directSrc, fallbackSrc: null };
  if (proxyMode === "retry") return { primarySrc: protectedSrc, fallbackSrc: directSrc };
  return { primarySrc: protectedSrc, fallbackSrc: null };
}
