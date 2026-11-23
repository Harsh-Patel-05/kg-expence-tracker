#!/usr/bin/env node
/** Generate Hindi KDS announce MP3s via Microsoft Edge TTS (edge-tts). */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "assets/kds-voice");
const venv = path.join(root, ".venv-tts");
const py = path.join(venv, "bin/python");
const pip = path.join(venv, "bin/pip");

fs.mkdirSync(out, { recursive: true });

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) process.exit(r.status || 1);
}

if (!fs.existsSync(py)) {
  run("python3", ["-m", "venv", venv]);
  run(pip, ["install", "-q", "edge-tts"]);
}

const script = `
import asyncio, edge_tts, os
out = ${JSON.stringify(out)}
os.makedirs(out, exist_ok=True)
lines = {
  "new": "नया ऑर्डर आया है",
  "update": "ऑर्डर अपडेट हुआ है",
  "ready": "ऑर्डर तैयार है",
  "cancel": "ऑर्डर रद्द हो गया",
  "test": "आवाज़ चालू है",
}
VOICE = "hi-IN-SwaraNeural"
async def main():
  for k, text in lines.items():
    path = os.path.join(out, k + ".mp3")
    await edge_tts.Communicate(text, VOICE, rate="+5%").save(path)
    print(k, os.path.getsize(path))
asyncio.run(main())
`;

run(py, ["-c", script]);
console.log("VOICE_OK", out);
