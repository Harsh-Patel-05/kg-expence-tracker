#!/usr/bin/env node
/**
 * Deploy Firebase Hosting via REST (avoids broken firebase CLI firepit/templates).
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const os = require("os");
const crypto = require("crypto");
const zlib = require("zlib");

const PROJECT = "kilogram-expance-trakker";
const SITE = "kilogram-expance-trakker";
const ROOT = path.resolve(__dirname, "..");
const CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";

function loadTokens() {
  const j = JSON.parse(
    fs.readFileSync(path.join(os.homedir(), ".config/configstore/firebase-tools.json"), "utf8")
  );
  if (!j.tokens?.refresh_token) throw new Error("No refresh_token — run: firebase login");
  console.log("Logged in as:", j.user?.email || "?");
  return j.tokens;
}

function postForm(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = new URLSearchParams(body).toString();
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(data)
        }
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(raw);
            if (res.statusCode >= 400) reject(new Error(JSON.stringify(json)));
            else resolve(json);
          } catch (e) {
            reject(new Error(raw.slice(0, 500)));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function requestJson(method, url, token, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body == null ? null : JSON.stringify(body);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
        }
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : {};
          } catch (_) {
            json = { raw: raw.slice(0, 800) };
          }
          if (res.statusCode >= 400)
            reject(new Error(method + " " + url + " -> " + res.statusCode + " " + JSON.stringify(json)));
          else resolve(json);
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getAccessToken(tokens) {
  const data = await postForm("https://oauth2.googleapis.com/token", {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token"
  });
  if (!data.access_token) throw new Error("Failed to refresh access token: " + JSON.stringify(data));
  return data.access_token;
}

function walkFiles(dir, base, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(base, full).split(path.sep).join("/");
    const parts = rel.split("/");
    const skip = new Set([
      "node_modules",
      "server",
      "web",
      "mobile",
      "src",
      ".git",
      ".cursor",
      "coverage",
      "emulator-data",
      "scripts"
    ]);
    if (parts.some((p) => skip.has(p) || p.startsWith("."))) continue;
    if (ent.isDirectory()) walkFiles(full, base, out);
    else out.push({ full, rel });
  }
}

async function deployHosting(accessToken) {
  console.log("Creating Hosting version...");
  const version = await requestJson(
    "POST",
    `https://firebasehosting.googleapis.com/v1beta1/sites/${SITE}/versions`,
    accessToken,
    {
      config: {
        rewrites: [{ glob: "**", path: "/index.html" }],
        headers: [
          {
            glob: "/kds-sw.js",
            headers: { "Cache-Control": "no-cache", "Service-Worker-Allowed": "/" }
          }
        ]
      }
    }
  );
  const versionName = version.name;
  console.log("Version:", versionName);

  const files = [];
  walkFiles(ROOT, ROOT, files);
  const allowedExt = new Set([
    ".html",
    ".js",
    ".css",
    ".json",
    ".svg",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".ico",
    ".woff",
    ".woff2",
    ".ttf"
  ]);
  const selected = files.filter((f) => allowedExt.has(path.extname(f.rel).toLowerCase()));
  console.log("Files:", selected.length);

  const hashToFile = new Map();
  const fileMap = {};
  for (const f of selected) {
    const raw = fs.readFileSync(f.full);
    const gz = zlib.gzipSync(raw);
    const hash = crypto.createHash("sha256").update(gz).digest("hex");
    fileMap["/" + f.rel] = hash;
    if (!hashToFile.has(hash)) hashToFile.set(hash, gz);
  }

  console.log("Populating...");
  const populate = await requestJson(
    "POST",
    `https://firebasehosting.googleapis.com/v1beta1/${versionName}:populateFiles`,
    accessToken,
    { files: fileMap }
  );
  const uploadUrl = populate.uploadUrl;
  const toUpload = populate.uploadRequiredHashes || [];
  console.log("Upload required:", toUpload.length);

  for (let i = 0; i < toUpload.length; i++) {
    const hash = toUpload[i];
    const gz = hashToFile.get(hash);
    if (!gz) continue;
    await new Promise((resolve, reject) => {
      const u = new URL(`${uploadUrl}/${hash}`);
      const req = https.request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: "POST",
          headers: {
            Authorization: "Bearer " + accessToken,
            "Content-Type": "application/octet-stream",
            "Content-Length": gz.length
          }
        },
        (res) => {
          let raw = "";
          res.on("data", (c) => (raw += c));
          res.on("end", () => {
            if (res.statusCode >= 400)
              reject(new Error("upload fail " + res.statusCode + " " + raw.slice(0, 200)));
            else resolve();
          });
        }
      );
      req.on("error", reject);
      req.write(gz);
      req.end();
    });
    if ((i + 1) % 20 === 0 || i === toUpload.length - 1)
      console.log("Uploaded", i + 1, "/", toUpload.length);
  }

  console.log("Finalizing...");
  await requestJson(
    "PATCH",
    `https://firebasehosting.googleapis.com/v1beta1/${versionName}?update_mask=status`,
    accessToken,
    { status: "FINALIZED" }
  );
  console.log("Releasing live...");
  await requestJson(
    "POST",
    `https://firebasehosting.googleapis.com/v1beta1/sites/${SITE}/channels/live/releases?versionName=${encodeURIComponent(versionName)}`,
    accessToken,
    {}
  );
  console.log("Hosting live: https://" + SITE + ".web.app");
}

(async () => {
  try {
    const tokens = loadTokens();
    console.log("Refreshing access token...");
    const accessToken = await getAccessToken(tokens);
    await deployHosting(accessToken);
    console.log("DEPLOY_OK https://" + SITE + ".web.app");
  } catch (e) {
    console.error("DEPLOY_FAIL", e.message || e);
    process.exit(1);
  }
})();
