"use client";

import { useEffect } from "react";
import { useSync } from "@/components/SyncProvider";
import type { ConfigPayload } from "@/lib/sync/document-types";

function scrollKey(accountId: string) {
  return `scroll-pos:${encodeURIComponent(accountId)}:${location.pathname}${location.search}`;
}

export function ScrollPositionManager({ accountId }: Readonly<{ accountId: string }>) {
  const { documents, phase } = useSync();
  const rememberScrollPosition = (documents.config.payload as ConfigPayload).fields.rememberScrollPosition?.value !== false;
  useEffect(() => {
    if (phase === "loading") return;
    const key = scrollKey(accountId);
    if (!rememberScrollPosition) { sessionStorage.removeItem(key); return; }
    const target = Number.parseInt(sessionStorage.getItem(key) ?? "0", 10);
    let attempts = 0;
    let restoreTimer: ReturnType<typeof setTimeout> | undefined;
    const restore = () => {
      if (!Number.isFinite(target) || target <= 0 || attempts >= 10) return;
      scrollTo(0, target);
      attempts += 1;
      if (Math.abs(scrollY - target) >= 10) restoreTimer = setTimeout(restore, 120);
    };
    restoreTimer = setTimeout(restore, 0);

    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (scrollY > 0) sessionStorage.setItem(key, String(Math.round(scrollY)));
        else sessionStorage.removeItem(key);
      }, 120);
    };
    addEventListener("scroll", save, { passive: true });
    return () => {
      removeEventListener("scroll", save);
      clearTimeout(saveTimer);
      clearTimeout(restoreTimer);
    };
  }, [accountId, phase, rememberScrollPosition]);
  return null;
}
