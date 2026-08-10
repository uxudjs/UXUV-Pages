"use client";

import { useEffect, useState } from "react";

function detectTouchInput(): boolean {
  return matchMedia("(pointer: coarse)").matches || innerWidth < 768;
}

export function useMobilePlayer() {
  const [isTouchInput, setIsTouchInput] = useState(false);
  useEffect(() => {
    const media = matchMedia("(pointer: coarse)");
    const update = () => setIsTouchInput(detectTouchInput());
    queueMicrotask(update);
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return { isTouchInput };
}
