import { useId } from "react";
import { Cast, Maximize, Minimize, PictureInPicture } from "lucide-react";
import type { FullscreenMode } from "@/components/player/hooks/useFullscreenControls";

export interface DeviceControlLabels {
  pip: string;
  pipUnavailable: string;
  cast: string;
  castUnavailable: string;
  webFullscreen: string;
  exitWebFullscreen: string;
  systemFullscreen: string;
  exitSystemFullscreen: string;
  systemFullscreenUnavailable: string;
}

interface DesktopDeviceControlsProps {
  labels: DeviceControlLabels;
  fullscreenMode: FullscreenMode;
  systemAvailable: boolean;
  pipAvailable: boolean;
  pipActive: boolean;
  castAvailable: boolean;
  castActive: boolean;
  onToggleSystemFullscreen: () => void;
  onToggleWebFullscreen: () => void;
  onTogglePictureInPicture: () => void;
  onShowCastMenu: () => void;
}

function WebFullscreenIcon({ active }: Readonly<{ active: boolean }>) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    {active ? <>
      <path d="M9 3v6H3" /><path d="M10 10L3 3" />
      <path d="M15 21v-6h6" /><path d="M14 14l7 7" />
    </> : <>
      <path d="M15 3h6v6" /><path d="M14 10l7-7" />
      <path d="M9 21H3v-6" /><path d="M10 14l-7 7" />
    </>}
  </svg>;
}

export function DesktopDeviceControls({ labels, fullscreenMode, systemAvailable, pipAvailable, pipActive,
  castAvailable, castActive, onToggleSystemFullscreen, onToggleWebFullscreen, onTogglePictureInPicture,
  onShowCastMenu }: Readonly<DesktopDeviceControlsProps>) {
  const pipHelpId = useId();
  const castHelpId = useId();
  const systemHelpId = useId();
  const webActive = fullscreenMode === "window";
  const nativeActive = fullscreenMode === "native";
  return <div className="desktop-device-controls">
    <button type="button" className="desktop-icon-button" aria-label={labels.pip} aria-pressed={pipActive}
      aria-describedby={!pipAvailable ? pipHelpId : undefined} disabled={!pipAvailable}
      title={pipAvailable ? labels.pip : labels.pipUnavailable} onClick={onTogglePictureInPicture} data-focusable>
      <PictureInPicture aria-hidden="true" size={20} />
    </button>
    <button type="button" className="desktop-icon-button" aria-label={labels.cast} aria-pressed={castActive}
      aria-describedby={!castAvailable ? castHelpId : undefined} disabled={!castAvailable}
      title={castAvailable ? labels.cast : labels.castUnavailable} onClick={onShowCastMenu} data-focusable>
      <Cast aria-hidden="true" size={20} />
    </button>
    <button type="button" className="desktop-icon-button" aria-label={webActive ? labels.exitWebFullscreen : labels.webFullscreen}
      aria-pressed={webActive} onClick={onToggleWebFullscreen} data-focusable>
      <WebFullscreenIcon active={webActive} />
    </button>
    <button type="button" className="desktop-icon-button" aria-label={nativeActive ? labels.exitSystemFullscreen : labels.systemFullscreen}
      aria-pressed={nativeActive} aria-describedby={!systemAvailable ? systemHelpId : undefined} disabled={!systemAvailable}
      title={systemAvailable ? labels.systemFullscreen : labels.systemFullscreenUnavailable}
      onClick={onToggleSystemFullscreen} data-focusable>
      {nativeActive ? <Minimize aria-hidden="true" size={20} /> : <Maximize aria-hidden="true" size={20} />}
    </button>
    {!pipAvailable && <span id={pipHelpId} className="sr-only">{labels.pipUnavailable}</span>}
    {!castAvailable && <span id={castHelpId} className="sr-only">{labels.castUnavailable}</span>}
    {!systemAvailable && <span id={systemHelpId} className="sr-only">{labels.systemFullscreenUnavailable}</span>}
  </div>;
}
