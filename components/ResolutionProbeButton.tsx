"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/store/auth-store";
import { ContentApiError } from "@/lib/content/api-client";
import { probeResolution } from "@/lib/content/probe-client";
import type { Video, VideoSource } from "@/lib/content/types";

interface ResolutionProbeButtonProps {
  video: Video;
  sources: VideoSource[];
  className?: string;
  labels?: { action: string; loading: string; unknown: string; error: string };
}

const DEFAULT_LABELS = { action: "探测清晰度", loading: "探测中…", unknown: "未识别", error: "探测失败" };

export function ResolutionProbeButton({ video, sources, className = "", labels = DEFAULT_LABELS }: ResolutionProbeButtonProps) {
  const auth = useAuth();
  const controller = useRef<AbortController | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [label, setLabel] = useState("");

  useEffect(() => () => controller.current?.abort(), []);

  const run = async () => {
    controller.current?.abort();
    controller.current = new AbortController();
    setState("loading");
    setLabel("");
    try {
      const result = await probeResolution(video, sources, controller.current.signal);
      setLabel(result.resolution?.label ?? labels.unknown);
      setState("ready");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof ContentApiError && error.status === 401) auth?.markSessionExpired();
      setLabel(error instanceof Error ? error.message : labels.error);
      setState("error");
    }
  };

  return (
    <div className={`probe-control ${className}`.trim()}>
      <button type="button" disabled={state === "loading" || sources.length === 0}
        aria-label={`${labels.action} ${video.vod_name}`} onClick={() => void run()}>
        {state === "loading" ? labels.loading : state === "ready" ? label : labels.action}
      </button>
      {state === "error" && <span role="alert">{label}</span>}
    </div>
  );
}
