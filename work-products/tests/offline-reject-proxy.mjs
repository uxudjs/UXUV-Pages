import { createServer } from "node:http";

const host = "127.0.0.1";
const port = 4174;
let ordinaryRejected = 0;
let connectRejected = 0;

const server = createServer((request, response) => {
  const controlRequest = request.headers.host === `${host}:${port}`;
  if (controlRequest && request.method === "GET" && request.url === "/__offline/health") {
    response.writeHead(204, { "Cache-Control": "no-store" }).end();
    return;
  }
  if (controlRequest && request.method === "GET" && request.url === "/__offline/status") {
    const body = Buffer.from(JSON.stringify({ ordinaryRejected, connectRejected }));
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": body.length,
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(body);
    return;
  }

  ordinaryRejected += 1;
  response.writeHead(403, { "Connection": "close", "Content-Type": "text/plain; charset=utf-8" });
  response.end("offline boundary");
});

server.on("connect", (_request, socket) => {
  connectRejected += 1;
  socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
});

server.on("clientError", (_error, socket) => socket.destroy());
server.listen(port, host);
