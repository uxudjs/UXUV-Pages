interface DesktopProgressBarProps {
  currentTime: number;
  duration: number;
  label: string;
  onSeek: (time: number) => void;
}

export function DesktopProgressBar({ currentTime, duration, label, onSeek }: Readonly<DesktopProgressBarProps>) {
  const maximum = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const value = Math.min(Math.max(currentTime, 0), maximum);
  const progress = maximum > 0 ? `${(value / maximum) * 100}%` : "0%";

  return <div className="desktop-progress">
    <div className="desktop-progress-visual" aria-hidden="true">
      <span className="desktop-progress-range" style={{ width: progress }} />
      <span className="desktop-progress-thumb" style={{ left: progress }} />
    </div>
    <input className="desktop-progress-input" type="range" min={0} max={maximum} step={0.1} value={value}
      aria-label={label} aria-valuetext={`${Math.round(value)} / ${Math.round(maximum)}`}
      onChange={(event) => onSeek(Number(event.currentTarget.value))} />
  </div>;
}
