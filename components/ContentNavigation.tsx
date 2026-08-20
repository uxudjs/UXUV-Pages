"use client";

import Link from "next/link";
import { LogOut } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { useRuntimeConfig } from "@/components/RuntimeConfigProvider";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/lib/store/auth-store";
import { displayInitial } from "@/lib/utils/display-initial";

const COPY = {
  "zh-CN": { nav: "主导航", openSettings: "打开设置", logout: "退出登录" },
  "zh-TW": { nav: "主導覽", openSettings: "開啟設定", logout: "登出" },
  en: { nav: "Primary navigation", openSettings: "Open settings", logout: "Sign out" },
} as const;

export function ContentNavigation({ premium = false, onBrandActivate }: Readonly<{
  premium?: boolean;
  onBrandActivate?: () => void;
}>) {
  const runtime = useRuntimeConfig();
  const auth = useAuth();
  const { locale } = useLocale();
  const copy = COPY[locale];
  const settingsHref = premium ? "/premium/settings" : "/settings";
  const userInitial = displayInitial(auth?.session.name, auth?.session.username);

  return <>
    <nav className="content-nav" aria-label={copy.nav}>
      <div className="content-nav-glass">
        <Link className="content-brand" href="/" prefetch={false} onClick={onBrandActivate}
          aria-label={`${runtime.config.site.name}${runtime.config.site.description}`} data-focusable>
          {/* Runtime icons are already same-origin constrained by the Worker configuration contract. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={runtime.config.site.iconUrl} alt="" width="40" height="40" />
          <span><h1>{runtime.config.site.name}</h1><small>{runtime.config.site.description}</small></span>
        </Link>
        <div className="content-nav-actions">
          <ThemeSwitcher />
          {auth && <Link className="nav-user" href={settingsHref} prefetch={false} aria-label={copy.openSettings} data-focusable>{userInitial}</Link>}
          <button className="nav-icon nav-logout" type="button" aria-label={copy.logout} title={copy.logout} data-focusable onClick={() => void auth?.signOut()}>
            <Icon source={LogOut} size={18} />
          </button>
        </div>
      </div>
    </nav>
  </>;
}
