#!/usr/bin/env node
/**
 * Deploy Firestore + Storage rules (+ indexes) via REST (firebase CLI firepit broken).
 * Releases are updated by delete + recreate (PATCH body is rejected by API).
 */
const fs = require("fs");
const path = require("path");
const https = require("https");
const os = require("os");

const PROJECT = "kilogram-expance-trakker";
const CLIENT_ID = "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com";
const CLIENT_SECRET = "j9iVZfS8kkCEFUPaAeJV0sAi";
const ROOT = path.resolve(__dirname, "..");

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
            const j = JSON.parse(raw);
            if (res.statusCode >= 400) reject(new Error(JSON.stringify(j)));
            else resolve(j);
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
            reject(
              new Error(method + " " + url + " -> " + res.statusCode + " " + JSON.stringify(json))
            );
          else resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function createRuleset(token, fileName, content) {
  const { json } = await requestJson(
    "POST",
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
    token,
    { source: { files: [{ name: fileName, content }] } }
  );
  if (!json.name) throw new Error("No ruleset name: " + JSON.stringify(json));
  return json.name;
}

async function publishRelease(token, releaseId, rulesetName) {
  const releaseName = `projects/${PROJECT}/releases/${releaseId}`;
  const releaseUrl = `https://firebaserules.googleapis.com/v1/${releaseName}`;

  // Delete existing release if present, then create fresh
  try {
    await requestJson("GET", releaseUrl, token);
    await requestJson("DELETE", releaseUrl, token);
    console.log("Removed old release:", releaseId);
  } catch (e) {
    if (!String(e.message).includes("404") && !String(e.message).includes("NOT_FOUND")) {
      // continue — create may still work
      console.warn("Release get/delete note:", String(e.message).slice(0, 160));
    }
  }

  await requestJson(
    "POST",
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`,
    token,
    { name: releaseName, rulesetName }
  );
  console.log("Published release:", releaseId);
}

async function deployIndexes(token) {
  const indexesPath = path.join(ROOT, "firestore.indexes.json");
  if (!fs.existsSync(indexesPath)) {
    console.log("No firestore.indexes.json");
    return;
  }
  const spec = JSON.parse(fs.readFileSync(indexesPath, "utf8"));
  const indexes = spec.indexes || [];
  console.log("Firestore indexes in file:", indexes.length);
  let created = 0;
  let skipped = 0;
  for (const idx of indexes) {
    const body = {
      queryScope: idx.queryScope || "COLLECTION",
      fields: (idx.fields || []).map((f) => {
        const o = { fieldPath: f.fieldPath };
        if (f.order) o.order = f.order;
        if (f.arrayConfig) o.arrayConfig = f.arrayConfig;
        return o;
      })
    };
    try {
      await requestJson(
        "POST",
        `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/collectionGroups/${encodeURIComponent(idx.collectionGroup)}/indexes`,
        token,
        body
      );
      created++;
      console.log("Index create:", idx.collectionGroup);
    } catch (e) {
      const msg = String(e.message);
      if (msg.includes("ALREADY_EXISTS") || msg.includes("409") || msg.includes("already exists")) {
        skipped++;
      } else {
        console.warn("Index warn:", idx.collectionGroup, msg.slice(0, 240));
      }
    }
  }
  console.log("Indexes created:", created, "skipped/existing:", skipped);
}

async function resolveStorageBuckets(token) {
  const buckets = new Set([`${PROJECT}.appspot.com`, `${PROJECT}.firebasestorage.app`]);
  try {
    const { json } = await requestJson(
      "GET",
      `https://firebasestorage.googleapis.com/v1beta/projects/${PROJECT}/buckets`,
      token
    );
    for (const b of json.buckets || []) {
      const name = String(b.name || "").replace(/^projects\/[^/]+\/buckets\//, "");
      if (name) buckets.add(name);
    }
  } catch (e) {
    console.warn("Bucket list note:", String(e.message).slice(0, 160));
  }
  return [...buckets];
}

async function main() {
  const j = JSON.parse(
    fs.readFileSync(path.join(os.homedir(), ".config/configstore/firebase-tools.json"), "utf8")
  );
  console.log("Logged in as:", j.user?.email || "?");
  console.log("Refreshing access token...");
  const tok = await postForm("https://oauth2.googleapis.com/token", {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: j.tokens.refresh_token,
    grant_type: "refresh_token"
  });
  const token = tok.access_token;
  if (!token) throw new Error("no access token");

  console.log("\n== Firestore rules ==");
  const firestoreRules = fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8");
  const fsRuleset = await createRuleset(token, "firestore.rules", firestoreRules);
  console.log("Ruleset:", fsRuleset);
  await publishRelease(token, "cloud.firestore", fsRuleset);

  console.log("\n== Storage rules ==");
  const storageRules = fs.readFileSync(path.join(ROOT, "storage.rules"), "utf8");
  const stRuleset = await createRuleset(token, "storage.rules", storageRules);
  console.log("Ruleset:", stRuleset);
  const buckets = await resolveStorageBuckets(token);
  let storageOk = 0;
  for (const bucket of buckets) {
    try {
      await publishRelease(token, `firebase.storage/${bucket}`, stRuleset);
      storageOk++;
    } catch (e) {
      console.warn("Storage release skip:", bucket, String(e.message).slice(0, 200));
    }
  }
  if (!storageOk) console.warn("No storage release published (bucket may not exist yet)");

  console.log("\n== Firestore indexes ==");
  await deployIndexes(token);

  console.log("\nRULES_DEPLOY_OK");
}

main().catch((e) => {
  console.error("RULES_DEPLOY_FAIL", e.message || e);
  process.exit(1);
});
