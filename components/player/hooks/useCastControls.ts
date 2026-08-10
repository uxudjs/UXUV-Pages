import { useCallback, useEffect, useState } from "react";

interface CastMediaInfo { contentType: string }
interface CastLoadRequest { currentTime: number }
interface CastSession { loadMedia: (request: CastLoadRequest) => Promise<unknown> }
interface CastContext {
  setOptions: (options: { receiverApplicationId: string; autoJoinPolicy: string }) => void;
  requestSession: () => Promise<unknown> | unknown;
  getCurrentSession?: () => CastSession | null;
}
interface CastEnvironment {
  context: CastContext;
  receiverId: string;
  originScoped: string;
  MediaInfo: new (contentId: string, contentType: string) => CastMediaInfo;
  LoadRequest: new (mediaInfo: CastMediaInfo) => CastLoadRequest;
}

type CastWindow = Window & {
  cast?: { framework?: { CastContext?: { getInstance?: () => CastContext } } };
  chrome?: { cast?: { media?: { DEFAULT_MEDIA_RECEIVER_APP_ID?: string;
    MediaInfo?: CastEnvironment["MediaInfo"]; LoadRequest?: CastEnvironment["LoadRequest"] };
    AutoJoinPolicy?: { ORIGIN_SCOPED?: string } } };
  __onGCastApiAvailable?: (available: boolean) => void;
};

function castEnvironment(): CastEnvironment | null {
  const castWindow = window as CastWindow;
  const getInstance = castWindow.cast?.framework?.CastContext?.getInstance;
  const media = castWindow.chrome?.cast?.media;
  const receiverId = media?.DEFAULT_MEDIA_RECEIVER_APP_ID;
  const originScoped = castWindow.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED;
  if (!getInstance || !media?.MediaInfo || !media.LoadRequest || !receiverId || !originScoped) return null;
  return { context: getInstance(), receiverId, originScoped, MediaInfo: media.MediaInfo, LoadRequest: media.LoadRequest };
}

export function useCastControls(protectedMediaUrl: string, videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [castAvailable, setCastAvailable] = useState(false);
  const [castActive, setCastActive] = useState(false);

  useEffect(() => {
    let mounted = true;
    const initialize = () => {
      const environment = castEnvironment();
      if (!mounted || !environment) { if (mounted) setCastAvailable(false); return; }
      environment.context.setOptions({ receiverApplicationId: environment.receiverId, autoJoinPolicy: environment.originScoped });
      setCastAvailable(true);
    };
    queueMicrotask(initialize);
    const castWindow = window as CastWindow;
    const previousCallback = castWindow.__onGCastApiAvailable;
    castWindow.__onGCastApiAvailable = (available) => {
      if (!mounted) return;
      if (available) initialize();
      else setCastAvailable(false);
    };
    return () => {
      mounted = false;
      if (previousCallback) castWindow.__onGCastApiAvailable = previousCallback;
      else delete castWindow.__onGCastApiAvailable;
    };
  }, []);

  const showCastMenu = useCallback(async () => {
    const environment = castEnvironment();
    if (!environment) return;
    try {
      await environment.context.requestSession();
      const session = environment.context.getCurrentSession?.();
      if (!session) return;
      const absoluteProtectedUrl = new URL(protectedMediaUrl, location.origin).href;
      if (new URL(absoluteProtectedUrl).origin !== location.origin) return;
      const mediaInfo = new environment.MediaInfo(absoluteProtectedUrl,
        absoluteProtectedUrl.includes(".m3u8") ? "application/x-mpegurl" : "video/mp4");
      const request = new environment.LoadRequest(mediaInfo);
      request.currentTime = videoRef.current?.currentTime ?? 0;
      await session.loadMedia(request);
      videoRef.current?.pause();
      setCastActive(true);
    } catch { setCastActive(false); }
  }, [protectedMediaUrl, videoRef]);

  return { castAvailable, castActive, showCastMenu };
}
