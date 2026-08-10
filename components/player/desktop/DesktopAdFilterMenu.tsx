import { Ellipsis } from "lucide-react";
import type { AdFilterMode } from "@/lib/player/player-settings";

export interface DesktopAdFilterLabels {
  adFilter: string;
  adOff: string;
  adKeyword: string;
  adHeuristic: string;
  adAggressive: string;
}

interface DesktopAdFilterMenuProps {
  mode: AdFilterMode;
  open: boolean;
  labels: DesktopAdFilterLabels;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: AdFilterMode) => void;
}

const AD_FILTER_MODES = ["off", "keyword", "heuristic", "aggressive"] as const;

export function DesktopAdFilterMenu({ mode, open, labels, onOpenChange, onModeChange }:
Readonly<DesktopAdFilterMenuProps>) {
  const modeLabels: Record<AdFilterMode, string> = {
    off: labels.adOff,
    keyword: labels.adKeyword,
    heuristic: labels.adHeuristic,
    aggressive: labels.adAggressive,
  };
  return <div className="desktop-ad-filter-menu">
    <button type="button" className="desktop-speed-trigger desktop-ad-filter-trigger"
      aria-label={`${labels.adFilter}: ${modeLabels[mode]}`} aria-expanded={open} aria-haspopup="menu"
      onClick={() => onOpenChange(!open)}>
      <Ellipsis aria-hidden="true" />
    </button>
    {open && <div className="desktop-speed-options desktop-ad-filter-options" role="menu" aria-label={labels.adFilter}>
      {AD_FILTER_MODES.map((value) => <button key={value} type="button" role="menuitemradio"
        aria-checked={mode === value} onClick={() => { onModeChange(value); onOpenChange(false); }}>
        {modeLabels[value]}
      </button>)}
    </div>}
  </div>;
}
