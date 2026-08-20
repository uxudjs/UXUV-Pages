"use client";

import { ArrowUpDown, ChevronDown, Layers, LayoutGrid, List, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { Icon } from "@/components/ui/Icon";
import type { Episode } from "@/lib/media/media-client";
import type { GroupedSource } from "@/lib/media/grouped-sources-cache";

const EPISODES_PER_PAGE = 50;
const MAX_VISIBLE_SOURCES = 5;

const COPY = {
  "zh-CN": { sources: "源列表", currentLine: "当前线路", total: "条", expandSources: "展开源列表", collapseSources: "折叠源列表",
    more: "展开更多", less: "收起", episodes: "选集", currentEpisode: "当前选集", grid: "切换为网格", list: "切换为列表",
    reverse: "倒序排列", forward: "恢复正序", expandEpisodes: "展开选集列表", collapseEpisodes: "折叠选集列表", empty: "暂无剧集信息", playing: "当前播放" },
  "zh-TW": { sources: "來源列表", currentLine: "目前線路", total: "條", expandSources: "展開來源列表", collapseSources: "收合來源列表",
    more: "展開更多", less: "收起", episodes: "選集", currentEpisode: "目前選集", grid: "切換為網格", list: "切換為列表",
    reverse: "倒序排列", forward: "恢復正序", expandEpisodes: "展開選集列表", collapseEpisodes: "收合選集列表", empty: "暫無劇集資訊", playing: "目前播放" },
  en: { sources: "Sources", currentLine: "Current source", total: "total", expandSources: "Expand source list", collapseSources: "Collapse source list",
    more: "Show more", less: "Show less", episodes: "Episodes", currentEpisode: "Current episode", grid: "Switch to grid", list: "Switch to list",
    reverse: "Reverse order", forward: "Restore order", expandEpisodes: "Expand episode list", collapseEpisodes: "Collapse episode list", empty: "No episodes available", playing: "currently playing" },
} as const;

interface EpisodeListProps {
  episodes: Episode[];
  currentEpisode: number;
  onEpisodeChange: (index: number) => void;
  sources: GroupedSource[];
  sourceResolutions: Readonly<Record<string, { label: string }>>;
  currentSource: string;
  onSourceChange: (source: GroupedSource) => void;
  sourceSectionCollapsed: boolean;
  onSourceSectionCollapseChange: (collapsed: boolean) => void;
  episodeSectionCollapsed: boolean;
  onEpisodeSectionCollapseChange: (collapsed: boolean) => void;
}

export function EpisodeList({ episodes, currentEpisode, onEpisodeChange, sources, currentSource, onSourceChange,
  sourceResolutions, sourceSectionCollapsed, onSourceSectionCollapseChange,
  episodeSectionCollapsed, onEpisodeSectionCollapseChange }: Readonly<EpisodeListProps>) {
  const { locale } = useLocale();
  const copy = COPY[locale];
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [showAllSources, setShowAllSources] = useState(false);
  const [episodeLayout, setEpisodeLayout] = useState<"grid" | "list">("grid");
  const [reversed, setReversed] = useState(false);
  const [episodePage, setEpisodePage] = useState(0);
  const episodeButtons = useRef<Array<HTMLButtonElement | null>>([]);
  const episodeScroller = useRef<HTMLDivElement>(null);
  const orderedEpisodes = useMemo(() => reversed ? [...episodes].reverse() : episodes, [episodes, reversed]);
  const currentDisplayIndex = reversed ? episodes.length - 1 - currentEpisode : currentEpisode;
  const pages = Math.max(1, Math.ceil(orderedEpisodes.length / EPISODES_PER_PAGE));

  useEffect(() => {
    const page = Math.min(pages - 1, Math.max(0, Math.floor(currentDisplayIndex / EPISODES_PER_PAGE)));
    queueMicrotask(() => setEpisodePage(page));
  }, [currentDisplayIndex, pages]);
  useEffect(() => {
    const visibleIndex = episodeLayout === "grid"
      ? currentDisplayIndex - episodePage * EPISODES_PER_PAGE : currentDisplayIndex;
    episodeButtons.current[visibleIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [currentDisplayIndex, episodeLayout, episodePage]);
  const visibleEpisodes = episodeLayout === "list" ? orderedEpisodes : orderedEpisodes.slice(episodePage * EPISODES_PER_PAGE, (episodePage + 1) * EPISODES_PER_PAGE);
  const visibleSources = showAllSources || sources.findIndex(({ source }) => source === currentSource) >= MAX_VISIBLE_SOURCES
    ? sources : sources.slice(0, MAX_VISIBLE_SOURCES);
  const sourceGroups = useMemo(() => {
    const groups = new Map<string, GroupedSource[]>();
    visibleSources.forEach((source) => {
      const key = source.typeName || "";
      groups.set(key, [...(groups.get(key) || []), source]);
    });
    return [...groups.entries()];
  }, [visibleSources]);
  const activeSource = sources.find(({ source }) => source === currentSource);
  const currentLabel = episodes[currentEpisode]?.name || `${copy.episodes} ${currentEpisode + 1}`;
  const sourceDiagnostics = (source: GroupedSource | undefined) => source ? [
    typeof source.latency === "number" ? `${Math.round(source.latency)} ms` : "",
    sourceResolutions[source.source]?.label || "",
  ].filter(Boolean).join(" · ") : "";

  const episodeKey = (event: React.KeyboardEvent<HTMLButtonElement>, visibleIndex: number) => {
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1
      : event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
    if (!direction) return;
    const next = Math.min(visibleEpisodes.length - 1, Math.max(0, visibleIndex + direction));
    const button = episodeButtons.current[next];
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
    event.preventDefault();
    event.stopPropagation();
  };
  const shiftWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const scroller = episodeScroller.current;
    if (!event.shiftKey || !scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    event.preventDefault();
    scroller.scrollLeft += event.deltaY || event.deltaX;
  };

  return <aside className="player-panel episode-panel" aria-label={copy.episodes}>
    {sources.length > 1 && <section className="source-selector">
      <div className="player-panel-heading"><h2><Icon source={Layers} size={19} />{copy.sources}<span>{sources.length}</span></h2>
        <button type="button" aria-label={sourceSectionCollapsed ? copy.expandSources : copy.collapseSources}
          onClick={() => onSourceSectionCollapseChange(!sourceSectionCollapsed)} data-focusable>
          <Icon source={ChevronDown} size={16} /></button></div>
      {!sourceSectionCollapsed && <>
        <button className="current-source" type="button" onClick={() => setSourceExpanded((value) => !value)}
          aria-expanded={sourceExpanded} data-focusable><strong>{activeSource?.sourceName || currentSource}</strong>
          <span>{copy.currentLine} · {sources.length} {copy.total}
            {sourceDiagnostics(activeSource) && ` · ${sourceDiagnostics(activeSource)}`}</span><Icon source={ChevronDown} size={16} /></button>
        {sourceExpanded && <div className="source-options">
          {sourceGroups.map(([typeName, items]) => <div key={typeName || "default"} className="source-group">
            {typeName && <h3>{typeName}</h3>}
            {items.map((source) => <button key={`${source.source}:${source.id}`} type="button"
              aria-current={source.source === currentSource ? "true" : undefined} onClick={() => {
                if (source.source !== currentSource) onSourceChange(source);
                setSourceExpanded(false);
              }} data-focusable><span>{source.sourceName || source.source}</span>
              {sourceDiagnostics(source) && <small>{sourceDiagnostics(source)}</small>}
              {source.source === currentSource && <Icon source={Play} size={14} />}</button>)}
          </div>)}
          {sources.length > MAX_VISIBLE_SOURCES && <button className="source-more" type="button"
            onClick={() => setShowAllSources((value) => !value)} data-focusable>
            {showAllSources ? copy.less : `${copy.more} (${sources.length - MAX_VISIBLE_SOURCES})`}</button>}
        </div>}
      </>}
    </section>}

    <section className="episode-selector">
      <div className="player-panel-heading"><h2><Icon source={List} size={19} />{copy.episodes}<span>{episodes.length}</span></h2>
        <div>
          {episodes.length > 1 && !episodeSectionCollapsed && <>
            <button type="button" aria-label={episodeLayout === "grid" ? copy.list : copy.grid}
              aria-pressed={episodeLayout === "grid"}
              onClick={() => setEpisodeLayout((value) => value === "grid" ? "list" : "grid")} data-focusable>
              <Icon source={episodeLayout === "grid" ? Layers : LayoutGrid} size={16} /></button>
            <button type="button" aria-label={reversed ? copy.forward : copy.reverse} aria-pressed={reversed}
              onClick={() => setReversed((value) => !value)} data-focusable><Icon source={ArrowUpDown} size={16} /></button>
          </>}
          <button type="button" aria-label={episodeSectionCollapsed ? copy.expandEpisodes : copy.collapseEpisodes}
            onClick={() => onEpisodeSectionCollapseChange(!episodeSectionCollapsed)} data-focusable>
            <Icon source={ChevronDown} size={16} /></button>
        </div>
      </div>
      {episodeSectionCollapsed ? <div className="current-episode"><span>{copy.currentEpisode}</span><strong>{currentLabel}</strong></div> : <>
        {episodeLayout === "grid" && pages > 1 && <div className="episode-pages" aria-label={copy.episodes}>
          {Array.from({ length: pages }, (_, page) => {
            const start = page * EPISODES_PER_PAGE + 1;
            const end = Math.min((page + 1) * EPISODES_PER_PAGE, episodes.length);
            return <button key={page} type="button" aria-current={page === episodePage ? "page" : undefined}
              onClick={() => setEpisodePage(page)} data-focusable>{start}-{end}</button>;
          })}
        </div>}
        <div ref={episodeScroller} className={`episode-options is-${episodeLayout}`} role="radiogroup"
          aria-label={copy.episodes} onWheel={shiftWheel}>
          {visibleEpisodes.length === 0 ? <p>{copy.empty}</p> : visibleEpisodes.map((episode, visibleIndex) => {
            const orderedIndex = episodeLayout === "grid" ? episodePage * EPISODES_PER_PAGE + visibleIndex : visibleIndex;
            const originalIndex = reversed ? episodes.length - 1 - orderedIndex : orderedIndex;
            const selected = originalIndex === currentEpisode;
            return <button key={`${episode.index}:${episode.url}`} ref={(element) => { episodeButtons.current[visibleIndex] = element; }}
              type="button" role="radio" aria-checked={selected} aria-current={selected ? "true" : undefined}
              aria-label={`${episode.name}${selected ? `，${copy.playing}` : ""}`} onClick={() => onEpisodeChange(originalIndex)}
              onKeyDown={(event) => episodeKey(event, visibleIndex)} data-focusable>{episode.name}</button>;
          })}
        </div>
      </>}
    </section>
  </aside>;
}
