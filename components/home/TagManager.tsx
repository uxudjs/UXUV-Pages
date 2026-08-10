"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RefreshCw, Sparkles, Tag as TagIcon, X } from "lucide-react";
import { FormEvent, useState } from "react";

export interface TagManagerLabels {
  manage: string;
  done: string;
  input: string;
  add: string;
  restore: string;
  sort: string;
  delete: string;
}

interface TagManagerProps {
  tags: string[];
  selectedTag: string;
  loading: boolean;
  tagsLabel: string;
  loadingLabel: string;
  labels: TagManagerLabels;
  onTagChange: (tag: string) => void;
  onAdd: (tag: string) => void;
  onDelete: (tag: string) => void;
  onRestore: () => void;
  onMove: (activeTag: string, overTag: string) => void;
  onManagingChange: (managing: boolean) => void;
  recommendation?: {
    label: string;
    selected: boolean;
    onSelect: () => void;
  };
}

function SortableTag({
  tag,
  selected,
  managing,
  labels,
  onSelect,
  onDelete,
}: Pick<TagManagerProps, "labels" | "onDelete"> & {
  tag: string;
  selected: boolean;
  managing: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: tag, disabled: !managing });
  return (
    <div ref={setNodeRef} className="kvideo-sortable-tag" data-managing={managing || undefined}
      data-dragging={isDragging || undefined} style={{ transform: CSS.Transform.toString(transform), transition }}>
      <button ref={setActivatorNodeRef} type="button" className="kvideo-sort-handle"
        {...(managing ? attributes : {})} {...(managing ? listeners : {})}
        aria-pressed={selected} data-tag-value={tag} data-focusable
        aria-label={managing ? `${labels.sort} ${tag}` : undefined} onClick={onSelect}>{tag}</button>
      {managing && tag !== "热门" && <button type="button" className="kvideo-tag-delete" data-focusable
        aria-label={`${labels.delete} ${tag}`} onClick={() => onDelete(tag)}><X size={14} aria-hidden="true" /></button>}
    </div>
  );
}

export function TagManager({
  tags,
  selectedTag,
  loading,
  tagsLabel,
  loadingLabel,
  labels,
  onTagChange,
  onAdd,
  onDelete,
  onRestore,
  onMove,
  onManagingChange,
  recommendation,
}: TagManagerProps) {
  const [managing, setManaging] = useState(false);
  const [draft, setDraft] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const setManagementMode = (next: boolean) => {
    setManaging(next);
    onManagingChange(next);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft("");
  };
  const finishDrag = ({ active, over }: DragEndEvent) => {
    if (over) onMove(String(active.id), String(over.id));
  };
  const restore = () => {
    onRestore();
    setManagementMode(false);
  };

  return (
    <section className="kvideo-tag-manager" aria-label={tagsLabel} aria-busy={loading}>
      <div className="kvideo-tag-controls">
        <button type="button" data-focusable onClick={() => setManagementMode(!managing)}>
          <TagIcon size={16} aria-hidden="true" />{managing ? labels.done : labels.manage}
        </button>
        {managing && <button type="button" data-focusable onClick={restore}>
          <RefreshCw size={16} aria-hidden="true" />{labels.restore}
        </button>}
      </div>
      {managing && <form className="kvideo-tag-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="kvideo-new-tag">{labels.input}</label>
        <input id="kvideo-new-tag" value={draft} maxLength={80} placeholder={labels.input}
          onChange={(event) => setDraft(event.target.value)} />
        <button type="submit" data-focusable disabled={!draft.trim()}>{labels.add}</button>
      </form>}
      {loading ? <div className="kvideo-tag-loading" role="status"><RefreshCw size={16} aria-hidden="true" />{loadingLabel}</div> : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={finishDrag}>
          <SortableContext items={tags} strategy={managing ? rectSortingStrategy : horizontalListSortingStrategy}>
            <div className="kvideo-tag-sort-list" data-managing={managing || undefined}>
              {recommendation && <div className="kvideo-sortable-tag">
                <button type="button" className="kvideo-sort-handle" aria-pressed={recommendation.selected}
                  data-focusable onClick={recommendation.onSelect}><Sparkles size={14} aria-hidden="true" />{recommendation.label}</button>
              </div>}
              {tags.map((tag) => <SortableTag key={tag} tag={tag} selected={selectedTag === tag} managing={managing}
                labels={labels} onSelect={() => onTagChange(tag)} onDelete={onDelete} />)}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
