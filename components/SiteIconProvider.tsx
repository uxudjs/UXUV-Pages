"use client";

import { useEffect } from "react";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";

export function SiteIconProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const runtime = useRuntimeConfig();

  useEffect(() => {
    if (runtime.status !== "ready" && runtime.status !== "public") return;
    document.title = runtime.config.site.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    description?.setAttribute("content", runtime.config.site.description);
    const existingIcon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const icon = existingIcon ?? document.createElement("link");
    icon.rel = "icon";
    icon.href = runtime.config.site.iconUrl;
    if (!existingIcon) document.head.append(icon);
  }, [runtime.config.site, runtime.status]);

  return children;
}
