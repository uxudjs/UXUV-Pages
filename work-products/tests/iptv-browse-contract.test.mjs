import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("IPTV composes source management and a source-group-channel browser", async () => {
  const [experience, manager, browser] = await Promise.all([
    read("../../components/IptvExperience.tsx"),
    read("../../components/iptv/IPTVSourceManager.tsx"),
    read("../../components/iptv/IPTVChannelBrowser.tsx"),
  ]);
  assert.match(experience, /loadIptvSources\(/);
  assert.match(experience, /<IPTVSourceManager/);
  assert.match(experience, /<IPTVChannelBrowser/);
  assert.match(manager, /userAgent/);
  assert.match(manager, /referer/);
  for (const stage of ["source", "group", "channel"]) assert.match(browser, new RegExp(`data-iptv-stage=["']${stage}["']`));
  assert.match(browser, /PAGE_SIZE/);
  assert.match(browser, /data-focusable/);
  assert.match(browser, /ArrowRight/);
  assert.match(browser, /ArrowLeft/);
});

test("IPTV keeps permission, loading, cache, failure, empty, and three-locale status copy explicit", async () => {
  const experience = await read("../../components/IptvExperience.tsx");
  assert.match(experience, /iptv_access/);
  assert.match(experience, /cached/);
  assert.match(experience, /loading/);
  assert.match(experience, /error/);
  assert.match(experience, /empty/);
  for (const locale of ["zh-CN", "zh-TW"]) assert.match(experience, new RegExp(`"${locale}"`));
  assert.match(experience, /\ben:\s*\{/);
});
