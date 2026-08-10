import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const source = await readFile(new URL("../../lib/iptv/playlist.ts", import.meta.url), "utf8");
const javascript = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
}).outputText;
const playlist = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("parses M3U and M3U8 attributes, relative URLs, headers, and duplicate routes", () => {
  const parsed = playlist.parseIptvPlaylist(`#EXTM3U\n#EXTINF:-1 tvg-id="news" tvg-name="News HD" tvg-logo="logo.png" group-title="News" http-user-agent="UA-1",News\n#EXTVLCOPT:http-referrer=https://ref.example/\nstream.m3u8\n#EXTINF:-1 group-title="News",News\nhttps://backup.example/news.m3u8`,
    { id: "source-1", name: "Source 1", url: "https://list.example/root/list.m3u", kind: "builtin", updatedAt: 0 });
  assert.equal(parsed.channels.length, 1);
  assert.deepEqual(parsed.groups, ["News"]);
  assert.equal(parsed.channels[0].url, "https://list.example/root/stream.m3u8");
  assert.deepEqual(parsed.channels[0].routes, ["https://list.example/root/stream.m3u8", "https://backup.example/news.m3u8"]);
  assert.equal(parsed.channels[0].userAgent, "UA-1");
  assert.equal(parsed.channels[0].referer, "https://ref.example/");
});

test("parses direct and nested JSON channels with inherited groups and headers", () => {
  const parsed = playlist.parseIptvPlaylist(JSON.stringify({ lives: [{ name: "Sports", channels: [
    { name: "Court", urls: ["court-1.m3u8", "court-2.m3u8"], ua: "UA", referer: "https://sports.example" },
  ] }] }), { id: "json", name: "JSON", url: "https://json.example/config.json", kind: "custom", updatedAt: 0 });
  assert.equal(parsed.channels[0].group, "Sports");
  assert.deepEqual(parsed.channels[0].routes, ["https://json.example/court-1.m3u8", "https://json.example/court-2.m3u8"]);
  assert.equal(parsed.channels[0].sourceId, "json");
  assert.equal(parsed.channels[0].userAgent, "UA");
});

test("extracts bounded JSON playlist references and complete source fields", () => {
  const references = playlist.extractIptvReferences(JSON.stringify({ lives: [{ name: "Remote", url: "child.m3u", ua: "UA" }],
    urls: [{ name: "Config", url: "nested.json" }] }), "https://root.example/config.json");
  assert.deepEqual(references.map(({ kind, url }) => [kind, url]), [
    ["playlist", "https://root.example/child.m3u"], ["config", "https://root.example/nested.json"],
  ]);
  const sources = playlist.parseIptvSources(JSON.stringify([{ name: "Complete", url: "https://list.example/a.json",
    ua: "Agent", referer: "https://ref.example" }]), "custom");
  assert.equal(sources[0].userAgent, "Agent");
  assert.equal(sources[0].referer, "https://ref.example/");
  assert.equal(playlist.parseIptvSources("javascript:alert(1)").length, 0);
});

test("filters source, group, search, and 100-item pages deterministically", () => {
  const channels = Array.from({ length: 205 }, (_, index) => ({
    id: `a:${index}`, name: `Channel ${index}`, url: `https://media.example/${index}.m3u8`, group: index % 2 ? "Odd" : "Even",
    sourceId: index < 150 ? "a" : "b", sourceName: index < 150 ? "A" : "B",
  }));
  const filtered = playlist.filterIptvChannels(channels, { sourceId: "a", group: "Odd", query: "channel" });
  assert.equal(filtered.length, 75);
  assert.equal(playlist.paginateIptvChannels(channels, 1).channels.length, 100);
  assert.equal(playlist.paginateIptvChannels(channels, 3).channels.length, 205);
});
