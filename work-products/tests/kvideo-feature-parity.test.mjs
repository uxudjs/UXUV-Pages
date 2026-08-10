import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const pagesRoot = fileURLToPath(new URL("../..", import.meta.url));
const workerRoot = fileURLToPath(new URL("../../../UXUVideo/", import.meta.url));
const matrixPath = fileURLToPath(new URL("../../../UXUVideo/work-products/kvideo-parity-matrix.md", import.meta.url));
const inventoryPath = fileURLToPath(new URL("./fixtures/kvideo-4.9.19/source-inventory.json", import.meta.url));
const baselineManifestPath = fileURLToPath(new URL("./fixtures/kvideo-4.9.19/baseline-manifest.json", import.meta.url));
const observationPath = fileURLToPath(new URL("./fixtures/uxuv-pages-0.1.2/observed-dom.json", import.meta.url));
const redBaselinePath = fileURLToPath(new URL("../kvideo-red-baseline.md", import.meta.url));

const referenceCommit = "28334f41407082ae1028fa4a4180bcc46d31c52a";
const workerCommit = "e7e397e520f90433f98eb1f929fc5d135bacfec0";
const pagesCommit = "4bc847affa76755a5c99ce249d793aa43e0b83bb";
const allowedStatuses = new Set(["unverified", "pass", "approved-difference"]);

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function markdownCells(line) {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}

function matrixRows(markdown) {
  return markdown.split(/\r?\n/)
    .filter((line) => /^\|\s*[A-Z][A-Z0-9-]*-[A-Z]?\d{3}\s*\|/.test(line))
    .map((line) => {
      const [id, capability, referenceEntry, targetEntry, mappings, status, notes] = markdownCells(line);
      return { id, capability, referenceEntry, targetEntry, mappings, status, notes };
    });
}

function mappingKeys(markdown) {
  const section = markdown.split("测试映射缩写：")[1]?.split("## GLB")[0] ?? "";
  return new Set(section.split(/\r?\n/)
    .map(markdownCells)
    .filter((cells) => /^`[A-Z0-9]+`$/.test(cells[0] ?? ""))
    .map(([key]) => key.slice(1, -1)));
}

function architectureRows(markdown) {
  const section = markdown.split("## 唯一批准的架构差异登记（不属于对照 ID）")[1]
    ?.split("## 完成门")[0] ?? "";
  return section.split(/\r?\n/)
    .map(markdownCells)
    .filter((cells) => cells.length === 4 && cells[0] && cells[0] !== "差异类别" && !/^---$/.test(cells[0]));
}

function readInventory() {
  assert.ok(existsSync(inventoryPath), "T01 source inventory fixture is missing");
  return JSON.parse(readFileSync(inventoryPath, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function referenceTreeFiles() {
  return git(workerRoot, "ls-tree", "-r", "--format=%(objectname)%x09%(path)", referenceCommit)
    .split(/\r?\n/)
    .map((line) => {
      const [objectId, path] = line.split("\t");
      return { path, objectId };
    })
    .filter(({ path }) => /^(app|components|lib|public|tests)\//.test(path)
      || ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json"].includes(path));
}

test("T01 freezes the KVideo, Worker, and Pages identities", () => {
  assert.equal(git(workerRoot, "cat-file", "-t", referenceCommit), "commit");
  assert.equal(JSON.parse(git(workerRoot, "show", `${referenceCommit}:package.json`)).version, "4.9.19");
  assert.equal(git(workerRoot, "rev-parse", "HEAD"), workerCommit);
  assert.equal(git(pagesRoot, "rev-parse", "HEAD"), pagesCommit);
  assert.equal(JSON.parse(git(pagesRoot, "show", `${pagesCommit}:package.json`)).version, "0.1.2");
});

test("T01 source inventory is complete and pinned to Git objects", () => {
  const inventory = readInventory();
  assert.equal(inventory.schemaVersion, 1);
  assert.deepEqual(inventory.identities, {
    reference: { commit: referenceCommit, tree: git(workerRoot, "rev-parse", `${referenceCommit}^{tree}`), version: "4.9.19" },
    worker: { commit: workerCommit, tree: git(workerRoot, "rev-parse", `${workerCommit}^{tree}`), version: "1.0.0" },
    pages: { commit: pagesCommit, tree: git(pagesRoot, "rev-parse", `${pagesCommit}^{tree}`), version: "0.1.2" },
  });
  assert.deepEqual(inventory.files, referenceTreeFiles());
  for (const category of ["routes", "apiRoutes", "components", "hooks", "stores", "styles", "tests", "publicAssets", "localization"]) {
    assert.ok(Array.isArray(inventory.categories[category]) && inventory.categories[category].length > 0, `${category} inventory is empty`);
  }
  for (const required of [
    "app/page.tsx",
    "app/player/page.tsx",
    "app/settings/page.tsx",
    "components/player/CustomVideoPlayer.tsx",
    "components/LocaleProvider.tsx",
    "lib/store/settings-store.ts",
    "app/styles/variables.css",
    "tests/tag-management-view.test.ts",
  ]) {
    assert.ok(inventory.files.some(({ path }) => path === required), `${required} is absent from the frozen inventory`);
  }
});

test("T01 matrix has 273 unique, fully mapped user capabilities", () => {
  const markdown = readFileSync(matrixPath, "utf8");
  const rows = matrixRows(markdown);
  const mappings = mappingKeys(markdown);
  const inventoryPaths = readInventory().files.map(({ path }) => path);

  assert.equal(rows.length, 273);
  assert.equal(new Set(rows.map(({ id }) => id)).size, rows.length);
  assert.deepEqual([...new Set(rows.map(({ status }) => status).filter((status) => !allowedStatuses.has(status)))], []);

  for (const row of rows) {
    assert.ok(row.capability, `${row.id} is missing its user capability`);
    assert.ok(row.referenceEntry, `${row.id} is missing its fixed reference entry`);
    assert.match(row.targetEntry ?? "", /^UXUV-Pages:|^UXUVideo:/, `${row.id} is missing its target entry`);
    assert.ok(row.mappings, `${row.id} is missing its test mapping`);
    for (const mapping of row.mappings.split(",").map((value) => value.trim())) {
      assert.ok(mappings.has(mapping), `${row.id} uses unknown test mapping ${mapping}`);
    }

    const referenceTokens = [...row.referenceEntry.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    for (const token of referenceTokens.filter((value) => /[./*]/.test(value))) {
      const normalized = token.replaceAll("\\", "/");
      const prefix = normalized.replace(/\*+.*$/, "");
      const found = inventoryPaths.some((path) => path === normalized
        || path.endsWith(`/${normalized}`)
        || path.endsWith(`/${basename(normalized)}`)
        || (prefix && path.startsWith(prefix))
        || (prefix && path.includes(`/${prefix}`)));
      assert.ok(found, `${row.id} fixed entry ${token} is absent from the frozen source inventory`);
    }
  }
});

test("T40 closes every capability with attributable evidence", () => {
  const rows = matrixRows(readFileSync(matrixPath, "utf8"));
  assert.deepEqual(rows.filter(({ status }) => status === "unverified").map(({ id }) => id), []);
  for (const row of rows) assert.ok(row.notes, `${row.id} is missing closure evidence`);
});

test("T01 keeps approved architecture differences outside the capability ID namespace", () => {
  const markdown = readFileSync(matrixPath, "utf8");
  const rows = architectureRows(markdown);
  assert.equal(rows.length, 6);
  for (const [category, reference, target, basis] of rows) {
    assert.doesNotMatch(category, /[A-Z][A-Z0-9-]*-[A-Z]?\d{3}/);
    assert.ok(reference && target);
    assert.match(basis, /^SPEC 13\.3/);
  }
});

test("T02 baseline manifest pins all deterministic DOM and screenshot fixtures", () => {
  assert.ok(existsSync(baselineManifestPath), "T02 baseline manifest is missing");
  const manifest = JSON.parse(readFileSync(baselineManifestPath, "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.reference, {
    commit: referenceCommit,
    tree: git(workerRoot, "rev-parse", `${referenceCommit}^{tree}`),
    dependencyEnvironment: "../../../../../UXUVideo/node_modules",
  });
  assert.deepEqual(manifest.environment, {
    locale: "zh-CN",
    timezone: "Asia/Taipei",
    fixedTime: "2026-08-08T08:00:00.000+08:00",
    colorScheme: "dark",
    chromium: "151.0.7922.76",
    viewportHeight: 900,
    widths: [320, 768, 1024, 1440],
    thirdPartyNetwork: "blocked",
  });
  assert.equal(manifest.captures.length, 33);

  const expectedCaptures = new Set([
    ...["home", "favorites", "iptv", "player", "premium", "premium-favorites", "premium-settings", "settings"]
      .flatMap((route) => [320, 768, 1024, 1440].map((width) => `${route}:${width}`)),
    "login:1024",
  ]);
  assert.deepEqual(new Set(manifest.captures.map(({ route, width }) => `${route}:${width}`)), expectedCaptures);
  for (const capture of manifest.captures) {
    const domPath = fileURLToPath(new URL(`./fixtures/kvideo-4.9.19/${capture.dom}`, import.meta.url));
    const screenshotPath = fileURLToPath(new URL(`./fixtures/kvideo-4.9.19/${capture.screenshot}`, import.meta.url));
    assert.ok(existsSync(domPath), `${capture.dom} is missing`);
    assert.ok(existsSync(screenshotPath), `${capture.screenshot} is missing`);
    assert.equal(sha256(domPath), capture.domSha256, `${capture.dom} hash drifted`);
    assert.equal(sha256(screenshotPath), capture.screenshotSha256, `${capture.screenshot} hash drifted`);
  }
});

test("T02 records one reproducible RED row for every capability ID", () => {
  assert.ok(existsSync(observationPath), "T02 UXUV-Pages observation is missing");
  const observation = JSON.parse(readFileSync(observationPath, "utf8"));
  assert.equal(observation.schemaVersion, 1);
  assert.equal(observation.pagesCommit, pagesCommit);
  assert.equal(observation.pagesVersion, "0.1.2");
  assert.deepEqual(observation.viewport, { width: 1024, height: 900 });
  assert.deepEqual(Object.keys(observation.routes).sort(), [
    "favorites", "home", "iptv", "player", "premium", "premium-favorites", "premium-settings", "settings",
  ]);

  assert.ok(existsSync(redBaselinePath), "T02 RED baseline report is missing");
  const markdown = readFileSync(redBaselinePath, "utf8");
  const rows = markdown.split(/\r?\n/)
    .filter((line) => /^\|\s*[A-Z][A-Z0-9-]*-[A-Z]?\d{3}\s*\|/.test(line))
    .map(markdownCells);
  assert.equal(rows.length, 273);
  assert.equal(new Set(rows.map(([id]) => id)).size, 273);
  assert.ok(rows.every(([, , referenceHash, observedHash, status]) => (
    /^`[a-f0-9]{64}`$/.test(referenceHash)
    && /^`[a-f0-9]{64}`$/.test(observedHash)
    && referenceHash !== observedHash
    && status === "RED"
  )));
  assert.match(markdown, new RegExp(referenceCommit));
  assert.match(markdown, new RegExp(pagesCommit));
  assert.doesNotMatch(markdown, /NOT_RED/);
});
