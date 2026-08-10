"use client";

import { useEffect, useState } from "react";
import { useSpatialNavigation } from "@/lib/hooks/useSpatialNavigation";

const TV_PATTERN = /smart.?tv|tizen|webos|firetv|android tv|googletv|crkey|aftt|aftm|bravia|netcast|viera|hbbtv/i;

export function TVNavigationInitializer() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const detected = TV_PATTERN.test(navigator.userAgent)
      || (innerWidth >= 1280 && navigator.maxTouchPoints === 0 && devicePixelRatio <= 1.5);
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setEnabled(detected);
      document.body.classList.toggle("tv-mode", detected);
    });
    return () => {
      active = false;
      document.body.classList.remove("tv-mode");
    };
  }, []);
  useSpatialNavigation(enabled);
  return null;
}
