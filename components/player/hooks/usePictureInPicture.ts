import { useCallback, useEffect, useState } from "react";
import { isAndroidPiPAvailable, requestAndroidPictureInPicture } from "@/components/player/hooks/desktop/android-pip-utils";

type PiPDocument = Document & {
  pictureInPictureEnabled?: boolean;
  pictureInPictureElement?: Element | null;
  exitPictureInPicture?: () => Promise<void>;
};
type PiPVideo = HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> };

export function usePictureInPicture(videoRef: React.RefObject<HTMLVideoElement | null>, containerRef: React.RefObject<HTMLDivElement | null>) {
  const [pipAvailable, setPipAvailable] = useState(false);
  const [pipActive, setPipActive] = useState(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const video = videoRef.current as PiPVideo | null;
      const pipDocument = document as PiPDocument;
      setPipAvailable(Boolean((pipDocument.pictureInPictureEnabled && video?.requestPictureInPicture) || isAndroidPiPAvailable()));
    });
    const entered = () => setPipActive(true);
    const left = () => setPipActive(false);
    const video = videoRef.current;
    video?.addEventListener("enterpictureinpicture", entered);
    video?.addEventListener("leavepictureinpicture", left);
    return () => {
      active = false;
      video?.removeEventListener("enterpictureinpicture", entered);
      video?.removeEventListener("leavepictureinpicture", left);
    };
  }, [videoRef]);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current as PiPVideo | null;
    const container = containerRef.current;
    if (!video || !container || !pipAvailable) return;
    const pipDocument = document as PiPDocument;
    try {
      if (pipDocument.pictureInPictureElement && pipDocument.exitPictureInPicture) {
        await pipDocument.exitPictureInPicture();
        setPipActive(false);
      } else if (pipDocument.pictureInPictureEnabled && video.requestPictureInPicture) {
        await video.requestPictureInPicture();
        setPipActive(true);
      } else if (requestAndroidPictureInPicture(video, container)) {
        setPipActive(true);
      }
    } catch { setPipActive(false); }
  }, [containerRef, pipAvailable, videoRef]);

  return { pipAvailable, pipActive, togglePictureInPicture };
}
