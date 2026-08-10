import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT ?? 4173);
const basePath = "/UXUV-Pages/0.2.0";
const outRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..", "out");
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const rootAsset = new Set(["/icon.png", "/manifest.json", "/sw.js"]).has(pathname);
    if (!rootAsset && pathname !== basePath && !pathname.startsWith(`${basePath}/`)) {
      response.writeHead(404).end();
      return;
    }

    let relativePath = rootAsset ? pathname.slice(1) : pathname.slice(basePath.length).replace(/^\/+/, "");
    if (!relativePath || relativePath.endsWith("/")) relativePath += "index.html";
    let filePath = resolve(outRoot, relativePath);
    if (filePath !== outRoot && !filePath.startsWith(`${outRoot}${sep}`)) {
      response.writeHead(403).end();
      return;
    }

    let metadata = await stat(filePath);
    if (metadata.isDirectory()) {
      filePath = resolve(filePath, "index.html");
      metadata = await stat(filePath);
    }
    response.writeHead(200, {
      "Content-Length": metadata.size,
      "Content-Type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream",
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(port, "127.0.0.1");
