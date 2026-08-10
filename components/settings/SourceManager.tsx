"use client";

import { useState, type KeyboardEvent } from "react";
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Pencil, Power, Trash2 } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import { sourceKind } from "@/lib/content/source-settings-policy";
import type { VideoSource } from "@/lib/content/types";

export interface SourceManagerLabels {
  system: string; personal: string; enable: string; disable: string; moveUp: string; moveDown: string;
  edit: string; remove: string; drag: string;
}

function SortableSource({ source, index, total, labels, onToggle, onMove, onEdit, onDelete }: Readonly<{
  source: VideoSource; index: number; total: number; labels: SourceManagerLabels;
  onToggle: (source: VideoSource) => void; onMove: (id: string, direction: -1 | 1) => void;
  onEdit: (source: VideoSource) => void; onDelete: (source: VideoSource) => void;
}>) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: source.id });
  const [keyboardGrabbed, setKeyboardGrabbed] = useState(false);
  const handleKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      setKeyboardGrabbed((value) => !value);
      return;
    }
    if (event.key === "Escape" && keyboardGrabbed) {
      event.preventDefault();
      setKeyboardGrabbed(false);
      return;
    }
    if (!keyboardGrabbed || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    onMove(source.id, event.key === "ArrowUp" ? -1 : 1);
  };
  return <li ref={setNodeRef} className="source-manager-row" data-dragging={isDragging || undefined}
    style={{ transform: CSS.Transform.toString(transform), transition }}>
    <button type="button" className="source-drag-handle" aria-label={`${labels.drag} ${source.name}`}
      data-focusable {...attributes} {...listeners} aria-pressed={keyboardGrabbed} onKeyDown={handleKeyboard}>
      <Icon source={GripVertical} size={18} /></button>
    <div className="source-manager-info"><div><strong>{source.name}</strong>
      <span className={`source-kind source-kind-${sourceKind(source)}`}>{labels[sourceKind(source)]}</span></div><small>{source.baseUrl}</small></div>
    <button type="button" aria-pressed={source.enabled !== false}
      aria-label={`${source.enabled === false ? labels.enable : labels.disable} ${source.name}`}
      data-focusable onClick={() => onToggle(source)}><Icon source={Power} size={16} />{source.enabled === false ? labels.enable : labels.disable}</button>
    <div className="source-manager-actions">
      <button type="button" aria-label={`${labels.moveUp} ${source.name}`} disabled={index === 0}
        data-focusable onClick={() => onMove(source.id, -1)}><Icon source={ArrowUp} size={16} /></button>
      <button type="button" aria-label={`${labels.moveDown} ${source.name}`} disabled={index === total - 1}
        data-focusable onClick={() => onMove(source.id, 1)}><Icon source={ArrowDown} size={16} /></button>
      {sourceKind(source) === "personal" && <button type="button" aria-label={`${labels.edit} ${source.name}`}
        data-focusable onClick={() => onEdit(source)}><Icon source={Pencil} size={16} /></button>}
      <button type="button" className="danger-button" aria-label={`${labels.remove} ${source.name}`}
        data-focusable onClick={() => onDelete(source)}><Icon source={Trash2} size={16} /></button>
    </div>
  </li>;
}

export function SourceManager({ sources, labels, onToggle, onMove, onReorder, onEdit, onDelete }: Readonly<{
  sources: readonly VideoSource[]; labels: SourceManagerLabels;
  onToggle: (source: VideoSource) => void; onMove: (id: string, direction: -1 | 1) => void;
  onReorder: (activeId: string, overId: string) => void; onEdit: (source: VideoSource) => void;
  onDelete: (source: VideoSource) => void;
}>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const finishDrag = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  };
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={finishDrag}>
    <SortableContext items={sources.map(({ id }) => id)} strategy={verticalListSortingStrategy}>
      <ul className="source-manager-list">{sources.map((source, index) => <SortableSource key={source.id} source={source}
        index={index} total={sources.length} labels={labels} onToggle={onToggle} onMove={onMove}
        onEdit={onEdit} onDelete={onDelete} />)}</ul>
    </SortableContext>
  </DndContext>;
}
