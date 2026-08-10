import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT = /^[0-9a-f]{40}$/i;

function normalizedCommit(value) {
  if (!COMMIT.test(value ?? "")) throw new Error("Release identity requires a full 40-character commit");
  return value.toLowerCase();
}

export function verifyReleaseIdentity({ expectedCommit, githubSha, headCommit }) {
  const expected = normalizedCommit(expectedCommit);
  const trigger = normalizedCommit(githubSha);
  const head = normalizedCommit(headCommit);
  if (expected !== trigger) throw new Error("expectedCommit must equal GITHUB_SHA");
  if (head !== trigger) throw new Error("checked-out HEAD must equal GITHUB_SHA");
  return trigger;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const headCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const commit = verifyReleaseIdentity({
    expectedCommit: process.env.EXPECTED_COMMIT,
    githubSha: process.env.GITHUB_SHA,
    headCommit,
  });
  console.log(`Verified release identity ${commit}`);
}
