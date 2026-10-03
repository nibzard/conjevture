import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, resolve, sep } from "node:path";
import { createApi } from "./api.mjs";
const root = fileURLToPath(new URL("../../.game-build/", import.meta.url));
export async function createGameServer(options = {}) {
  const api = await createApi(options);
  const types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
  };
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.startsWith("/api/")) {
        await api(request, response, pathname);
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      if (pathname === "/" || pathname === "/examples/signal-workshop") {
        response
          .writeHead(302, { Location: "/examples/signal-workshop/" + url.search })
          .end();
        return;
      }
      const path = resolve(
        root,
        "." + pathname + (pathname.endsWith("/") ? "index.html" : ""),
      );
      if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await readFile(path);
      response.writeHead(200, {
        "Content-Type": types[extname(path)] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response
        .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
        .end("Page not found.");
    }
  });
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = await createGameServer();
  const port = Number(process.env.PORT ?? 4173),
    host = process.env.HOST ?? "127.0.0.1";
  server.on("error", (error) => {
    console.error(`Cannot start Night Shift: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, host, () =>
    console.log(
      `Night Shift: http://${host}:${port} · live Jev ${process.env.TYPESAFE_API_KEY ? "configured" : "not configured"}`,
    ),
  );
}
