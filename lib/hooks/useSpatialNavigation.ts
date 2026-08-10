"use client";

import { useEffect } from "react";

type Direction = "up" | "down" | "left" | "right";

function center(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, rect };
}

function nextElement(current: HTMLElement, candidates: HTMLElement[], direction: Direction) {
  const origin = center(current);
  let best: HTMLElement | null = null;
  let score = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (candidate === current) continue;
    const target = center(candidate);
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const valid = direction === "left" ? dx < -10
      : direction === "right" ? dx > 10
        : direction === "up" ? dy < -10 : dy > 10;
    if (!valid) continue;
    const value = direction === "left" || direction === "right"
      ? Math.abs(dx) + Math.abs(dy) * 3
      : Math.abs(dy) + Math.abs(dx) * 3;
    if (value < score) { best = candidate; score = value; }
  }
  return best;
}

export function useSpatialNavigation(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const directions: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    const keydown = (event: KeyboardEvent) => {
      const direction = directions[event.key];
      const target = event.target as HTMLElement;
      const editing = target.matches("input, textarea, [contenteditable=true]");
      if (editing && (!direction || direction === "left" || direction === "right")) return;
      const candidates = [...document.querySelectorAll<HTMLElement>("[data-focusable]:not([disabled]):not([aria-hidden=true])")]
        .filter((element) => !element.closest("[data-no-spatial]") && element.getBoundingClientRect().width > 0);
      if (direction) {
        const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const next = current && candidates.includes(current) ? nextElement(current, candidates, direction) : candidates[0];
        if (!next) return;
        next.focus();
        next.scrollIntoView({ block: "nearest", behavior: "smooth" });
        event.preventDefault();
      } else if (event.key === "Enter" && document.activeElement instanceof HTMLElement && document.activeElement.hasAttribute("data-focusable")) {
        document.activeElement.click();
        event.preventDefault();
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [enabled]);
}
