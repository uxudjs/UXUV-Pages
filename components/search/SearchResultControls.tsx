"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState, type FormEvent } from "react";
import { SEARCH_SORT_OPTIONS, type SearchSortOption } from "@/lib/utils/search-result-policy";

export interface SearchFilterBadge { value: string; label: string; count: number }
export interface SearchResultControlLabels {
  filters: string;
  source: string;
  type: string;
  language: string;
  clear: string;
  sort: string;
  sortOptions: Record<SearchSortOption, string>;
  realtimeLatency: string;
  pinging: string;
  blockPlaceholder: string;
  addBlock: string;
  blocked: string;
}

interface SearchResultControlsProps {
  labels: SearchResultControlLabels;
  sourceBadges: SearchFilterBadge[];
  typeBadges: SearchFilterBadge[];
  languageBadges: SearchFilterBadge[];
  selectedSources: Set<string>;
  selectedTypes: Set<string>;
  selectedLanguages: Set<string>;
  sortBy: SearchSortOption;
  realtimeLatency: boolean;
  isPinging: boolean;
  blockedCategories: string[];
  onToggleSource: (value: string) => void;
  onToggleType: (value: string) => void;
  onToggleLanguage: (value: string) => void;
  onClearFilters: () => void;
  onSortChange: (value: SearchSortOption) => void;
  onRealtimeLatencyChange: (value: boolean) => void;
  onAddBlockedCategory: (value: string) => void;
  onRemoveBlockedCategory: (value: string) => void;
}

function BadgeRow({ label, badges, selected, onToggle }: {
  label: string; badges: SearchFilterBadge[]; selected: Set<string>; onToggle: (value: string) => void;
}) {
  if (badges.length === 0) return null;
  return <fieldset className="kvideo-filter-group"><legend>{label}</legend><div>
    {badges.map((badge) => <button type="button" key={badge.value} aria-pressed={selected.has(badge.value)}
      onClick={() => onToggle(badge.value)}>{badge.label}<span>{badge.count}</span></button>)}
  </div></fieldset>;
}

export function SearchResultControls(props: SearchResultControlsProps) {
  const [category, setCategory] = useState("");
  const [expanded, setExpanded] = useState(false);
  const selectedCount = props.selectedSources.size + props.selectedTypes.size + props.selectedLanguages.size;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!category.trim()) return;
    props.onAddBlockedCategory(category);
    setCategory("");
  };
  return <section className="kvideo-result-controls" aria-label={props.labels.filters}>
    <div className="kvideo-result-policy-row">
      <label>{props.labels.sort}<select aria-label={props.labels.sort} value={props.sortBy}
        onChange={(event) => props.onSortChange(event.target.value as SearchSortOption)}>
        {SEARCH_SORT_OPTIONS.map((option) => <option value={option} key={option}>{props.labels.sortOptions[option]}</option>)}
      </select></label>
      <form className="kvideo-block-category kvideo-block-category-compact" onSubmit={submit}>
        <label><span className="kvideo-compact-label">{props.labels.blocked}</span><input value={category} maxLength={40}
          aria-label={props.labels.blocked} placeholder={props.labels.blockPlaceholder}
          onChange={(event) => setCategory(event.target.value)} /></label>
        <button type="submit" aria-label={props.labels.addBlock}><span aria-hidden="true">＋</span><span className="sr-only">{props.labels.addBlock}</span></button>
      </form>
      <button type="button" className="kvideo-result-controls-toggle" aria-label={props.labels.filters}
        aria-controls="kvideo-result-controls-expanded" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <SlidersHorizontal size={18} aria-hidden="true" />
      </button>
    </div>
    {props.blockedCategories.length > 0 && <div className="kvideo-blocked-categories" aria-label={props.labels.blocked}>
      {props.blockedCategories.map((value) => <button type="button" className="kvideo-blocked-chip" key={value}
        aria-label={`${props.labels.clear} ${value}`} onClick={() => props.onRemoveBlockedCategory(value)}>{value} ×</button>)}
    </div>}
    <div id="kvideo-result-controls-expanded" className="kvideo-result-controls-expanded kvideo-filter-row" hidden={!expanded}>
      <div className="kvideo-result-secondary-row">
        <label className="kvideo-latency-toggle"><input type="checkbox" checked={props.realtimeLatency}
          onChange={(event) => props.onRealtimeLatencyChange(event.target.checked)} />
          {props.isPinging ? props.labels.pinging : props.labels.realtimeLatency}</label>
        {selectedCount > 0 && <button type="button" onClick={props.onClearFilters}>{props.labels.clear} ({selectedCount})</button>}
      </div>
      <BadgeRow label={props.labels.source} badges={props.sourceBadges} selected={props.selectedSources} onToggle={props.onToggleSource} />
      <BadgeRow label={props.labels.type} badges={props.typeBadges} selected={props.selectedTypes} onToggle={props.onToggleType} />
      <BadgeRow label={props.labels.language} badges={props.languageBadges} selected={props.selectedLanguages} onToggle={props.onToggleLanguage} />
    </div>
  </section>;
}
