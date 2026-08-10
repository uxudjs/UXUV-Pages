import { DesktopVolumeControl } from "@/components/player/desktop/DesktopVolumeControl";

function Play({ size = 20 }: { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
}

function Pause({ size = 20 }: { size?: number }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" /></svg>;
}

interface DesktopLeftControlsProps {
  playing: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  labels: { play: string; pause: string; mute: string; unmute: string; volume: string };
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
}

function formatTime(value: number): string {
  const safe = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function DesktopLeftControls({ playing, currentTime, duration, volume, muted, labels,
  onTogglePlay, onToggleMute, onVolumeChange }: Readonly<DesktopLeftControlsProps>) {
  const Icon = playing ? Pause : Play;
  return <div className="desktop-left-controls">
    <button type="button" className="desktop-icon-button" aria-label={playing ? labels.pause : labels.play}
      onClick={onTogglePlay}><Icon size={20} /></button>
    <DesktopVolumeControl volume={volume} muted={muted} muteLabel={labels.mute} unmuteLabel={labels.unmute}
      volumeLabel={labels.volume} onToggleMute={onToggleMute} onVolumeChange={onVolumeChange} />
    <span className="desktop-player-time" aria-live="off">{formatTime(currentTime)}<span className="desktop-duration"> / {formatTime(duration)}</span></span>
  </div>;
}
