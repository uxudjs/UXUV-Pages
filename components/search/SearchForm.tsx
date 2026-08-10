"use client";

import { SearchBox, type SearchBoxLabels } from "@/components/search/SearchBox";

interface SearchFormProps {
  accountId: string;
  mode: "standard" | "premium";
  query: string;
  labels: SearchBoxLabels;
  disabled?: boolean;
  loading: boolean;
  progressLabel: string;
  cancelLabel: string;
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  onClear: () => void;
  onCancel: () => void;
}

export function SearchForm({
  accountId,
  mode,
  query,
  labels,
  disabled,
  loading,
  progressLabel,
  cancelLabel,
  onQueryChange,
  onSearch,
  onClear,
  onCancel,
}: SearchFormProps) {
  return <div className="kvideo-search-shell">
    <SearchBox accountId={accountId} mode={mode} query={query} labels={labels} disabled={disabled}
      onQueryChange={onQueryChange} onSearch={onSearch} onClear={onClear} />
    {loading && <div className="kvideo-search-progress" role="status">
      <span>{progressLabel}</span><button type="button" data-focusable onClick={onCancel}>{cancelLabel}</button>
    </div>}
  </div>;
}
