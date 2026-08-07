"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/store/auth-store";
import { ContentApiError } from "@/lib/content/api-client";
import { probeResolution } from "@/lib/content/probe-client";
import type { Video, VideoSource } from "@/lib/content/types";

interface ResolutionProbeButtonProps {
  video: Video;
  sources: VideoSource[];
}

export function ResolutionProbeButton({ video, sources }: ResolutionProbeButtonProps) {
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
      setLabel(result.resolution?.label ?? "未识别");
      setState("ready");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (error instanceof ContentApiError && error.status === 401) auth?.markSessionExpired();
      setLabel(error instanceof Error ? error.message : "探测失败");
      setState("error");
    }
  };

  return (
    <div className="probe-control">
      <button type="button" disabled={state === "loading" || sources.length === 0}
        aria-label={`探测清晰度 ${video.vod_name}`} onClick={() => void run()}>
        {state === "loading" ? "探测中…" : state === "ready" ? label : "探测清晰度"}
      </button>
      {state === "error" && <span role="alert">{label}</span>}
    </div>
  );
}
