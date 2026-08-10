interface DesktopSpeedMenuProps {
  playbackRate: number;
  open: boolean;
  label: string;
  onOpenChange: (open: boolean) => void;
  onRateChange: (rate: number) => void;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function DesktopSpeedMenu({ playbackRate, open, label, onOpenChange, onRateChange }: Readonly<DesktopSpeedMenuProps>) {
  return <div className="desktop-speed-menu">
    <button type="button" className="desktop-speed-trigger" aria-label={label} aria-expanded={open}
      aria-haspopup="menu" onClick={() => onOpenChange(!open)}>{playbackRate}x</button>
    {open && <div className="desktop-speed-options" role="menu" aria-label={label}>
      {SPEEDS.map((speed) => <button key={speed} type="button" role="menuitemradio"
        aria-checked={playbackRate === speed} onClick={() => { onRateChange(speed); onOpenChange(false); }}>
        {speed}x
      </button>)}
    </div>}
  </div>;
}
