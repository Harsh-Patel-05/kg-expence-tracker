/**
 * Loud Kilogram website-order siren/chime.
 *
 * Browsers block audio until a user gesture. We arm on the first click/tap/key
 * anywhere in the app (login counts), keep the AudioContext alive, and flush
 * any pending alert immediately so new orders ring without clicking the modal.
 */

type AudioCtx = AudioContext;
type AlertKind = "phrase" | "ping";

let sharedCtx: AudioCtx | null = null;
let unlocked = false;
let unlockBound = false;
let master: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let keepAliveOsc: OscillatorNode | null = null;
let keepAliveGain: GainNode | null = null;
let pendingKind: AlertKind | null = null;
let htmlAudio: HTMLAudioElement | null = null;
const armedListeners = new Set<() => void>();

function getCtx(): AudioCtx | null {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!sharedCtx || sharedCtx.state === "closed") {
      sharedCtx = new Ctx();
      master = sharedCtx.createGain();
      master.gain.value = 0.95;
      compressor = sharedCtx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;
      master.connect(compressor);
      compressor.connect(sharedCtx.destination);
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

function out(): AudioNode | null {
  getCtx();
  return master;
}

function startKeepAlive(ctx: AudioCtx) {
  if (keepAliveOsc) return;
  try {
    keepAliveGain = ctx.createGain();
    keepAliveGain.gain.value = 0.00001; // inaudible, keeps context warm
    keepAliveOsc = ctx.createOscillator();
    keepAliveOsc.type = "sine";
    keepAliveOsc.frequency.value = 20;
    keepAliveOsc.connect(keepAliveGain);
    keepAliveGain.connect(ctx.destination);
    keepAliveOsc.start();
  } catch {
    keepAliveOsc = null;
    keepAliveGain = null;
  }
}

function notifyArmed() {
  armedListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function flushPending() {
  if (!pendingKind) return;
  const kind = pendingKind;
  pendingKind = null;
  playOnlineOrderAlert(kind);
}

/** Resume AudioContext; safe to call often. */
export async function unlockOnlineOrderSound() {
  const ctx = getCtx();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const ok = ctx.state === "running";
    if (ok) {
      const firstArm = !unlocked;
      unlocked = true;
      startKeepAlive(ctx);
      flushPending();
      if (firstArm) notifyArmed();
    }
    return ok;
  } catch {
    return false;
  }
}

/**
 * Attach once for the whole app: login / nav / any tap unlocks audio for the session.
 */
export function installOnlineOrderSoundAutoUnlock() {
  if (unlockBound || typeof window === "undefined") return;
  unlockBound = true;

  const arm = () => {
    void unlockOnlineOrderSound();
  };

  window.addEventListener("pointerdown", arm, { capture: true, passive: true });
  window.addEventListener("keydown", arm, { capture: true });
  window.addEventListener("touchstart", arm, { capture: true, passive: true });
  window.addEventListener("click", arm, { capture: true, passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void unlockOnlineOrderSound();
  });
  window.addEventListener("focus", () => {
    void unlockOnlineOrderSound();
  });

  void unlockOnlineOrderSound();
}

/** Fires when audio becomes ready — use to ring immediately if orders are waiting. */
export function onOnlineOrderSoundArmed(cb: () => void) {
  armedListeners.add(cb);
  if (isOnlineOrderSoundUnlocked()) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
  return () => {
    armedListeners.delete(cb);
  };
}

export function isOnlineOrderSoundUnlocked() {
  return unlocked && sharedCtx?.state === "running";
}

function blip(
  ctx: AudioCtx,
  dest: AudioNode,
  {
    freq,
    start,
    dur,
    type = "square",
    peak = 0.42,
    slideTo
  }: {
    freq: number;
    start: number;
    dur: number;
    type?: OscillatorType;
    peak?: number;
    slideTo?: number;
  }
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(60, slideTo), start + dur * 0.9);
  }
  const p = Math.min(0.85, Math.max(0.05, peak));
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(p, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(p * 0.65, start + dur * 0.4);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(start);
  osc.stop(start + dur + 0.03);
}

/** Tiny WAV fallback for environments where HTMLAudio plays more reliably. */
function ensureHtmlBeep() {
  if (htmlAudio) return htmlAudio;
  // 0.35s 980Hz square-ish PCM mono 8kHz
  const sampleRate = 8000;
  const seconds = 0.35;
  const n = Math.floor(sampleRate * seconds);
  const data = new Uint8Array(44 + n);
  const view = new DataView(data.buffer);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) data[o + i] = s.charCodeAt(i);
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeStr(36, "data");
  view.setUint32(40, n, true);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.min(1, i / 200) * Math.min(1, (n - i) / 400);
    const square = Math.sin(2 * Math.PI * 980 * t) > 0 ? 1 : -1;
    data[44 + i] = Math.max(0, Math.min(255, Math.floor(128 + square * env * 110)));
  }
  const blob = new Blob([data], { type: "audio/wav" });
  htmlAudio = new Audio(URL.createObjectURL(blob));
  htmlAudio.preload = "auto";
  htmlAudio.volume = 1;
  return htmlAudio;
}

function playHtmlFallback() {
  try {
    const a = ensureHtmlBeep();
    a.currentTime = 0;
    void a.play().catch(() => undefined);
  } catch {
    /* ignore */
  }
}

/**
 * Loud alert. Queues until audio is armed if the browser still blocks playback.
 */
export function playOnlineOrderAlert(kind: AlertKind = "phrase") {
  const ctx = getCtx();
  const dest = out();
  if (!ctx || !dest) {
    pendingKind = kind;
    playHtmlFallback();
    return;
  }

  if (ctx.state === "suspended") {
    pendingKind = kind;
    void ctx.resume().then(() => {
      if (ctx.state === "running") {
        const firstArm = !unlocked;
        unlocked = true;
        startKeepAlive(ctx);
        flushPending();
        if (firstArm) notifyArmed();
      }
    });
    playHtmlFallback();
    return;
  }

  unlocked = true;
  startKeepAlive(ctx);

  const t0 = ctx.currentTime + 0.01;

  if (kind === "ping") {
    blip(ctx, dest, { freq: 980, start: t0, dur: 0.12, type: "square", peak: 0.55 });
    blip(ctx, dest, { freq: 1310, start: t0 + 0.11, dur: 0.16, type: "square", peak: 0.6 });
    blip(ctx, dest, { freq: 1640, start: t0 + 0.24, dur: 0.2, type: "sawtooth", peak: 0.45, slideTo: 1200 });
    blip(ctx, dest, { freq: 980, start: t0 + 0.48, dur: 0.12, type: "square", peak: 0.5 });
    blip(ctx, dest, { freq: 1480, start: t0 + 0.58, dur: 0.22, type: "square", peak: 0.58 });
    return;
  }

  const burst = (offset: number) => {
    const seq: Array<{ f: number; at: number; dur: number; peak: number; type: OscillatorType }> = [
      { f: 740, at: 0, dur: 0.11, peak: 0.5, type: "square" },
      { f: 880, at: 0.1, dur: 0.11, peak: 0.55, type: "square" },
      { f: 1046, at: 0.2, dur: 0.12, peak: 0.6, type: "square" },
      { f: 1318, at: 0.32, dur: 0.18, peak: 0.65, type: "sawtooth" },
      { f: 1568, at: 0.48, dur: 0.28, peak: 0.7, type: "square" }
    ];
    for (const n of seq) {
      blip(ctx, dest, {
        freq: n.f,
        start: t0 + offset + n.at,
        dur: n.dur,
        type: n.type,
        peak: n.peak
      });
      blip(ctx, dest, {
        freq: n.f * 2,
        start: t0 + offset + n.at + 0.008,
        dur: n.dur * 0.65,
        type: "triangle",
        peak: n.peak * 0.35
      });
    }
  };

  burst(0);
  burst(0.85);
}
