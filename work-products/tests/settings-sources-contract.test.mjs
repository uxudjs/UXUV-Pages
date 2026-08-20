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
  assert.match(types, /kind\?: "system" \| "personal" \| "subscription" \| "standalone"/);
  assert.match(types, /subscriptionId\?: string/);
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
  assert.doesNotMatch(page, /UserSourceSettings/);
  assert.match(settings, /upsertRecord/);
  assert.match(settings, /applyRecordChanges/);
  assert.match(settings, /onResyncSubscription/);
  assert.doesNotMatch(settings, /standaloneSources/);
  assert.doesNotMatch(settings, /copy\.personal|copy\.system/);
  assert.match(settings, /removeRecord/);
  assert.match(settings, /confirmDelete/);
  assert.match(settings, /slice\(0, 10\)/);
  assert.match(manager, /DndContext/);
  assert.match(manager, /onMove/);
  assert.match(manager, /source\.kind === "subscription"/);
  assert.match(manager, /onEdit\(source\)/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /normalizeSourceDraft/);
  assert.doesNotMatch(modal, /personal video source|个人视频源|個人影片來源/i);
});

test("subscription materialized sources remain visible in the unified settings manager", () => {
  const settings = read("components/settings/SourceSettings.tsx");
  assert.match(settings, /orderedSources\(config\.sources\.filter\(isManagedSource\)/);
  assert.doesNotMatch(settings, /standaloneSources/);
  assert.match(settings, /sources=\{displayed\}/);
});

test("S21-T09 replaces only explicitly owned materialized subscription sources", async () => {
  const { prepareSubscriptionResync, subscriptionOwnedSourceIds } = await loadPolicy();
  const existing = [
    { id: "old-normal", updatedAt: 1, name: "Old normal", baseUrl: "https://old-normal.example", group: "normal", kind: "subscription", subscriptionId: "subscription-one" },
    { id: "other-normal", updatedAt: 1, name: "Other normal", baseUrl: "https://other-normal.example", group: "normal", kind: "subscription", subscriptionId: "subscription-two" },
    { id: "manual", updatedAt: 1, name: "Manual", baseUrl: "https://manual.example", group: "normal", kind: "system" },
    { id: "old-premium", updatedAt: 1, name: "Old premium", baseUrl: "https://old-premium.example", group: "premium", kind: "subscription", subscriptionId: "subscription-one" },
  ];
  const subscription = {
    id: "subscription-one", updatedAt: 2, lastUpdated: 2, lastError: "request", name: "Fixture",
    url: "https://fixture.example/subscription.json", sourceIds: ["old-normal", "other-normal", "old-premium", "manual"],
  };
  assert.deepEqual(subscriptionOwnedSourceIds(existing, subscription, "standard"), ["old-normal"]);
  const result = prepareSubscriptionResync(existing, subscription, [
    { id: "new-normal", updatedAt: 3, name: "New", baseUrl: "https://new.example", group: "premium", kind: "personal" },
  ], "standard", 10);

  assert.deepEqual(result.removeIds, ["old-normal"]);
  assert.deepEqual(result.sources, [{
    id: "new-normal", updatedAt: 10, name: "New", baseUrl: "https://new.example", group: "normal", kind: "subscription", subscriptionId: "subscription-one",
  }]);
  assert.deepEqual(result.subscription, {
    ...subscription, updatedAt: 10, lastUpdated: 10, lastError: undefined,
    mode: "standard", sourceIds: ["new-normal"],
  });
  assert.equal(existing[1].subscriptionId, "subscription-two");
  assert.equal(existing[2].kind, "system");
  assert.equal(existing[3].group, "premium");
});

test("S21-T09 rejects imported IDs owned by a standalone or different subscription source", async () => {
  const { prepareSubscriptionResync } = await loadPolicy();
  const subscription = {
    id: "subscription-one", updatedAt: 2, lastUpdated: 2, name: "Fixture",
    url: "https://fixture.example/subscription.json", sourceIds: ["victim", "other"],
  };
  const existing = [
    { id: "victim", updatedAt: 1, name: "Standalone", baseUrl: "https://standalone.example", group: "normal", kind: "standalone" },
    { id: "other", updatedAt: 1, name: "Other", baseUrl: "https://other.example", group: "normal", kind: "subscription", subscriptionId: "subscription-two" },
  ];
  const result = prepareSubscriptionResync(existing, subscription, [
    { id: "victim", updatedAt: 3, name: "Overwrite", baseUrl: "https://overwrite.example" },
    { id: "other", updatedAt: 3, name: "Overwrite other", baseUrl: "https://overwrite-other.example" },
  ], "standard", 10);

  assert.deepEqual(result, { error: "conflict", conflictingIds: ["other", "victim"] });
});
