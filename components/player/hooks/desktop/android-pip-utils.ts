export interface AndroidPiPBridge {
  isPictureInPictureSupported?: () => boolean;
  enterPictureInPicture?: (width: number, height: number, left: number, top: number, right: number, bottom: number) => boolean;
}

export function getAndroidPiPBridge(): AndroidPiPBridge | null {
  return (window as Window & { KVideoAndroid?: AndroidPiPBridge }).KVideoAndroid ?? null;
}

export function isAndroidPiPAvailable(): boolean {
  return Boolean(getAndroidPiPBridge()?.isPictureInPictureSupported?.());
}

export function requestAndroidPictureInPicture(video: HTMLVideoElement, container: HTMLElement): boolean {
  const bridge = getAndroidPiPBridge();
  if (!bridge?.enterPictureInPicture || !isAndroidPiPAvailable()) return false;
  const rect = container.getBoundingClientRect();
  return bridge.enterPictureInPicture(video.videoWidth || container.clientWidth || 16,
    video.videoHeight || container.clientHeight || 9, Math.max(0, Math.round(rect.left)),
    Math.max(0, Math.round(rect.top)), Math.max(0, Math.round(rect.right)), Math.max(0, Math.round(rect.bottom))) !== false;
}
