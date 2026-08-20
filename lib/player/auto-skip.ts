import type { VideoSkipRule } from "@/lib/sync/document-types";

export const MAX_VIDEO_SKIP_RULES = 200;
export const MAX_VIDEO_SKIP_SECONDS = 600;

const SOURCE_ID = /^[A-Za-z0-9_.:-]{1,160}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export type VideoSkipMode = "standard" | "premium";
export type VideoSkipRuleInput = Omit<VideoSkipRule, "updatedAt">;

export const EMPTY_VIDEO_SKIP_RULE: Readonly<VideoSkipRuleInput> = Object.freeze({
  introEnabled: false,
  introSeconds: 0,
  outroEnabled: false,
  outroSeconds: 0,
});

function encodeKeyPart(value: string): string {
  return value.replaceAll("%", "%25").replaceAll(":", "%3A");
}

function decodeKeyPart(value: string): string {
  return value.replaceAll("%3A", ":").replaceAll("%25", "%");
}

function validIdentity(mode: unknown, source: unknown, videoId: unknown): mode is VideoSkipMode {
  return (mode === "standard" || mode === "premium")
    && typeof source === "string" && SOURCE_ID.test(source)
    && typeof videoId === "string" && videoId.length > 0 && videoId.length <= 256
    && !CONTROL_CHARACTERS.test(videoId);
}

export function videoSkipRuleKey(mode: VideoSkipMode, source: string, videoId: string): string {
  if (!validIdentity(mode, source, videoId)) throw new Error("Invalid video skip rule identity.");
  return `${mode}:${encodeKeyPart(source)}:${encodeKeyPart(videoId)}`;
}

export function videoSkipRuleMode(key: string): VideoSkipMode | null {
  const parts = key.split(":");
  if (parts.length !== 3) return null;
  const [mode, encodedSource, encodedVideoId] = parts;
  const source = decodeKeyPart(encodedSource);
  const videoId = decodeKeyPart(encodedVideoId);
  if (!validIdentity(mode, source, videoId)) return null;
  return videoSkipRuleKey(mode, source, videoId) === key ? mode : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validSeconds(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_VIDEO_SKIP_SECONDS;
}

function normalizedRule(value: unknown): VideoSkipRule | null {
  if (!isRecord(value) || typeof value.introEnabled !== "boolean" || !validSeconds(value.introSeconds)
    || typeof value.outroEnabled !== "boolean" || !validSeconds(value.outroSeconds)
    || !Number.isSafeInteger(value.updatedAt) || (value.updatedAt as number) < 0) return null;
  return { introEnabled: value.introEnabled, introSeconds: value.introSeconds,
    outroEnabled: value.outroEnabled, outroSeconds: value.outroSeconds, updatedAt: value.updatedAt as number };
}

export function pruneVideoSkipRules(rules: Readonly<Record<string, VideoSkipRule>>): Record<string, VideoSkipRule> {
  return Object.fromEntries(Object.entries(rules)
    .sort(([leftKey, left], [rightKey, right]) => right.updatedAt - left.updatedAt || leftKey.localeCompare(rightKey))
    .slice(0, MAX_VIDEO_SKIP_RULES));
}

export function normalizeVideoSkipRules(value: unknown): Record<string, VideoSkipRule> {
  if (!isRecord(value)) return {};
  const rules: Record<string, VideoSkipRule> = {};
  for (const [key, candidate] of Object.entries(value)) {
    const rule = videoSkipRuleMode(key) ? normalizedRule(candidate) : null;
    if (rule) rules[key] = rule;
  }
  return pruneVideoSkipRules(rules);
}

export function upsertVideoSkipRule(rules: Readonly<Record<string, VideoSkipRule>>, key: string,
  input: VideoSkipRuleInput, updatedAt = Date.now()): Record<string, VideoSkipRule> {
  const rule = normalizedRule({ ...input, updatedAt });
  if (!videoSkipRuleMode(key) || !rule) throw new Error("Invalid video skip rule.");
  return pruneVideoSkipRules({ ...rules, [key]: rule });
}

export function deleteVideoSkipRule(rules: Readonly<Record<string, VideoSkipRule>>, key: string): Record<string, VideoSkipRule> {
  return Object.fromEntries(Object.entries(rules).filter(([candidate]) => candidate !== key));
}

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
