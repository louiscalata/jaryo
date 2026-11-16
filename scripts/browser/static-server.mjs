// Static file server for the browser scripts. Loopback only; serves regular files inside the lab root.
// Imports Node built-ins only, so scripts/test_static_server.mjs can test it without Playwright.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

export const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".md": "text/markdown", ".txt": "text/plain" };

export function isInsideRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

// Request handler: 405 for other methods, 400 for a malformed path, 403 outside the root (also through a symlink),
// 404 for anything that is not a regular file. It never throws for a bad request.
export function createStaticHandler(labDir) {
  const labRoot = fs.realpathSync(path.resolve(labDir));
  return (req, res) => {
    const reply = (status) => {
      if (res.destroyed) return;
      res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
      res.end();
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("allow", "GET, HEAD");
      return reply(405);
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url || "/", "http://127.0.0.1").pathname);
      if (pathname.includes("\0")) return reply(400);
    } catch {
      return reply(400);
    }
    const target = path.resolve(labRoot, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!isInsideRoot(labRoot, target)) return reply(403);
    let file;
    try {
      file = fs.realpathSync(target);
      if (!isInsideRoot(labRoot, file)) return reply(403);
      if (!fs.statSync(file).isFile()) return reply(404);
    } catch {
      return reply(404);
    }
    const headers = { "content-type": types[path.extname(file)] || "application/octet-stream" };
    if (req.method === "HEAD") {
      res.writeHead(200, headers);
      return res.end();
    }
    const stream = fs.createReadStream(file);
    stream.once("error", () => {
      if (res.headersSent) res.destroy();
      else reply(404);
    });
    stream.once("open", () => {
      if (res.destroyed) return stream.destroy();
      res.writeHead(200, headers);
      stream.pipe(res);
    });
    res.once("close", () => stream.destroy());
  };
}

export function createStaticServer(labDir) {
  return http.createServer(createStaticHandler(labDir));
}

export function listenLoopback(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    try {
      server.listen(0, "127.0.0.1");
    } catch (error) {
      server.off("error", onError);
      server.off("listening", onListening);
      reject(error);
    }
  });
}

export async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections?.();
  });
}
