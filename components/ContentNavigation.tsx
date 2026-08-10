"use client";

import Link from "next/link";
import { Github, Heart, LogOut, Settings, Tv } from "lucide-react";
import { useLocale, type AppLocale } from "@/components/LocaleProvider";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/lib/store/auth-store";

const COPY = {
  "zh-CN": { nav: "主导航", repository: "GitHub 仓库", live: "直播", favorites: "我的收藏", settings: "设置", logout: "退出登录", language: "语言" },
  "zh-TW": { nav: "主導覽", repository: "GitHub 儲存庫", live: "直播", favorites: "我的收藏", settings: "設定", logout: "登出", language: "語言" },
  en: { nav: "Primary navigation", repository: "GitHub repository", live: "Live TV", favorites: "Favorites", settings: "Settings", logout: "Sign out", language: "Language" },
} as const;

const localeLabels: Record<AppLocale, string> = { "zh-CN": "简", "zh-TW": "繁", en: "EN" };

export function ContentNavigation({ premium = false }: Readonly<{ premium?: boolean }>) {
  const runtime = useRuntimeConfig();
  const auth = useAuth();
  const { locale, setLocale } = useLocale();
  const copy = COPY[locale];
  const settingsHref = premium ? "/premium/settings" : "/settings";
  const favoritesHref = premium ? "/premium/favorites" : "/favorites";

  return <>
    <nav className="content-nav" aria-label={copy.nav}>
      <div className="content-nav-glass">
        <Link className="content-brand" href={premium ? "/premium" : "/"} prefetch={false}
          aria-label={`${runtime.config.site.name}${runtime.config.site.description}`} data-focusable>
          {/* Runtime icons are already same-origin constrained by the Worker configuration contract. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={runtime.config.site.iconUrl} alt="" width="40" height="40" />
          <span><h1>{runtime.config.site.name}</h1><small>{runtime.config.site.description}</small></span>
        </Link>
        <div className="content-nav-actions">
          {runtime.config.capabilities.iptv && (
            <Link className="nav-icon" href="/iptv" prefetch={false} aria-label={copy.live} title={copy.live} data-focusable>
              <Icon source={Tv} size={20} />
            </Link>
          )}
          <a className="nav-icon nav-github" href="https://github.com/KuekHaoYang/KVideo" target="_blank" rel="noopener noreferrer"
            aria-label={copy.repository} title={copy.repository} data-focusable><Icon source={Github} size={20} /></a>
          <Link className="nav-icon" href={favoritesHref} prefetch={false} aria-label={copy.favorites} title={copy.favorites} data-focusable>
            <Icon source={Heart} size={20} />
          </Link>
          <Link className="nav-icon" href={settingsHref} prefetch={false} aria-label={copy.settings} title={copy.settings} data-focusable>
            <Icon source={Settings} size={20} />
          </Link>
          <label className="locale-control">
            <span className="sr-only">{copy.language}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as AppLocale)} aria-label={copy.language} data-focusable>
              {Object.entries(localeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <ThemeSwitcher />
          {auth && <span className="nav-user"><b>{auth.session.name.charAt(0)}</b><span>{auth.session.name}</span></span>}
          <button className="nav-icon nav-logout" type="button" aria-label={copy.logout} title={copy.logout} data-focusable onClick={() => void auth?.signOut()}>
            <Icon source={LogOut} size={18} />
          </button>
        </div>
      </div>
    </nav>
  </>;
}
