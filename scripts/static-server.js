#!/usr/bin/env node
/**
 * Serves the project root over HTTP. Port: STATIC_PORT or WEB_PORT, default 8765.
 * If that port is busy, tries the next ports up to +40 (avoids killing other tools on 8080).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const start = Number(process.env.STATIC_PORT || process.env.WEB_PORT || 8765);
const maxPort = start + 40;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function handler(req, res) {
  const raw = decodeURIComponent((req.url || "/").split("?")[0]);
  let rel = raw === "/" ? "index.html" : raw.replace(/^\//, "");
  rel = path.normalize(rel);
  if (rel.startsWith("..") || rel.includes(`${path.sep}..`)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  const filePath = path.join(root, rel);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", mime[ext] || "application/octet-stream");
    res.writeHead(200);
    res.end(data);
  });
}

function listen(port) {
  const server = http.createServer(handler);
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE" && port < maxPort) {
      listen(port + 1);
      return;
    }
    console.error(e.message);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(`Static site: http://localhost:${port}/`);
  });
}

listen(start);
