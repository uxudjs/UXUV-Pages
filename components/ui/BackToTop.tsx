"use client";

import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { Icon } from "@/components/ui/Icon";

const LABEL = { "zh-CN": "返回顶部", "zh-TW": "返回頂部", en: "Back to top" } as const;

export function BackToTop() {
  const { locale } = useLocale();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible((current) => scrollY > 300 || (current && scrollY > 0));
    addEventListener("scroll", update, { passive: true });
    queueMicrotask(update);
    return () => removeEventListener("scroll", update);
  }, []);
  return (
    <button
      className="back-to-top"
      type="button"
      data-visible={visible || undefined}
      data-focusable
      aria-label={LABEL[locale]}
      onClick={() => scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
    >
      <Icon source={ChevronUp} size={24} />
    </button>
  );
}
