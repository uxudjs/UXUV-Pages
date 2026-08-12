import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("T20 verifies Premium authorization server-side without a third-party probe", () => {
  const client = read("lib/content/premium-client.ts");
  const settings = read("components/premium/PremiumSettingsExperience.tsx");
  assert.match(client, /verifyPremiumAccess/);
  assert.match(client, /enabled:\s*false/);
  assert.match(client, /\/api\/premium\/types/);
  assert.match(settings, /locked/);
  assert.match(settings, /unlockPremium/);
  assert.match(settings, /verifyPremiumAccess/);
});

test("T20 composes a localized Premium settings page from mode-isolated controls", () => {
  const settings = read("components/premium/PremiumSettingsExperience.tsx");
  const sources = read("components/settings/SourceSettings.tsx");
  const player = read("lib/hooks/usePlayerSettings.ts");
  for (const token of ['mode="premium"', "PlayerSettings", "DisplaySettings", "SourceSettings"]) {
    assert.match(settings, new RegExp(token));
  }
  assert.match(sources, /mode.*premium/);
  assert.match(sources, /group.*premium/);
  assert.match(sources, /ImportModal/);
  assert.match(player, /premium\./);
  assert.doesNotMatch(settings, /DataSettings/);
  assert.doesNotMatch(settings, /AppVersionSettings/);
  for (const locale of ["zh-CN", "zh-TW", "en"]) assert.match(settings, new RegExp(`(?:(?:"${locale}")|(?:${locale}:))`));
});

test("T20 defines full standard plus Premium export while preserving v1 isolation", () => {
  const transfer = read("lib/data/settings-transfer.ts");
  const data = read("components/settings/DataSettings.tsx");
  assert.match(transfer, /schemaVersion:\s*2/);
  assert.match(transfer, /mode:\s*"all"/);
  assert.match(transfer, /standard/);
  assert.match(transfer, /premium/);
  assert.match(transfer, /buildAllSettingsExport/);
  assert.match(transfer, /preserve/i);
  assert.match(data, /buildAllSettingsExport/);
  assert.match(data, /preferencesFor\(accountId,\s*"premium"\)/);
});
