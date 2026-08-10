import { useEffect } from "react";

interface DesktopShortcuts {
  enabled: boolean;
  volume: number;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onSkipForward: () => void;
  onSkipBackward: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleSystemFullscreen?: () => void;
  onToggleWebFullscreen?: () => void;
  onTogglePictureInPicture?: () => void;
  onEscape?: () => void;
  onInteraction: () => void;
}

function isEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.contentEditable === "true" || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement || Boolean(target.closest("button,a,[role]"));
}

export function useDesktopShortcuts({ enabled, volume, onTogglePlay, onToggleMute, onSkipForward,
  onSkipBackward, onVolumeChange, onToggleSystemFullscreen, onToggleWebFullscreen,
  onTogglePictureInPicture, onEscape, onInteraction }: DesktopShortcuts) {
  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditing(event.target)) return;
      let handled = true;
      switch (event.key.toLowerCase()) {
        case " ":
        case "k": onTogglePlay(); break;
        case "m": onToggleMute(); break;
        case "arrowright":
        case "l": onSkipForward(); break;
        case "arrowleft":
        case "j": onSkipBackward(); break;
        case "arrowup": onVolumeChange(Math.min(1, volume + 0.1)); break;
        case "arrowdown": onVolumeChange(Math.max(0, volume - 0.1)); break;
        case "f": onToggleSystemFullscreen?.(); handled = Boolean(onToggleSystemFullscreen); break;
        case "w": onToggleWebFullscreen?.(); handled = Boolean(onToggleWebFullscreen); break;
        case "p": onTogglePictureInPicture?.(); handled = Boolean(onTogglePictureInPicture); break;
        case "escape": onEscape?.(); handled = Boolean(onEscape); break;
        default: handled = false;
      }
      if (!handled) return;
      event.preventDefault();
      onInteraction();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onEscape, onInteraction, onSkipBackward, onSkipForward, onToggleMute, onTogglePictureInPicture,
    onTogglePlay, onToggleSystemFullscreen, onToggleWebFullscreen, onVolumeChange, volume]);
}
