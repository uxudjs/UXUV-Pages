import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (path) => readFileSync(join(root, path), "utf8");

test("boots all routes from same-origin config and session without static runtime dependencies", () => {
  for (const path of ["components/RuntimeConfigProvider.tsx", "components/SiteIconProvider.tsx"]) {
    assert.equal(existsSync(join(root, path)), true, `${path} must exist`);
  }

  const provider = read("components/RuntimeConfigProvider.tsx");
  const icon = read("components/SiteIconProvider.tsx");
  const gate = read("components/PasswordGate.tsx");
  const layout = read("app/layout.tsx");
  const combined = `${provider}\n${icon}\n${gate}\n${layout}`;

  assert.match(provider, /release:\s*\{\s*worker:\s*["']["'],\s*pages:\s*["']0\.3\.0["'],\s*apiContract:\s*2\s*\}/);
  assert.doesNotMatch(provider, /subscriptionSources|iptvSources|danmakuApiUrl|capabilities:\s*\{[^}]*iptv/);
  assert.match(provider, /Promise\.all\([\s\S]*fetch\(["']\/api\/config["'][\s\S]*fetch\(["']\/api\/auth\/session["']/);
  assert.match(provider, /isDirectPagesHost\(window\.location\.hostname\)/);
  assert.ok(
    provider.indexOf("isDirectPagesHost(window.location.hostname)") < provider.indexOf('fetch("/api/config"'),
    "direct Pages detection must happen before runtime API requests",
  );
  assert.match(provider, /credentials:\s*["']same-origin["']/);
  assert.match(provider, /thirdPartyScripts[\s\S]*videoTogether[\s\S]*enabled:\s*false/);
  assert.match(provider, /adKeywords/);
  assert.match(provider, /capabilities/);
  assert.match(layout, /<RuntimeConfigProvider>[\s\S]*<SiteIconProvider>[\s\S]*<PasswordGate>/);
  assert.match(gate, /useRuntimeConfig\(\)/);
  assert.match(icon, /document\.title/);
  assert.doesNotMatch(combined, /node:fs|from ["']fs["']|process\.env|server-only|localStorage|sessionStorage/);
});
