"use client";

import { Clock, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { SearchHistoryItem } from "@/lib/hooks/useSearchHistory";

export interface SearchHistoryLabels {
  history: string;
  clearAll: string;
  deleteItem: string;
}

interface SearchHistoryDropdownProps {
  items: SearchHistoryItem[];
  highlightedIndex: number;
  labels: SearchHistoryLabels;
  onSelectItem: (query: string) => void;
  onRemoveItem: (query: string) => void;
  onClearAll: () => void;
}

export function SearchHistoryDropdown({
  items,
  highlightedIndex,
  labels,
  onSelectItem,
  onRemoveItem,
  onClearAll,
}: SearchHistoryDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightedIndex < 0) return;
    dropdownRef.current?.querySelector(`[data-index="${highlightedIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  return (
    <div ref={dropdownRef} className="search-history-dropdown"
      onMouseDown={(event) => event.preventDefault()}>
      <div className="search-history-header">
        <span><Clock size={16} aria-hidden="true" />{labels.history}</span>
        <button type="button" data-focusable aria-label={labels.clearAll} onClick={onClearAll}>{labels.clearAll}</button>
      </div>
      <div className="search-history-divider" />
      <div id="search-history-dropdown" className="search-history-list" role="listbox" aria-label={labels.history}>
        {items.map((item, index) => (
          <button type="button" id={`search-history-option-${index}`} key={`${item.query}:${item.timestamp}`} data-index={index}
            className={`search-history-item${index === highlightedIndex ? " highlighted" : ""}`}
            role="option" aria-selected={index === highlightedIndex} aria-label={item.query} aria-keyshortcuts="Delete"
            data-focusable onClick={(event) => {
              if ((event.target as HTMLElement).closest("[data-remove-history]")) onRemoveItem(item.query);
              else onSelectItem(item.query);
            }} onKeyDown={(event) => {
              if (event.key === "Delete") { event.preventDefault(); onRemoveItem(item.query); }
            }}>
            <Search size={16} aria-hidden="true" /><span className="search-history-query">{item.query}</span>
            {item.resultCount !== undefined && <small>{item.resultCount}</small>}
            <span className="search-history-remove" data-remove-history title={`${labels.deleteItem} ${item.query}`} aria-hidden="true">
              <X size={14} aria-hidden="true" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
