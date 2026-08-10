"use client";

import { useLocale } from "@/components/LocaleProvider";

const COPY = {
  "zh-CN": {
    kicker: "UXUVideo 公共入口",
    description: "这里仅提供公开静态说明，不会发起认证请求。",
    guidance: "请从你的 UXUVideo Worker 域名访问完整应用。",
  },
  "zh-TW": {
    kicker: "UXUVideo 公開入口",
    description: "此處只提供公開靜態說明，不會發出驗證請求。",
    guidance: "請從你的 UXUVideo Worker 網域開啟完整應用程式。",
  },
  en: {
    kicker: "UXUVideo Public Pages",
    description: "This public static page does not make authentication requests.",
    guidance: "Open the full application from your UXUVideo Worker domain.",
  },
} as const;

export function PublicPage({ title }: Readonly<{ title: string }>) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  return (
    <main className="public-shell">
      <section className="public-notice" aria-labelledby="public-page-title">
        <p className="public-kicker">{copy.kicker}</p>
        <h1 className="public-title" id="public-page-title">
          {title}
        </h1>
        <p className="public-description">{copy.description}</p>
        <p className="public-guidance">{copy.guidance}</p>
      </section>
    </main>
  );
}
