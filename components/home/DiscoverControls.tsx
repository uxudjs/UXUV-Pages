"use client";

import { TagManager, type TagManagerLabels } from "@/components/home/TagManager";
import type { HomeContentType } from "@/lib/content/api-client";

interface DiscoverControlsProps {
  contentType: HomeContentType;
  tags: string[];
  selectedTag: string;
  loading: boolean;
  movieLabel: string;
  televisionLabel: string;
  tagsLabel: string;
  loadingLabel: string;
  tagManagerLabels: TagManagerLabels;
  onTypeChange: (type: HomeContentType) => void;
  onTagChange: (tag: string) => void;
  onTagAdd: (tag: string) => void;
  onTagDelete: (tag: string) => void;
  onTagRestore: () => void;
  onTagMove: (activeTag: string, overTag: string) => void;
  onTagManagementChange: (managing: boolean) => void;
  showTypeToggle: boolean;
  recommendation?: {
    label: string;
    selected: boolean;
    onSelect: () => void;
  };
}

export function DiscoverControls({
  contentType,
  tags,
  selectedTag,
  loading,
  movieLabel,
  televisionLabel,
  tagsLabel,
  loadingLabel,
  tagManagerLabels,
  onTypeChange,
  onTagChange,
  onTagAdd,
  onTagDelete,
  onTagRestore,
  onTagMove,
  onTagManagementChange,
  showTypeToggle,
  recommendation,
}: DiscoverControlsProps) {
  return (
    <div className="kvideo-discovery">
      {showTypeToggle && <div className="kvideo-type-toggle">
        <span className="kvideo-type-indicator" data-type={contentType} aria-hidden="true" />
        <button type="button" aria-pressed={contentType === "movie"} data-focusable onClick={() => onTypeChange("movie")}>{movieLabel}</button>
        <button type="button" aria-pressed={contentType === "tv"} data-focusable onClick={() => onTypeChange("tv")}>{televisionLabel}</button>
      </div>}
      <TagManager tags={tags} selectedTag={selectedTag} loading={loading} tagsLabel={tagsLabel}
        loadingLabel={loadingLabel} labels={tagManagerLabels} onTagChange={onTagChange}
        onAdd={onTagAdd} onDelete={onTagDelete} onRestore={onTagRestore} onMove={onTagMove}
        onManagingChange={onTagManagementChange} recommendation={recommendation} />
    </div>
  );
}
