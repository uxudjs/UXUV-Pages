"use client";

import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { Icon } from "@/components/ui/Icon";

const LABEL = { "zh-CN": "返回顶部", "zh-TW": "返回頂部", en: "Back to top" } as const;

export function BackToTop() {
  const { locale } = useLocale();
  const [visible, setVisible] = useState(false);
  const [webFullscreen, setWebFullscreen] = useState(false);
  useEffect(() => {
    const update = () => setVisible((current) => scrollY > 300 || (current && scrollY > 0));
    addEventListener("scroll", update, { passive: true });
    queueMicrotask(update);
    return () => removeEventListener("scroll", update);
  }, []);
  useEffect(() => {
    const update = () => setWebFullscreen(document.body.classList.contains("player-web-fullscreen-open"));
    const observer = new MutationObserver(update);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    update();
    return () => observer.disconnect();
  }, []);
  return (
    <button
      className="back-to-top"
      type="button"
      data-visible={(visible && !webFullscreen) || undefined}
      data-focusable={webFullscreen ? undefined : true}
      hidden={webFullscreen}
      tabIndex={webFullscreen ? -1 : undefined}
      aria-label={LABEL[locale]}
      onClick={() => scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
    >
      <Icon source={ChevronUp} size={24} />
    </button>
  );
}
