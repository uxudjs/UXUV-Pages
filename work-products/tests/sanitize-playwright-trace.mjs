import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { yauzl, yazl } = require("playwright-core/lib/utilsBundle");
const pagesRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const workerRoot = resolve(pagesRoot, "../UXUVideo");
const evidenceRoot = resolve(workerRoot, "work-products/evidence/section21");
const machinePath = /(?:^|[\s"'`(])([A-Za-z]:(?:\\{1,2}|\/)(?:Users|Code|Windows|tmp|Temp)(?:\\{1,2}|\/)[^\s"'`]+)/g;
const maximumMemberBytes = 32 * 1024 * 1024;
const maximumArchiveBytes = 128 * 1024 * 1024;

function checkedPath(argument, root, label) {
  assert.ok(argument && !isAbsolute(argument), `${label} must be repository-relative`);
  const target = resolve(pagesRoot, argument);
  assert.ok(target === root || target.startsWith(root + sep), `${label} escaped its allowed repository root`);
  return target;
}

function safeMemberName(value) {
  const name = value.replaceAll("\\", "/");
  assert.ok(name && !name.includes("\0") && !name.startsWith("/") && !/^[A-Za-z]:/.test(name), `unsafe ZIP member: ${name}`);
  assert.ok(!name.split("/").includes(".."), `unsafe ZIP member: ${name}`);
  return name;
}

function decodeText(bytes) {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function replaceRoot(text, root, label) {
  const slash = root.replaceAll("\\", "/");
  const escaped = root.replaceAll("\\", "\\\\");
  return text.replaceAll(escaped, `${label}/`).replaceAll(root, `${label}/`).replaceAll(slash, `${label}/`);
}

function sanitizeText(text) {
  const repositoryRelative = replaceRoot(replaceRoot(text, pagesRoot, "UXUV-Pages"), workerRoot, "UXUVideo");
  return repositoryRelative.replace(machinePath, (match, path) => match.slice(0, match.length - path.length) + "<machine-path>");
}

function openZip(path) {
  return new Promise((resolveZip, rejectZip) => {
    yauzl.open(path, { lazyEntries: true }, (error, zip) => error ? rejectZip(error) : resolveZip(zip));
  });
}

function readEntry(zip, entry) {
  return new Promise((resolveEntry, rejectEntry) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error) return rejectEntry(error);
      const chunks = [];
      let size = 0;
      stream.on("data", (chunk) => {
        size += chunk.length;
        if (size > maximumMemberBytes) stream.destroy(new Error(`ZIP member exceeds limit: ${entry.fileName}`));
        else chunks.push(chunk);
      });
      stream.on("error", rejectEntry);
      stream.on("end", () => resolveEntry(Buffer.concat(chunks)));
    });
  });
}

async function readMembers(path) {
  const zip = await openZip(path);
  const members = [];
  let totalBytes = 0;
  return await new Promise((resolveMembers, rejectMembers) => {
    zip.on("error", rejectMembers);
    zip.on("entry", async (entry) => {
      try {
        const name = safeMemberName(entry.fileName);
        if (!name.endsWith("/")) {
          const bytes = await readEntry(zip, entry);
          totalBytes += bytes.length;
          assert.ok(totalBytes <= maximumArchiveBytes, "ZIP content exceeds archive limit");
          const text = decodeText(bytes);
          members.push({ name, bytes: text === null ? bytes : Buffer.from(sanitizeText(text)) });
        }
        zip.readEntry();
      } catch (error) {
        zip.close();
        rejectMembers(error);
      }
    });
    zip.on("end", () => resolveMembers(members));
    zip.readEntry();
  });
}

async function writeZip(path, members) {
  const temporary = `${path}.tmp-${process.pid}`;
  await mkdir(dirname(path), { recursive: true });
  await rm(temporary, { force: true });
  const zip = new yazl.ZipFile();
  const finished = new Promise((resolveWrite, rejectWrite) => {
    const output = createWriteStream(temporary, { flags: "wx" });
    output.on("close", resolveWrite);
    output.on("error", rejectWrite);
    zip.outputStream.on("error", rejectWrite).pipe(output);
  });
  const mtime = new Date("1980-01-01T00:00:00.000Z");
  for (const member of members) zip.addBuffer(member.bytes, member.name, { mtime });
  zip.end();
  await finished;
  await rm(path, { force: true });
  await rename(temporary, path);
}

const [, , inputArgument, outputArgument] = process.argv;
const input = checkedPath(inputArgument, pagesRoot, "input trace");
const output = checkedPath(outputArgument, evidenceRoot, "output trace");
assert.notEqual(input, output, "input and output trace paths must differ");

const members = await readMembers(input);
assert.ok(members.length > 0, "trace ZIP is empty");
await writeZip(output, members);
const result = await readFile(output);
assert.ok(result.length > 0, "sanitized trace was not written");
process.stdout.write(`Sanitized ${members.length} trace members to ${relative(pagesRoot, output).replaceAll("\\", "/")}\n`);
