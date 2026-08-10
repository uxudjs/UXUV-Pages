import { useEffect } from "react";

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
};

export function useScreenOrientation(fullscreen: boolean, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const orientation = screen.orientation as LockableOrientation | undefined;
    if (fullscreen && orientation && typeof orientation.lock === "function") void orientation.lock("landscape").catch(() => undefined);
    if (!fullscreen && orientation && typeof orientation.unlock === "function") orientation.unlock();
    return () => { if (orientation && typeof orientation.unlock === "function") orientation.unlock(); };
  }, [enabled, fullscreen]);
}
