import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("T16 parses import previews fail-closed for secrets, invalid rows, and duplicates", () => {
  const policy = read("lib/content/source-import.ts");
  assert.match(policy, /MAX_IMPORT_BYTES/);
  assert.match(policy, /SENSITIVE_KEY/);
  assert.match(policy, /duplicates/);
  assert.match(policy, /invalid/);
  assert.match(policy, /normalizeSourceDraft/);
});

test("T16 uses one authenticated same-origin fetch boundary and four keyboard modal tabs", () => {
  const policy = read("lib/content/source-import.ts");
  const modal = read("components/settings/ImportModal.tsx");
  const settings = read("components/settings/SourceSettings.tsx");
  assert.match(policy, /fetch\("\/api\/source-import"/);
  assert.match(policy, /method:\s*"POST"/);
  assert.match(policy, /credentials:\s*"same-origin"/);
  assert.match(policy, /JSON\.stringify\(\{ url \}\)/);
  assert.match(policy, /signal/);
  assert.doesNotMatch(policy, /fetch\(url/);
  for (const tab of ["json", "file", "link", "subscription"]) assert.match(modal, new RegExp(tab));
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /focusable/);
  assert.match(modal, /subscriptionOwnedSourceIds/);
  assert.match(modal, /existingSources/);
  assert.match(modal, /onResyncSubscription/);
  assert.match(modal, /pendingSubscription/);
  assert.match(settings, /ImportModal/);
  assert.match(settings, /prepareSubscriptionResync/);
  assert.match(settings, /onResyncSubscription=\{resyncSubscription\}/);
  assert.match(settings, /applyRecordChanges\("config"/);
});
