"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { FavoritesSidebar } from "@/components/favorites/FavoritesSidebar";
import { WatchHistorySidebar } from "@/components/history/WatchHistorySidebar";
import { useLocale } from "@/components/LocaleProvider";
import { PlayerFavoriteButton } from "@/components/player/PlayerFavoriteButton";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Icon } from "@/components/ui/Icon";
import type { Video } from "@/lib/content/types";
import { useAuth } from "@/lib/store/auth-store";
import { displayInitial } from "@/lib/utils/display-initial";

const COPY = {
  "zh-CN": { back: "返回", settings: "打开设置" },
  "zh-TW": { back: "返回", settings: "開啟設定" },
  en: { back: "Back", settings: "Open settings" },
} as const;

export function PlayerNavbar({ premium, video }: Readonly<{ premium: boolean; video: Video | null }>) {
  const router = useRouter();
  const runtime = useRuntimeConfig();
  const auth = useAuth();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const settingsHref = premium ? "/premium/settings" : "/settings";
  const userInitial = displayInitial(auth?.session.name, auth?.session.username);

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
          {video && <PlayerFavoriteButton video={video} />}
          {auth && <Link className="nav-user" href={settingsHref} prefetch={false}
            aria-label={copy.settings} data-focusable>{userInitial}</Link>}
          <ThemeSwitcher />
        </div>
      </div>
    </nav>
    <FavoritesSidebar premium={premium} />
    <WatchHistorySidebar premium={premium} />
  </>;
}
