"use client";

import { useEffect } from "react";
import { isDirectPagesHost } from "@/lib/store/auth-store";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || isDirectPagesHost(window.location.hostname)) return;
    const register = () => {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then((registration) => registration.update())
        .catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
