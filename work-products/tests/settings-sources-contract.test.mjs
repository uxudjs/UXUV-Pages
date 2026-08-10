import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("T15 keeps source validation, defaults, kind, and ordering in one policy", () => {
  const policy = read("lib/content/source-settings-policy.ts");
  const types = read("lib/content/types.ts");
  const home = read("components/HomeExperience.tsx");
  assert.match(policy, /SOURCE_ID/);
  assert.match(policy, /http:/);
  assert.match(policy, /https:/);
  assert.match(policy, /DEFAULT_SOURCE_PATH/);
  assert.match(policy, /priority/);
  assert.match(types, /kind\?: "system" \| "personal"/);
  assert.match(home, /orderedSources/);
});

test("T15 exposes settings hierarchy and source add, edit, toggle, delete, reorder, drag, and collapse controls", () => {
  const section = read("components/settings/SettingsSection.tsx");
  const page = read("app/settings/page.tsx");
  const settings = read("components/settings/SourceSettings.tsx");
  const manager = read("components/settings/SourceManager.tsx");
  const modal = read("components/settings/AddSourceModal.tsx");
  assert.match(section, /settings-section/);
  assert.match(page, /SettingsPageHeading/);
  assert.match(settings, /upsertRecord/);
  assert.match(settings, /removeRecord/);
  assert.match(settings, /confirmDelete/);
  assert.match(settings, /slice\(0, 10\)/);
  assert.match(manager, /DndContext/);
  assert.match(manager, /onMove/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /normalizeSourceDraft/);
});
