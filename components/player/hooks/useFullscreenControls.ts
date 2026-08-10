import { useCallback, useEffect, useState } from "react";

export type FullscreenMode = "none" | "native" | "window";
type FullscreenElement = HTMLDivElement & { webkitRequestFullscreen?: () => Promise<void> };
type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> };

export function useFullscreenControls(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [fullscreenMode, setFullscreenMode] = useState<FullscreenMode>("none");
  const [systemAvailable, setSystemAvailable] = useState(false);

  const toggleWebFullscreen = useCallback(async () => {
    const fullscreenDocument = document as FullscreenDocument;
    if (document.fullscreenElement || fullscreenDocument.webkitFullscreenElement) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await fullscreenDocument.webkitExitFullscreen?.();
      } catch { return; }
    }
    setFullscreenMode((current) => current === "window" ? "none" : "window");
  }, []);
  const toggleSystemFullscreen = useCallback(async () => {
    const container = containerRef.current as FullscreenElement | null;
    const fullscreenDocument = document as FullscreenDocument;
    if (!container) return;
    try {
      if (document.fullscreenElement || fullscreenDocument.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else await fullscreenDocument.webkitExitFullscreen?.();
        setFullscreenMode("none");
      } else if (container.requestFullscreen) {
        await container.requestFullscreen();
        setFullscreenMode("native");
      } else if (container.webkitRequestFullscreen) {
        await container.webkitRequestFullscreen();
        setFullscreenMode("native");
      }
    } catch { setFullscreenMode("none"); }
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current as FullscreenElement | null;
    setSystemAvailable(Boolean(document.fullscreenEnabled || container?.webkitRequestFullscreen));
  }, [containerRef]);
  useEffect(() => {
    const changed = () => {
      const active = Boolean(document.fullscreenElement || (document as FullscreenDocument).webkitFullscreenElement);
      setFullscreenMode((current) => active ? "native" : current === "native" ? "none" : current);
    };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("webkitfullscreenchange", changed);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      document.removeEventListener("webkitfullscreenchange", changed);
    };
  }, []);
  useEffect(() => {
    if (fullscreenMode !== "window") return;
    document.body.classList.add("player-web-fullscreen-open");
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setFullscreenMode("none"); };
    window.addEventListener("keydown", escape);
    return () => {
      document.body.classList.remove("player-web-fullscreen-open");
      window.removeEventListener("keydown", escape);
    };
  }, [fullscreenMode]);

  return { fullscreenMode, fullscreen: fullscreenMode !== "none", systemAvailable, toggleSystemFullscreen, toggleWebFullscreen };
}
