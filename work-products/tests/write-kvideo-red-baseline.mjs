import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

const pagesRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixtureRoot = fileURLToPath(new URL("./fixtures/kvideo-4.9.19/", import.meta.url));
const matrixPath = fileURLToPath(new URL("../../../UXUVideo/work-products/kvideo-parity-matrix.md", import.meta.url));
const observationPath = fileURLToPath(new URL("./fixtures/uxuv-pages-0.1.2/observed-dom.json", import.meta.url));
const outputPath = fileURLToPath(new URL("../kvideo-active-red-baseline.md", import.meta.url));

const sha256 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function activeIds(markdown) {
  let retired = false;
  const ids = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (line.includes("approved-retired-by-SPEC-21")) retired = true;
    else if (/^## /.test(line)) retired = false;
    const id = line.match(/^\|\s*([A-Z][A-Z0-9-]*-[A-Z]?\d{3})\s*\|/)?.[1];
    if (id && !retired) ids.push(id);
  }
  return ids;
}

const ids = activeIds(readFileSync(matrixPath, "utf8"));
const observed = JSON.parse(readFileSync(observationPath, "utf8"));

function routeForId(id) {
  if (/^(SRC|SET|DAT)-/.test(id)) return "settings";
  if (/^FAV-/.test(id)) return "favorites";
  if (/^PRE-/.test(id)) return "premium";
  if (/^(HIS|PLY-|DAN|ADS|EXT)-/.test(id) || /^PLY-[ACS]/.test(id)) return "player";
  return "home";
}

const rows = ids.map((id) => {
  const route = routeForId(id);
  const reference = JSON.parse(readFileSync(`${fixtureRoot}dom/${route}-1024.json`, "utf8"));
  const referenceHash = sha256(reference);
  const observedHash = sha256(observed.routes[route]);
  return { id, route, referenceHash, observedHash, status: referenceHash === observedHash ? "NOT_RED" : "RED" };
});
if (rows.length !== 250 || rows.some(({ status }) => status !== "RED")) {
  throw new Error(`Expected 250 active RED capability rows, received ${rows.filter(({ status }) => status === "RED").length}.`);
}

const lines = [
  "# KVideo 4.9.19 → UXUV-Pages 0.1.2 活跃 RED 基线",
  "",
  "状态：**RED（250/250）**。这是仍活跃能力的失败证据，不是功能通过或发布证据。",
  "",
  "- KVideo 参考 commit：`28334f41407082ae1028fa4a4180bcc46d31c52a`",
  "- UXUV-Pages 对象 commit：`4bc847affa76755a5c99ce249d793aa43e0b83bb`（版本 `0.1.2`）",
  "- 环境：Chromium 151、`zh-CN`、`Asia/Taipei`、固定时钟、1024×900；外部网络阻断。",
  "- 断言方式：浏览器实际渲染的文本、角色、交互数量、主要边界和设计 token 组成路由状态指纹。多个 ID 可共享同一路由状态，但每个 ID 都有独立失败测试与哈希记录；不是源码字符串检查。",
  "- 可复验命令：运行 `node --test work-products/tests/kvideo-capability-red.test.mjs`（预期 250 个活跃能力失败），随后运行 `node work-products/tests/write-kvideo-red-baseline.mjs`。",
  "",
  "| ID | 共享路由状态 | KVideo 指纹 | 0.1.2 指纹 | 结果 |",
  "| --- | --- | --- | --- | --- |",
  ...rows.map(({ id, route, referenceHash, observedHash, status }) => `| ${id} | ${route} | \`${referenceHash}\` | \`${observedHash}\` | ${status} |`),
  "",
  "视觉截图由同一 Playwright 运行生成；首次 KVideo 基线必须经用户审阅后，才允许进入 T03。",
  "",
];
writeFileSync(outputPath, lines.join("\n"));
console.log(relative(pagesRoot, outputPath).replaceAll("\\", "/"));
