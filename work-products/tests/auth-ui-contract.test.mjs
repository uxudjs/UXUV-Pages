import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

test("guards GitHub Pages before authentication and keeps sessions cookie-only", () => {
  for (const path of [
    "lib/store/auth-store.ts",
    "components/PasswordGate.tsx",
    "components/AdminGate.tsx",
  ]) {
    assert.equal(existsSync(join(root, path)), true, `${path} must exist`);
  }

  const store = read("lib/store/auth-store.ts");
  const gate = read("components/PasswordGate.tsx");
  const runtime = read("components/RuntimeConfigProvider.tsx");
  const layout = read("app/layout.tsx");
  const combined = `${store}\n${gate}\n${runtime}\n${layout}`;

  assert.match(store, /hostname\.toLowerCase\(\)\.endsWith\(["']\.github\.io["']\)/);
  assert.match(runtime, /if \(isDirectPagesHost\(window\.location\.hostname\)\)/);
  assert.ok(
    runtime.indexOf("isDirectPagesHost(window.location.hostname)") < runtime.indexOf('fetch("/api/config"'),
    "direct Pages detection must happen before any authentication request",
  );
  assert.match(gate, /fetch\(["']\/api\/auth\/session["']/);
  assert.match(gate, /credentials:\s*["']same-origin["']/);
  assert.match(gate, /useRuntimeConfig\(\)/);
  assert.match(layout, /<PasswordGate>[\s\S]*\{children\}[\s\S]*<\/PasswordGate>/);
  assert.doesNotMatch(combined, /localStorage|sessionStorage|Authorization\s*:/);
});

test("uses relative account APIs and exposes management only to super_admin", () => {
  const adminGate = read("components/AdminGate.tsx");
  const settings = read("components/settings/AccountSettings.tsx");

  assert.match(adminGate, /session\?\.role !== ["']super_admin["']/);
  assert.match(settings, /fetch\(["']\/api\/auth\/accounts["']/);
  assert.match(settings, /`\/api\/auth\/accounts\/\$\{accountId\}`/);
  assert.match(settings, /method:\s*["']POST["']/);
  assert.match(settings, /method:\s*["']PATCH["']/);
  assert.match(settings, /method:\s*["']DELETE["']/);
  assert.doesNotMatch(settings, /passwordHash|passwordSalt|token|localStorage|sessionStorage/);
});
