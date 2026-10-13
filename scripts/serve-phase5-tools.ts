import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const host = "127.0.0.1";
const port = Number(process.env.SICHER_PHASE5_PORT ?? "4175");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("SICHER_PHASE5_PORT must be 1024-65535.");
const root = resolve("phase5-tool");
const allowed = new Set(["/", "/setup-transfer.html", "/commitment.html", "/experiment.html", "/experiment-transfer.html", "/reset.html", "/helper-deployment.html", "/app.js", "/style.css", "/config.json", "/predeployment.json", "/commitment-preparation.json", "/commitment2-preparation.json", "/verified-commitment.json", "/verified-commitment2.json", "/verified-fresh-helper.json", "/experiment-state.json", "/experiment2-state.json", "/commitment1-final.json"]);
const contentTypes: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", `http://${host}:${port}`).pathname;
  if (!allowed.has(pathname)) { response.writeHead(404); response.end("Not found"); return; }
  const file = pathname === "/" ? "setup-transfer.html" : pathname.slice(1);
  try {
    const body = await readFile(resolve(root, file));
    response.writeHead(200, { "Content-Type": contentTypes[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(body);
  } catch { response.writeHead(500); response.end("Local Phase 5 tool file unavailable"); }
});
server.listen(port, host, () => {
  console.log(`Sicher Phase 5 local tools: http://${host}:${port}`);
  console.log("Opening this server does not connect a wallet or send a transaction.");
});
