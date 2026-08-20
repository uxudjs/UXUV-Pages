export interface HlsLevelCodec {
  videoCodec?: string | null;
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
