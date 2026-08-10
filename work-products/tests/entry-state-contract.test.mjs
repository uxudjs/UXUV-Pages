import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

test("classifies setup and session startup failures without weakening the public-host guard", () => {
  const runtime = read("components/RuntimeConfigProvider.tsx");

  assert.match(runtime, /issue:\s*RuntimeIssue/);
  assert.match(runtime, /issue:\s*["']setup["']/);
  assert.match(runtime, /issue:\s*["']session["']/);
  assert.ok(
    runtime.indexOf("isDirectPagesHost(window.location.hostname)") < runtime.indexOf('fetch("/api/config"'),
    "the direct Pages host must be classified before API requests",
  );
  assert.doesNotMatch(runtime, /localStorage|sessionStorage|Authorization\s*:/);
});

test("renders localized public, loading, retry, expiry, and permission states", () => {
  const publicPage = read("components/PublicPage.tsx");
  const gate = read("components/PasswordGate.tsx");
  const adminGate = read("components/AdminGate.tsx");
  const settings = read("app/settings/page.tsx");

  assert.match(publicPage, /useLocale\(\)/);
  assert.match(publicPage, /Open the full application from your UXUVideo Worker domain/);
  assert.match(gate, /尚未完成设置/);
  assert.match(gate, /工作階段服務暫時無法使用/);
  assert.match(gate, /autoFocus/);
  assert.match(adminGate, /useLocale\(\)/);
  assert.match(adminGate, /showFallback/);
  assert.match(adminGate, /Only super_admin can view and modify accounts/);
  assert.match(settings, /<AdminGate showFallback>/);
  assert.doesNotMatch(`${publicPage}\n${gate}\n${adminGate}`, /Authorization\s*:/);
});
