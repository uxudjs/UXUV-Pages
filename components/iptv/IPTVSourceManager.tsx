"use client";

import { useState, type FormEvent } from "react";
import { parseIptvSources, type IptvSource } from "@/lib/iptv/playlist";

export interface IPTVSourceManagerLabels {
  title: string;
  synced: string;
  add: string;
  edit: string;
  remove: string;
  save: string;
  cancel: string;
  name: string;
  url: string;
  userAgent: string;
  referer: string;
  invalid: string;
  noCustom: string;
}

interface IPTVSourceManagerProps {
  sources: IptvSource[];
  labels: IPTVSourceManagerLabels;
  onChange: (sources: IptvSource[]) => void;
}

const EMPTY = { name: "", url: "", userAgent: "", referer: "" };

export function IPTVSourceManager({ sources, labels, onChange }: Readonly<IPTVSourceManagerProps>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState("");

  const reset = () => { setEditingId(null); setDraft(EMPTY); setError(""); };
  const edit = (source: IptvSource) => {
    setEditingId(source.id);
    setDraft({ name: source.name, url: source.url, userAgent: source.userAgent || "", referer: source.referer || "" });
    setError("");
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const id = editingId || `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const parsed = parseIptvSources(JSON.stringify([{ id, ...draft }]), "custom")[0];
    if (!parsed || (draft.referer.trim() && !parsed.referer)) { setError(labels.invalid); return; }
    onChange(editingId ? sources.map((source) => source.id === editingId ? parsed : source) : [...sources, parsed]);
    reset();
  };

  return <section className="player-panel iptv-source-manager" aria-labelledby="iptv-source-title">
    <div className="section-title"><h2 id="iptv-source-title">{labels.title}</h2><span>{labels.synced}</span></div>
    <form onSubmit={submit}>
      <label>{labels.name}<input value={draft.name} maxLength={80} required data-focusable
        onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} /></label>
      <label>{labels.url}<input value={draft.url} inputMode="url" required data-focusable
        onChange={(event) => setDraft((value) => ({ ...value, url: event.target.value }))} /></label>
      <label>{labels.userAgent}<input value={draft.userAgent} maxLength={512} data-focusable
        onChange={(event) => setDraft((value) => ({ ...value, userAgent: event.target.value }))} /></label>
      <label>{labels.referer}<input value={draft.referer} inputMode="url" data-focusable
        onChange={(event) => setDraft((value) => ({ ...value, referer: event.target.value }))} /></label>
      <div className="iptv-source-form-actions">
        {editingId && <button type="button" data-focusable onClick={reset}>{labels.cancel}</button>}
        <button className="primary-button" type="submit" data-focusable>{editingId ? labels.save : labels.add}</button>
      </div>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {sources.length === 0 ? <p className="content-message">{labels.noCustom}</p> : <ul>{sources.map((source) => <li key={source.id}>
      <span><strong>{source.name}</strong><small>{source.url}</small></span>
      <span className="iptv-source-row-actions"><button type="button" data-focusable onClick={() => edit(source)}
        aria-label={`${labels.edit} ${source.name}`}>{labels.edit}</button>
      <button type="button" data-focusable onClick={() => onChange(sources.filter(({ id }) => id !== source.id))}
        aria-label={`${labels.remove} ${source.name}`}>{labels.remove}</button></span>
    </li>)}</ul>}
  </section>;
}
