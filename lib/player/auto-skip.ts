export interface IntroSkipOptions {
  enabled: boolean;
  seconds: number;
  currentTime: number;
  duration: number;
}

export interface OutroActionOptions extends IntroSkipOptions {
  isPlaying: boolean;
  autoNext: boolean;
  hasNext: boolean;
}

function validTimeline(currentTime: number, duration: number): boolean {
  return Number.isFinite(currentTime) && currentTime >= 0 && Number.isFinite(duration) && duration > 0;
}

export function introSkipTarget({ enabled, seconds, currentTime, duration }: IntroSkipOptions): number | null {
  if (!enabled || !Number.isFinite(seconds) || seconds <= 0 || !validTimeline(currentTime, duration)) return null;
  const target = Math.min(seconds, Math.max(0, duration - 1));
  return currentTime < target && currentTime < seconds ? target : null;
}

export function outroAction({ enabled, seconds, currentTime, duration, isPlaying, autoNext, hasNext }:
Readonly<OutroActionOptions>): "next" | "end" | null {
  if (!enabled || !isPlaying || !Number.isFinite(seconds) || seconds <= 0 || !validTimeline(currentTime, duration)) return null;
  const remaining = duration - currentTime;
  if (currentTime <= 0 || remaining <= 0 || remaining > seconds) return null;
  return autoNext && hasNext ? "next" : "end";
}

export function shouldAdvanceOnEnded(autoNext: boolean, hasNext: boolean): boolean {
  return autoNext && hasNext;
}
