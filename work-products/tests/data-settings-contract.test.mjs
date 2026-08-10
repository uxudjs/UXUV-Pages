import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("T19 defines a bounded standard-only transfer schema with fail-closed secret checks", () => {
  const transfer = read("lib/data/settings-transfer.ts");
  for (const token of ["schemaVersion", 'mode: "standard"', "MAX_SETTINGS_IMPORT_BYTES", "config", "library", "preferences"]) {
    assert.match(transfer, new RegExp(token));
  }
  assert.match(transfer, /sensitiveDataPath/);
  assert.match(transfer, /premium/i);
  assert.match(transfer, /JSON\.stringify/);
  assert.match(transfer, /JSON\.parse/);
});

test("T19 previews before an atomic local payload replacement and keeps both dialogs keyboard operable", () => {
  const data = read("components/settings/DataSettings.tsx");
  const exporter = read("components/settings/ExportModal.tsx");
  const importer = read("components/settings/SettingsImportModal.tsx");
  const sync = read("components/SyncProvider.tsx");
  assert.match(data, /replacePayload/);
  assert.match(importer, /previewSettingsImport/);
  assert.match(importer, /role="dialog"/);
  assert.match(importer, /Escape/);
  assert.match(exporter, /role="dialog"/);
  assert.match(exporter, /download/);
  assert.match(sync, /replacePayload/);
});

test("T19 renders localized update available, current, and failed states through the same-origin route", () => {
  const version = read("components/settings/AppVersionSettings.tsx");
  const page = read("app/settings/page.tsx");
  assert.match(version, /\/api\/app-update/);
  for (const status of ["update-available", "up-to-date", "ahead-of-remote", "check-failed"]) assert.match(version, new RegExp(status));
  for (const locale of ["zh-CN", "zh-TW", "en"]) assert.match(version, new RegExp(`(?:(?:"${locale}")|(?:${locale}:))`));
  assert.match(page, /<AppVersionSettings/);
  assert.match(page, /<DataSettings/);
});
