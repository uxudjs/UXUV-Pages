import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildRelease } from "../scripts/build-release.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const releaseRoot = join(root, "work-products/tests/work/local-manifest-evidence");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

rmSync(releaseRoot, { recursive: true, force: true });
try {
  const result = buildRelease({
    sourceDir: join(root, "out"),
    releaseRoot,
    licensePath: join(root, "LICENSE"),
    version: packageJson.version,
    gitCommit: baseCommit,
    apiContract: 1,
    workerRange: ">=1.0.0 <2.0.0",
  });
  const bytes = readFileSync(result.manifestPath);
  const manifest = JSON.parse(bytes);
  console.log(JSON.stringify({
    pagesVersion: packageJson.version,
    baseCommit,
    validationManifestSha256: createHash("sha256").update(bytes).digest("hex"),
    assetCount: Object.keys(manifest.assets).length,
  }));
} finally {
  rmSync(releaseRoot, { recursive: true, force: true });
}
