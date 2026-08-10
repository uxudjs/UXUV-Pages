"use client";

import { useState, type KeyboardEvent } from "react";
import { filterIptvChannels, IPTV_PAGE_SIZE, paginateIptvChannels, type IptvChannel, type IptvSource } from "@/lib/iptv/playlist";
import type { IptvSourceResult } from "@/lib/iptv/source-loader";

export interface IPTVBrowserLabels {
  sources: string;
  groups: string;
  channels: string;
  allGroups: string;
  search: string;
  loadMore: string;
  remaining: string;
  noMatch: string;
  loading: string;
  cached: string;
  empty: string;
  error: string;
  count: string;
}

interface IPTVChannelBrowserProps {
  sources: IptvSource[];
  results: IptvSourceResult[];
  activeChannel: IptvChannel | null;
  labels: IPTVBrowserLabels;
  onSelect: (channel: IptvChannel) => void;
}

type Stage = "source" | "group" | "channel";

function stageKey(event: KeyboardEvent<HTMLElement>, stage: Stage, previous?: Stage, next?: Stage) {
  const targetStage = event.key === "ArrowLeft" ? previous : event.key === "ArrowRight" ? next : undefined;
  if (targetStage) {
    event.preventDefault();
    event.stopPropagation();
    document.querySelector<HTMLElement>(`[data-iptv-stage="${targetStage}"] [data-focusable]`)?.focus();
    return;
  }
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  const items = [...document.querySelectorAll<HTMLElement>(`[data-iptv-stage="${stage}"] [data-focusable]`)]
    .filter((element) => element.getBoundingClientRect().width > 0);
  const index = items.indexOf(event.currentTarget);
  if (index < 0 || items.length < 2) return;
  event.preventDefault();
  event.stopPropagation();
  items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
}

export function IPTVChannelBrowser({ sources, results, activeChannel, labels, onSelect }:
Readonly<IPTVChannelBrowserProps>) {
  const [sourceId, setSourceId] = useState(sources[0]?.id || "");
  const [group, setGroup] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const effectiveSourceId = sources.some(({ id }) => id === sourceId) ? sourceId : sources[0]?.id || "";
  const selected = results.find(({ source }) => source.id === effectiveSourceId);
  const groups = selected?.groups || [];
  const effectiveGroup = groups.includes(group) ? group : "";
  const filtered = filterIptvChannels(selected?.channels || [], { group: effectiveGroup, query });
  const visible = paginateIptvChannels(filtered, page);
  const sourceStatus = (source: IptvSource) => {
    const result = results.find((item) => item.source.id === source.id);
    if (!result || result.state === "loading") return labels.loading;
    if (result.state === "error") return labels.error;
    if (result.state === "empty") return labels.empty;
    return `${result.channels.length} ${labels.count}${result.cached ? ` · ${labels.cached}` : ""}`;
  };

  return <section className="iptv-browser" aria-label={labels.channels}>
    <label className="iptv-channel-search">{labels.search}<input value={query} data-focusable
      onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
    <div className="iptv-browser-columns">
      <section data-iptv-stage="source" aria-labelledby="iptv-sources-heading">
        <h2 id="iptv-sources-heading">{labels.sources}</h2>
        <div className="iptv-stage-list">{sources.map((source) => <button key={source.id} type="button" data-focusable
          aria-pressed={effectiveSourceId === source.id} onClick={() => { setSourceId(source.id); setGroup(""); setPage(1); }}
          onKeyDown={(event) => stageKey(event, "source", undefined, "group")}>
          <strong>{source.name}</strong><small>{sourceStatus(source)}</small>
        </button>)}</div>
      </section>
      <section data-iptv-stage="group" aria-labelledby="iptv-groups-heading">
        <h2 id="iptv-groups-heading">{labels.groups}</h2>
        <div className="iptv-stage-list"><button type="button" data-focusable aria-pressed={!effectiveGroup} onClick={() => { setGroup(""); setPage(1); }}
          onKeyDown={(event) => stageKey(event, "group", "source", "channel")}>{labels.allGroups}</button>
        {groups.map((name) => <button key={name} type="button" data-focusable aria-pressed={effectiveGroup === name}
          onClick={() => { setGroup(name); setPage(1); }} onKeyDown={(event) => stageKey(event, "group", "source", "channel")}>{name}</button>)}</div>
      </section>
      <section data-iptv-stage="channel" aria-labelledby="iptv-channels-heading">
        <div className="section-title"><h2 id="iptv-channels-heading">{labels.channels}</h2><span>{filtered.length} {labels.count}</span></div>
        {selected?.state === "loading" && <p className="content-message" role="status">{labels.loading}</p>}
        {selected?.state === "error" && <p className="content-message form-error" role="alert">{labels.error}{selected.status ? ` (${selected.status})` : ""}</p>}
        {selected?.state === "empty" && <p className="content-message" role="status">{labels.empty}</p>}
        {selected?.state === "ready" && visible.channels.length === 0 && <p className="content-message" role="status">{labels.noMatch}</p>}
        <div className="channel-grid">{visible.channels.map((channel) => <button key={channel.id} type="button" data-focusable
          aria-pressed={activeChannel?.id === channel.id} aria-label={`${channel.name} · ${channel.group}`}
          onClick={() => onSelect(channel)} onKeyDown={(event) => stageKey(event, "channel", "group")}>
          <span aria-hidden="true">{channel.name.slice(0, 1)}</span><strong>{channel.name}</strong><small>{channel.group}</small>
        </button>)}</div>
        {visible.hasMore && <button type="button" className="iptv-load-more" data-focusable
          onClick={() => setPage((value) => value + 1)}>{labels.loadMore} ({filtered.length - page * IPTV_PAGE_SIZE} {labels.remaining})</button>}
      </section>
    </div>
  </section>;
}
