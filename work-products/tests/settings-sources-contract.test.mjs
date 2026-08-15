import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

async function loadPolicy() {
  const source = read("lib/content/source-settings-policy.ts");
  const javascript = transpileModule(source, {
    compilerOptions: { module: ModuleKind.ES2022, target: ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

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

test("subscription JSON links replace their materialized sources in settings without removing search data", async () => {
  const { standaloneSources } = await loadPolicy();
  const sources = [
    { id: "from-subscription", updatedAt: 1, name: "订阅内源", baseUrl: "https://media.example/api" },
    { id: "subscription-link", updatedAt: 1, name: "订阅链接", baseUrl: "https://example.com/sources.json" },
    { id: "manual", updatedAt: 1, name: "独立来源", baseUrl: "https://manual.example/api" },
  ];
  const subscriptions = [{
    id: "subscription-one", updatedAt: 1, lastUpdated: 1, name: "JSON 订阅",
    url: "https://example.com/sources.json", sourceIds: ["from-subscription"],
  }];

  assert.deepEqual(standaloneSources(sources, subscriptions).map(({ id }) => id), ["manual"]);
  assert.equal(sources.length, 3);
});
