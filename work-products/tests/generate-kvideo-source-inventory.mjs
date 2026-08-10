import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const pagesRoot = fileURLToPath(new URL("../..", import.meta.url));
const workerRoot = fileURLToPath(new URL("../../../UXUVideo/", import.meta.url));
const outputPath = fileURLToPath(new URL("./fixtures/kvideo-4.9.19/source-inventory.json", import.meta.url));
const referenceCommit = "28334f41407082ae1028fa4a4180bcc46d31c52a";
const workerCommit = "e7e397e520f90433f98eb1f929fc5d135bacfec0";
const pagesCommit = "4bc847affa76755a5c99ce249d793aa43e0b83bb";

function git(root, ...args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

const files = git(workerRoot, "ls-tree", "-r", "--format=%(objectname)%x09%(path)", referenceCommit)
  .split(/\r?\n/)
  .map((line) => {
    const [objectId, path] = line.split("\t");
    return { path, objectId };
  })
  .filter(({ path }) => /^(app|components|lib|public|tests)\//.test(path)
    || ["package.json", "package-lock.json", "next.config.ts", "tsconfig.json"].includes(path));
const paths = files.map(({ path }) => path);
const select = (predicate) => paths.filter(predicate);

const inventory = {
  schemaVersion: 1,
  identities: {
    reference: {
      commit: referenceCommit,
      tree: git(workerRoot, "rev-parse", `${referenceCommit}^{tree}`),
      version: "4.9.19",
    },
    worker: {
      commit: workerCommit,
      tree: git(workerRoot, "rev-parse", `${workerCommit}^{tree}`),
      version: "1.0.0",
    },
    pages: {
      commit: pagesCommit,
      tree: git(pagesRoot, "rev-parse", `${pagesCommit}^{tree}`),
      version: "0.1.2",
    },
  },
  categories: {
    routes: select((path) => /^app\/(?!api\/).+\/(page|layout)\.tsx$/.test(path) || /^app\/(page|layout)\.tsx$/.test(path)),
    apiRoutes: select((path) => /^app\/api\/.+\/route\.ts$/.test(path)),
    components: select((path) => /^components\/.+\.tsx$/.test(path)),
    hooks: select((path) => /(^|\/)hooks\//.test(path) || /(^|\/)use[A-Z][^/]+\.(ts|tsx)$/.test(path)),
    stores: select((path) => /(^|\/)store\//.test(path) || /-store\.ts$/.test(path)),
    styles: select((path) => /\.css$/.test(path)),
    tests: select((path) => /^tests\//.test(path)),
    publicAssets: select((path) => /^public\//.test(path)),
    localization: select((path) => /locale|i18n|language|chinese-convert/i.test(path)),
    copyBearingFiles: select((path) => /^(app|components)\/.+\.tsx$/.test(path)),
  },
  files,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);
