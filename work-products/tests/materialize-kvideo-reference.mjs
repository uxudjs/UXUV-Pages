import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const pagesRoot = fileURLToPath(new URL("../..", import.meta.url));
const workerRoot = fileURLToPath(new URL("../../../UXUVideo/", import.meta.url));
const workRoot = resolve(pagesRoot, "work-products/tests/work");
const targetRoot = resolve(workRoot, "kvideo-reference");
const archivePath = resolve(workRoot, "kvideo-reference.tar");
const referenceCommit = "28334f41407082ae1028fa4a4180bcc46d31c52a";

if (targetRoot === workRoot || !targetRoot.startsWith(`${workRoot}${sep}`)) {
  throw new Error("Refusing to materialize outside work-products/tests/work.");
}
if (!existsSync(resolve(workerRoot, "node_modules/next/package.json"))) {
  throw new Error("The UXUVideo repository-local dependency environment is unavailable.");
}

mkdirSync(workRoot, { recursive: true });
rmSync(targetRoot, { force: true, recursive: true });
rmSync(archivePath, { force: true });
mkdirSync(targetRoot, { recursive: true });
execFileSync("git", ["-C", workerRoot, "archive", "--format=tar", `--output=${archivePath}`, referenceCommit]);
execFileSync("tar", ["-xf", archivePath, "-C", targetRoot]);
rmSync(archivePath, { force: true });
symlinkSync(resolve(workerRoot, "node_modules"), resolve(targetRoot, "node_modules"), "junction");
writeFileSync(resolve(targetRoot, ".source-identity.json"), `${JSON.stringify({
  commit: referenceCommit,
  tree: execFileSync("git", ["-C", workerRoot, "rev-parse", `${referenceCommit}^{tree}`], { encoding: "utf8" }).trim(),
  dependencyEnvironment: relative(targetRoot, resolve(workerRoot, "node_modules")).replaceAll("\\", "/"),
}, null, 2)}\n`);

console.log(relative(pagesRoot, targetRoot).replaceAll("\\", "/"));
