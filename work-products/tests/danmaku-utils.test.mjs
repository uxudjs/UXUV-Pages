import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

const sourceUrl = new URL("../../lib/player/danmaku-utils.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const javascript = transpileModule(source, {
  compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
}).outputText;
const danmaku = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

test("danmaku comments are normalized, sorted, and bounded", () => {
  const comments = danmaku.parseDanmakuResponse({ comments: [
    { p: "12.5,5,16711680", m: "top" },
    { p: "3,4,255", m: "bottom" },
    { time: 8, type: "scroll", color: "#00ff00", text: "scroll" },
    { time: -1, text: "negative" },
    { time: Number.POSITIVE_INFINITY, text: "infinite" },
    { time: 9, type: "unknown", text: "bad type" },
  ] });

  assert.deepEqual(comments, [
    { text: "bottom", time: 3, type: "bottom", color: "#0000ff" },
    { text: "scroll", time: 8, type: "scroll", color: "#00ff00" },
    { text: "top", time: 12.5, type: "top", color: "#ff0000" },
  ]);

  const oversized = Array.from({ length: danmaku.MAX_DANMAKU_COMMENTS + 20 }, (_, index) => ({
    time: index,
    text: `comment-${index}`,
  }));
  assert.equal(danmaku.parseDanmakuResponse(oversized).length, danmaku.MAX_DANMAKU_COMMENTS);
});

test("search results reject malformed entries and match title and episode", () => {
  const results = danmaku.parseSearchResults({ animes: [
    { animeId: "anime-1", animeTitle: "测试动画", episodes: [
      { episodeId: "episode-1", episodeTitle: "第十二集" },
      { episodeId: "episode-2", episodeTitle: "第十三集" },
    ] },
    { animeId: "", animeTitle: "invalid", episodes: [] },
  ] });

  assert.equal(results.length, 1);
  const title = danmaku.fuzzyMatchTitle(results, "测试动画");
  assert.equal(title?.animeId, "anime-1");
  assert.equal(danmaku.matchEpisode(title.episodes, "第12集", 0)?.episodeId, "episode-1");
});

