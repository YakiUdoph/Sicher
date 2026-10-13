import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const host = "127.0.0.1";
const port = Number(process.env.SICHER_DEPLOYMENT_PORT ?? "4173");
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("SICHER_DEPLOYMENT_PORT must be an integer from 1024 to 65535.");
}
const root = resolve("deployment-tool");
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/token.html", ["token.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/token-app.js", ["token-app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/deployment-config.json", ["deployment-config.json", "application/json; charset=utf-8"]],
  ["/token-deployment-config.json", ["token-deployment-config.json", "application/json; charset=utf-8"]],
]);

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", `http://${host}:${port}`).pathname;
  const entry = files.get(pathname);
  if (!entry) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const [file, contentType] = entry;
    const body = await readFile(resolve(root, file));
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(body);
  } catch {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Local deployment tool file unavailable");
  }
});

server.listen(port, host, () => {
  console.log(`Sicher deployment tool: http://${host}:${port}`);
  console.log("No wallet connection or deployment occurs until initiated in the browser.");
});
