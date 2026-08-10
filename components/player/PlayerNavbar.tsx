"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Settings } from "lucide-react";
import { FavoritesSidebar } from "@/components/favorites/FavoritesSidebar";
import { WatchHistorySidebar } from "@/components/history/WatchHistorySidebar";
import { useLocale, type AppLocale } from "@/components/LocaleProvider";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Icon } from "@/components/ui/Icon";

const COPY = {
  "zh-CN": { back: "返回", settings: "设置", language: "语言" },
  "zh-TW": { back: "返回", settings: "設定", language: "語言" },
  en: { back: "Back", settings: "Settings", language: "Language" },
} as const;

export function PlayerNavbar({ premium }: Readonly<{ premium: boolean }>) {
  const router = useRouter();
  const runtime = useRuntimeConfig();
  const { locale, setLocale } = useLocale();
  const copy = COPY[locale];

  return <>
    <nav className="player-navbar" aria-label={copy.back}>
      <div className="player-navbar-glass">
        <div className="player-navbar-leading">
          <Link className="player-navbar-brand" href={premium ? "/premium" : "/"} prefetch={false}
            aria-label={runtime.config.site.name} data-focusable>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={runtime.config.site.iconUrl} alt="" width="40" height="40" />
          </Link>
          <button type="button" className="player-back-button" aria-label={copy.back} onClick={() => router.back()} data-focusable>
            <Icon source={ChevronLeft} size={20} /><span>{copy.back}</span>
          </button>
        </div>
        <div className="player-navbar-actions">
          <Link className="nav-icon" href={premium ? "/premium/settings" : "/settings"} prefetch={false}
            aria-label={copy.settings} title={copy.settings} data-focusable><Icon source={Settings} size={20} /></Link>
          <label className="locale-control"><span className="sr-only">{copy.language}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as AppLocale)}
              aria-label={copy.language} data-focusable>
              <option value="zh-CN">简</option><option value="zh-TW">繁</option><option value="en">EN</option>
            </select>
          </label>
          <ThemeSwitcher />
        </div>
      </div>
    </nav>
    <FavoritesSidebar premium={premium} />
    <WatchHistorySidebar premium={premium} />
  </>;
}
