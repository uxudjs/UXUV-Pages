"use client";

import { Calendar, ExternalLink, Globe2, Languages } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { Icon } from "@/components/ui/Icon";
import type { VideoDetail } from "@/lib/media/media-client";

const COPY = {
  "zh-CN": { actor: "主演：", director: "导演：", unknown: "未知", summary: "暂无简介。" },
  "zh-TW": { actor: "主演：", director: "導演：", unknown: "未知", summary: "暫無簡介。" },
  en: { actor: "Cast: ", director: "Director: ", unknown: "Unknown", summary: "No synopsis available." },
} as const;

export function splitPersonNames(value: string): string[] {
  return value.split(/[,，/]/).map((name) => name.trim()).filter(Boolean);
}

function personLinks(value: string | undefined, fallback: string) {
  if (!value) return fallback;
  return <span className="player-person-list">{splitPersonNames(value).map((name) => (
    <a key={name} href={`https://movie.douban.com/celebrities/search?search_text=${encodeURIComponent(name)}`}
      target="_blank" rel="noopener noreferrer" data-focusable>{name}<Icon source={ExternalLink} size={11} /></a>
  ))}</span>;
}

export function VideoMetadata({ detail, sourceName }: Readonly<{ detail: VideoDetail; sourceName: string }>) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const summary = (detail.vod_content || detail.vod_remarks || copy.summary).replace(/<[^>]*>/g, "");

  return <article className="player-panel video-metadata">
    <div className="video-metadata-layout">
      <div className="video-metadata-poster">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={detail.vod_pic || "/placeholder-poster.svg"} alt=""
          referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.src = "/placeholder-poster.svg"; }} />
      </div>
      <div className="video-metadata-copy">
        <h1>{detail.vod_name}</h1>
        <div className="video-metadata-badges">
          <span className="is-source">✓ {sourceName}</span>
          {detail.type_name && <span>{detail.type_name}</span>}
          {detail.vod_year && <span><Icon source={Calendar} size={13} />{detail.vod_year}</span>}
          {detail.vod_area && <span><Icon source={Globe2} size={13} />{detail.vod_area}</span>}
          {detail.vod_lang && <span><Icon source={Languages} size={13} />{detail.vod_lang}</span>}
        </div>
        <p>{summary}</p>
        <div className="video-person-row"><strong>{copy.actor}</strong>{personLinks(detail.vod_actor, copy.unknown)}</div>
        <div className="video-person-row"><strong>{copy.director}</strong>{personLinks(detail.vod_director, copy.unknown)}</div>
      </div>
    </div>
  </article>;
}
