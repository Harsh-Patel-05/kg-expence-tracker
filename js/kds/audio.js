(function (root) {
  "use strict";

  let unlocked = false;
  let enabled = root.localStorage?.getItem("kg_kds_beep") !== "0";
  let hiVoice = null;
  const queue = [];
  let busy = false;
  let keepAliveTimer = null;

  const LINES = {
    new: "नया ऑर्डर आया है",
    update: "ऑर्डर अपडेट हुआ है",
    ready: "ऑर्डर तैयार है",
    cancel: "ऑर्डर रद्द हो गया",
    test: "आवाज़ चालू है"
  };

  const LINES_ROMAN = {
    new: "Naya order aaya hai",
    update: "Order update hua hai",
    ready: "Order taiyaar hai",
    cancel: "Order radd ho gaya",
    test: "Aawaaz chalu hai"
  };

  /** Kitchen must hear new + update three full times */
  const REPEAT = {
    new: 3,
    update: 3,
    ready: 1,
    cancel: 1,
    test: 1
  };

  function pickVoice() {
    if (!root.speechSynthesis) return null;
    const voices = root.speechSynthesis.getVoices() || [];
    hiVoice =
      voices.find((v) => /^hi(-|_)/i.test(v.lang)) ||
      voices.find((v) => /hindi/i.test(v.name)) ||
      voices.find((v) => /hi-IN/i.test(v.lang)) ||
      null;
    return hiVoice;
  }

  if (root.speechSynthesis) {
    pickVoice();
    root.speechSynthesis.onvoiceschanged = pickVoice;
    root.setInterval(() => {
      try {
        if (root.speechSynthesis.speaking && root.speechSynthesis.paused) {
          root.speechSynthesis.resume();
        }
      } catch (_) {}
    }, 280);
  }

  function sleep(ms) {
    return new Promise((r) => root.setTimeout(r, ms));
  }

  function googleTtsUrl(text, salt) {
    return (
      "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=hi&q=" +
      encodeURIComponent(text) +
      "&ttsspeed=1&idx=" +
      encodeURIComponent(String(salt || Date.now()))
    );
  }

  function ensureAudioCtx() {
    try {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      const ctx = chime._ctx || (chime._ctx = new AC());
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    } catch (_) {
      return null;
    }
  }

  function playHtmlAudio(src, timeoutMs) {
    return new Promise((resolve) => {
      const a = new Audio();
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        try {
          a.onended = null;
          a.onerror = null;
          a.pause();
          a.removeAttribute("src");
          a.load();
        } catch (_) {}
        resolve(!!ok);
      };
      const t = root.setTimeout(() => finish(false), timeoutMs || 8000);
      a.preload = "auto";
      a.volume = 1;
      try {
        a.muted = false;
      } catch (_) {}
      a.onended = () => {
        root.clearTimeout(t);
        finish(true);
      };
      a.onerror = () => {
        root.clearTimeout(t);
        finish(false);
      };
      // Unique src every call so Safari/Chrome cannot collapse repeats into one play
      a.src = src;
      const p = a.play();
      if (p && p.then) {
        p.then(() => {}).catch(() => {
          root.clearTimeout(t);
          finish(false);
        });
      }
    });
  }

  function speakOne(text, lang) {
    return new Promise((resolve) => {
      if (!root.speechSynthesis) {
        resolve(false);
        return;
      }
      const voice = hiVoice || pickVoice();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang || (voice ? "hi-IN" : "en-IN");
      u.rate = 0.95;
      u.pitch = 1;
      u.volume = 1;
      if (voice) u.voice = voice;
      let finished = false;
      const done = (ok) => {
        if (finished) return;
        finished = true;
        root.clearTimeout(watch);
        resolve(!!ok);
      };
      // Fail-safe: don't block the next repeat forever
      const watch = root.setTimeout(() => done(true), 5000);
      u.onend = () => done(true);
      u.onerror = () => done(false);
      try {
        root.speechSynthesis.speak(u);
        root.setTimeout(() => {
          try {
            root.speechSynthesis.resume();
          } catch (_) {}
        }, 40);
      } catch (_) {
        done(false);
      }
    });
  }

  function chime() {
    try {
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      [0, 0.16, 0.32].forEach((start, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square";
        o.frequency.value = i === 0 ? 880 : i === 1 ? 1175 : 1480;
        const t0 = ctx.currentTime + start;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + 0.18);
      });
    } catch (_) {}
  }

  function lineHi(kind) {
    return LINES[kind] || LINES.update;
  }

  function lineRoman(kind) {
    return LINES_ROMAN[kind] || LINES_ROMAN.update;
  }

  /**
   * Speak/play the same kitchen line N times, with a clear gap between each.
   * Chime + Google Hindi TTS + device speech fallback so volume always fires.
   */
  async function playRepeated(kind, times) {
    const hi = lineHi(kind);
    const roman = lineRoman(kind);
    const voice = hiVoice || pickVoice();

    for (let i = 0; i < times; i++) {
      if (!enabled) return;

      chime();
      await sleep(80);

      // 1) Google Hindi TTS — unique URL each pass (critical for 3×)
      const okNet = await playHtmlAudio(googleTtsUrl(hi, `${kind}-${i}-${Date.now()}`), 7000);

      // 2) Device voice — always as backup if network TTS failed / silent
      if (!okNet) {
        if (voice) {
          await speakOne(hi, "hi-IN");
        } else {
          await speakOne(roman, "en-IN");
        }
      }

      // Gap so the 3 repeats are clearly separate (not one blurred phrase)
      if (i < times - 1) await sleep(650);
    }
  }

  async function playKind(kind) {
    if (!enabled) return;
    const times = REPEAT[kind] || 1;
    ensureAudioCtx();
    await playRepeated(kind, times);
  }

  function drain() {
    if (busy || !queue.length || !enabled) return;
    // iPad/Safari: do not consume the queue until a user gesture unlocked audio
    if (!unlocked) return;
    busy = true;
    const kind = queue.shift();
    playKind(kind)
      .catch(() => {})
      .finally(() => {
        busy = false;
        drain();
      });
  }

  function enqueue(kind) {
    if (!enabled) return;
    // If same alert already waiting, don't stack; if playing, allow one more after
    if (queue.includes(kind)) return;
    queue.push(kind);
    drain();
  }

  function announce(kind) {
    enqueue(kind || "update");
  }

  function announceNew() {
    announce("new");
  }
  function announceUpdate() {
    announce("update");
  }
  function announceReady() {
    announce("ready");
  }
  function announceCancel() {
    announce("cancel");
  }

  function beep() {
    announceUpdate();
  }
  function ring() {
    announceNew();
  }

  function startKeepAlive() {
    if (keepAliveTimer) return;
    keepAliveTimer = root.setInterval(() => {
      if (!unlocked || !enabled) return;
      ensureAudioCtx();
      try {
        if (root.speechSynthesis?.speaking && root.speechSynthesis.paused) {
          root.speechSynthesis.resume();
        }
      } catch (_) {}
    }, 2000);
  }

  function unlock() {
    unlocked = true;
    ensureAudioCtx();
    startKeepAlive();

    // Prime a silent/short play from user gesture (iPad requirement)
    try {
      const a = new Audio(
        "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA"
      );
      a.volume = 1;
      a.play().then(() => a.pause()).catch(() => {});
    } catch (_) {}

    if (root.speechSynthesis) {
      try {
        root.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(enabled ? lineRoman("test") : " ");
        u.lang = "hi-IN";
        u.volume = enabled ? 1 : 0.01;
        const voice = hiVoice || pickVoice();
        if (voice) {
          u.voice = voice;
          u.text = enabled ? lineHi("test") : " ";
        }
        root.speechSynthesis.speak(u);
        root.setTimeout(() => {
          try {
            root.speechSynthesis.resume();
          } catch (_) {}
        }, 40);
      } catch (_) {}
    }

    // Flush any alerts that arrived before the first tap
    drain();

    if (enabled) {
      // One test only (not 3×) so unlock stays quick — chime + TTS
      root.setTimeout(() => {
        if (!enabled || !unlocked) return;
        chime();
        playHtmlAudio(googleTtsUrl(lineHi("test"), "unlock-" + Date.now()), 5000).then((ok) => {
          if (!ok) speakOne(lineRoman("test"), "en-IN");
        });
      }, 120);
    }
  }

  function isUnlocked() {
    return unlocked;
  }

  function setEnabled(v) {
    enabled = !!v;
    root.localStorage?.setItem("kg_kds_beep", enabled ? "1" : "0");
    if (!enabled) {
      queue.length = 0;
      busy = false;
      try {
        root.speechSynthesis?.cancel();
      } catch (_) {}
    } else if (unlocked) {
      drain();
    }
  }

  function isEnabled() {
    return enabled;
  }

  root.KG = root.KG || {};
  root.KG.kdsAudio = {
    beep,
    ring,
    announce,
    announceNew,
    announceUpdate,
    announceReady,
    announceCancel,
    unlock,
    isUnlocked,
    setEnabled,
    isEnabled,
    LINES
  };
})(typeof window !== "undefined" ? window : globalThis);
