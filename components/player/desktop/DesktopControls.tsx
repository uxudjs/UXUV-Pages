import { FastForward, Pause, Play, SkipBack } from "lucide-react";
import { DesktopLeftControls } from "@/components/player/desktop/DesktopLeftControls";
import { DesktopAdFilterMenu, type DesktopAdFilterLabels } from "@/components/player/desktop/DesktopAdFilterMenu";
import { DesktopDeviceControls, type DeviceControlLabels } from "@/components/player/desktop/DesktopDeviceControls";
import { DesktopProgressBar } from "@/components/player/desktop/DesktopProgressBar";
import { DesktopSpeedMenu } from "@/components/player/desktop/DesktopSpeedMenu";
import type { FullscreenMode } from "@/components/player/hooks/useFullscreenControls";
import type { AdFilterMode } from "@/lib/player/player-settings";

export interface DesktopControlLabels extends DeviceControlLabels, DesktopAdFilterLabels {
  play: string;
  pause: string;
  mute: string;
  unmute: string;
  progress: string;
  volume: string;
  speed: string;
  seekBack: string;
  seekForward: string;
}

interface DesktopControlsProps {
  visible: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  speedMenuOpen: boolean;
  adFilterMode: AdFilterMode;
  adMenuOpen: boolean;
  fullscreenMode: FullscreenMode;
  systemAvailable: boolean;
  pipAvailable: boolean;
  pipActive: boolean;
  castAvailable: boolean;
  castActive: boolean;
  labels: DesktopControlLabels;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSkipBackward: () => void;
  onSkipForward: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
  onSpeedMenuOpenChange: (open: boolean) => void;
  onAdMenuOpenChange: (open: boolean) => void;
  onAdFilterModeChange: (mode: AdFilterMode) => void;
  onRateChange: (rate: number) => void;
  onToggleSystemFullscreen: () => void;
  onToggleWebFullscreen: () => void;
  onTogglePictureInPicture: () => void;
  onShowCastMenu: () => void;
}

export function DesktopControls({ visible, playing, currentTime, duration, volume, muted, playbackRate,
  speedMenuOpen, adFilterMode, adMenuOpen, fullscreenMode, systemAvailable, pipAvailable, pipActive, castAvailable, castActive,
  labels, onTogglePlay, onSeek, onSkipBackward, onSkipForward, onToggleMute, onVolumeChange,
  onSpeedMenuOpenChange, onAdMenuOpenChange, onAdFilterModeChange, onRateChange, onToggleSystemFullscreen, onToggleWebFullscreen,
  onTogglePictureInPicture, onShowCastMenu }: Readonly<DesktopControlsProps>) {
  const CenterIcon = playing ? Pause : Play;
  return <div className={`desktop-player-overlay${visible ? " is-visible" : ""}`} aria-hidden={!visible} inert={!visible}>
    <DesktopSpeedMenu playbackRate={playbackRate} open={speedMenuOpen} label={labels.speed}
      onOpenChange={onSpeedMenuOpenChange} onRateChange={onRateChange} />
    <DesktopAdFilterMenu mode={adFilterMode} open={adMenuOpen} labels={labels}
      onOpenChange={onAdMenuOpenChange} onModeChange={onAdFilterModeChange} />
    <div className="desktop-center-controls">
      <button type="button" className="desktop-skip-back" aria-label={labels.seekBack}
        onClick={onSkipBackward}><SkipBack aria-hidden="true" /></button>
      {!playing && <button type="button" className="desktop-center-play" aria-label={labels.play}
        onClick={onTogglePlay}><CenterIcon aria-hidden="true" /></button>}
      <button type="button" className="desktop-skip-forward" aria-label={labels.seekForward}
        onClick={onSkipForward}><FastForward aria-hidden="true" /></button>
    </div>
    <div className="desktop-player-controls">
      <DesktopProgressBar currentTime={currentTime} duration={duration} label={labels.progress} onSeek={onSeek} />
      <div className="desktop-control-row">
        <DesktopLeftControls playing={playing} currentTime={currentTime} duration={duration} volume={volume} muted={muted}
          labels={labels} onTogglePlay={onTogglePlay} onToggleMute={onToggleMute} onVolumeChange={onVolumeChange} />
        <DesktopDeviceControls labels={labels} fullscreenMode={fullscreenMode} systemAvailable={systemAvailable}
          pipAvailable={pipAvailable} pipActive={pipActive} castAvailable={castAvailable} castActive={castActive}
          onToggleSystemFullscreen={onToggleSystemFullscreen} onToggleWebFullscreen={onToggleWebFullscreen}
          onTogglePictureInPicture={onTogglePictureInPicture} onShowCastMenu={onShowCastMenu} />
      </div>
    </div>
  </div>;
}
