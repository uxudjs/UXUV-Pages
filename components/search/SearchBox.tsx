"use client";

import { Search, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useRef } from "react";
import { SearchHistoryDropdown, type SearchHistoryLabels } from "@/components/search/SearchHistoryDropdown";
import { useSearchHistory } from "@/lib/hooks/useSearchHistory";

export interface SearchBoxLabels extends SearchHistoryLabels {
  input: string;
  placeholder: string;
  search: string;
  clear: string;
}

interface SearchBoxProps {
  accountId: string;
  mode: "standard" | "premium";
  query: string;
  labels: SearchBoxLabels;
  disabled?: boolean;
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  onClear: () => void;
}

export function SearchBox({ accountId, mode, query, labels, disabled = false, onQueryChange, onSearch, onClear }: SearchBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isComposing = useRef(false);
  const history = useSearchHistory({
    accountId,
    mode,
    onSelect: (selectedQuery) => {
      onQueryChange(selectedQuery);
      onSearch(selectedQuery);
      inputRef.current?.blur();
    },
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const original = query.trim();
    if (isComposing.current || disabled || !original) return;
    history.addSearch(original);
    onSearch(original);
    history.hide();
    inputRef.current?.blur();
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || isComposing.current || !history.open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      history.navigate(event.key === "ArrowDown" ? "down" : "up");
    } else if (event.key === "Enter" && history.highlightedIndex >= 0) {
      event.preventDefault();
      const item = history.history[history.highlightedIndex];
      if (item) history.select(item.query);
    } else if (event.key === "Delete" && history.highlightedIndex >= 0) {
      event.preventDefault();
      const item = history.history[history.highlightedIndex];
      if (item) history.removeSearch(item.query);
    } else if (event.key === "Escape") {
      event.preventDefault();
      history.hide();
      inputRef.current?.blur();
    }
  };
  const clear = () => {
    onQueryChange("");
    onClear();
    history.resetHighlight();
    inputRef.current?.focus();
  };

  return (
    <form className="kvideo-home-search" onSubmit={submit}>
      <label className="sr-only" htmlFor="content-search">{labels.input}</label>
      <input id="content-search" ref={inputRef} data-focusable value={query}
        onChange={(event) => onQueryChange(event.target.value)} onFocus={history.show} onBlur={history.hide}
        onCompositionStart={() => { isComposing.current = true; }} onCompositionEnd={() => { isComposing.current = false; }}
        onKeyDown={keyDown} placeholder={labels.placeholder} aria-label={labels.input} role="combobox" aria-haspopup="listbox" aria-expanded={history.open}
        aria-controls="search-history-dropdown" aria-autocomplete="list"
        aria-activedescendant={history.highlightedIndex >= 0 ? `search-history-option-${history.highlightedIndex}` : undefined} />
      <div className="kvideo-search-actions">
        {query && <button type="button" className="kvideo-search-clear" data-focusable aria-label={labels.clear} onClick={clear}>
          <X size={20} aria-hidden="true" />
        </button>}
        <button type="submit" className="kvideo-search-submit" data-focusable aria-label={labels.search} disabled={disabled || !query.trim()}>
          <Search size={20} aria-hidden="true" /><span className="kvideo-search-button-label">{labels.search}</span>
        </button>
      </div>
      {history.open && <SearchHistoryDropdown items={history.history} highlightedIndex={history.highlightedIndex}
        labels={labels} onSelectItem={history.select} onRemoveItem={history.removeSearch} onClearAll={history.clearAll} />}
    </form>
  );
}
