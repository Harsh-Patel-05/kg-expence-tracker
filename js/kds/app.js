(function (root) {
  "use strict";

  let unsub = null;
  let user = null;

  function $(id) {
    return document.getElementById(id);
  }

  function t(k) {
    return root.KG.kdsI18n.t(k);
  }

  function setConn(state) {
    const el = $("kdsConn");
    if (!el) return;
    el.classList.toggle("offline", state !== "online");
    if (state === "online") el.textContent = t("online");
    else if (state === "reconnecting") el.textContent = t("reconnecting");
    else el.textContent = t("offline");
  }

  function showApp(show) {
    $("kdsLogin")?.classList.toggle("hidden", show);
    $("kdsApp")?.classList.toggle("hidden", !show);
    if ($("kdsLogin")) $("kdsLogin").style.display = show ? "none" : "block";
    if ($("kdsApp")) $("kdsApp").style.display = show ? "flex" : "none";
    // iPad keyboard: keep page scrollable on login; lock scroll only after sign-in
    document.documentElement.classList.toggle("kds-login-open", !show);
    document.body.classList.toggle("kds-login-open", !show);
  }

  function applyLabels() {
    $("kdsBrand").textContent = t("brand");
    $("kdsLangBtn").textContent = t("lang");
    $("kdsBeepBtn").textContent = t("beep") + (root.KG.kdsAudio.isEnabled() ? " ✓" : "");
    $("kdsLogoutBtn").textContent = t("logout");
    $("loginTitle").textContent = t("loginTitle");
    $("loginHint").textContent = t("loginHint");
    $("kdsEmail").placeholder = t("email");
    $("kdsPassword").placeholder = t("password");
    const emailLab = document.querySelector('label[for="kdsEmail"]');
    const passLab = document.querySelector('label[for="kdsPassword"]');
    if (emailLab) emailLab.textContent = t("email");
    if (passLab) passLab.textContent = t("password");
    $("kdsSignInBtn").textContent = t("signIn");
    setConn(navigator.onLine ? "online" : "offline");
    root.KG.kdsBoard.refreshLabels();
  }

  async function advance(id) {
    try {
      const order = await root.KG.kdsStore.advanceStatus(id, user?.email || "kitchen");
      // Ready Hindi announce comes from board snapshot (announceReady)
      try {
        await root.KG.kdsStore.clearItemHighlights(id);
      } catch (_) {}
    } catch (e) {
      console.warn(e);
      alert(e.message || "Error");
    }
  }

  async function undo(id) {
    try {
      await root.KG.kdsStore.undoStatus(id, user?.email || "kitchen");
    } catch (e) {
      alert(e.message || "Error");
    }
  }

  async function cancel(id) {
    const order = root.KG.kdsBoard.getOrders?.().find((o) => String(o.id || o.orderId) === String(id));
    if (order && order.status !== "waiting") {
      alert(
        root.KG.kdsI18n.getLang() === "hi"
          ? "सिर्फ Waiting ऑर्डर रद्द हो सकता है"
          : "Only waiting orders can be cancelled"
      );
      return;
    }
    if (!confirm(root.KG.kdsI18n.getLang() === "hi" ? "ऑर्डर रद्द करें?" : "Cancel this order?")) return;
    try {
      await root.KG.kdsStore.cancelOrder(id, "kitchen", user?.email || "kitchen");
    } catch (e) {
      alert(e.message || "Error");
    }
  }

  async function setStatus(id, status) {
    try {
      await root.KG.kdsStore.setStatus(id, status, user?.email || "kitchen-drag");
      try {
        await root.KG.kdsStore.clearItemHighlights(id);
      } catch (_) {}
    } catch (e) {
      console.warn(e);
      alert(e.message || "Error");
    }
  }

  function startListening() {
    if (unsub) unsub();
    unsub = root.KG.kdsStore.subscribeActive(
      (list) => {
        setConn("online");
        root.KG.kdsBoard.setOrders(list);
        list
          .filter((o) => o.beepFlag)
          .forEach((o) => {
            root.KG.kdsStore.clearBeep(o.id || o.orderId).catch(() => {});
          });
      },
      (err) => {
        console.error(err);
        setConn("reconnecting");
        const snap = root.KG.kdsOffline.loadSnapshot();
        if (snap?.orders) root.KG.kdsBoard.setOrders(snap.orders, { silent: true });
      }
    );
  }

  async function signIn(email, password) {
    const auth = firebase.auth();
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  }

  async function handleSignIn(e) {
    if (e) e.preventDefault();
    $("kdsLoginError").textContent = "";
    try {
      await signIn($("kdsEmail").value.trim(), $("kdsPassword").value);
    } catch (err) {
      $("kdsLoginError").textContent = err.message || "Login failed";
    }
  }

  function isHomeScreenApp() {
    try {
      if (window.navigator.standalone === true) return true; // iOS Add to Home Screen
      if (window.matchMedia("(display-mode: standalone)").matches) return true;
      if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
      if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
    } catch (_) {}
    return false;
  }

  /**
   * iOS Home Screen / standalone PWA: keyboard often never opens unless
   * readonly is cleared and focus happens on touchstart inside the gesture.
   */
  function enableIpadKeyboard(input) {
    if (!input) return;
    const home = isHomeScreenApp();
    if (home) {
      input.setAttribute("readonly", "readonly");
      input.setAttribute("inputmode", input.type === "password" ? "text" : input.getAttribute("inputmode") || "email");
    }

    const armKeyboard = () => {
      if (input.hasAttribute("readonly")) input.removeAttribute("readonly");
      try {
        input.focus({ preventScroll: false });
      } catch (_) {
        input.focus();
      }
      // Nudge scroll so field sits above keyboard in standalone
      setTimeout(() => {
        try {
          input.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch (_) {
          input.scrollIntoView();
        }
      }, 50);
    };

    // touchstart (not touchend) is required for Home Screen keyboard on iPad/iOS
    input.addEventListener("touchstart", armKeyboard, { passive: true });
    input.addEventListener("pointerdown", armKeyboard);
    input.addEventListener("click", armKeyboard);
    input.addEventListener("focus", () => {
      if (input.hasAttribute("readonly")) input.removeAttribute("readonly");
    });
  }

  function bindUi() {
    if (isHomeScreenApp()) {
      document.documentElement.classList.add("kds-standalone");
      document.body.classList.add("kds-standalone");
    }

    $("kdsLoginForm")?.addEventListener("submit", handleSignIn);
    $("kdsSignInBtn")?.addEventListener("click", handleSignIn);
    enableIpadKeyboard($("kdsEmail"));
    enableIpadKeyboard($("kdsPassword"));

    $("kdsLangBtn")?.addEventListener("click", () => {
      root.KG.kdsI18n.toggle();
      applyLabels();
    });

    $("kdsBeepBtn")?.addEventListener("click", () => {
      // Always unlock from this gesture first (iPad volume gate)
      root.KG.kdsAudio.unlock();
      const next = !root.KG.kdsAudio.isEnabled();
      root.KG.kdsAudio.setEnabled(next);
      root.KG.kdsAudio.unlock();
      if (next) {
        root.KG.kdsAudio.announce?.("test");
      }
      const tip = $("kdsSoundTip");
      if (tip) tip.style.display = next ? "none" : "";
      applyLabels();
    });

    $("kdsLogoutBtn")?.addEventListener("click", () => firebase.auth().signOut());

    window.addEventListener("online", () => {
      setConn("reconnecting");
      startListening();
    });
    window.addEventListener("offline", () => {
      setConn("offline");
      const snap = root.KG.kdsOffline.loadSnapshot();
      if (snap?.orders) root.KG.kdsBoard.setOrders(snap.orders, { silent: true });
    });

    // Unlock audio after login / first board tap — not on login fields (iPad keyboard)
    function unlockSound(ev) {
      if (ev?.target?.closest?.("#kdsLogin, #kdsEmail, #kdsPassword, #kdsLoginForm")) return;
      root.KG.kdsAudio.unlock();
      root.KG.kdsOffline.requestWakeLock();
      const tip = $("kdsSoundTip");
      if (tip) tip.style.display = "none";
      document.body.removeEventListener("pointerdown", unlockSound);
      document.body.removeEventListener("touchstart", unlockSound);
    }
    document.body.addEventListener("pointerdown", unlockSound);
    document.body.addEventListener("touchstart", unlockSound, { passive: true });
  }

  function init() {
    if (!root.firebase?.apps?.length && root.firebaseConfig) {
      firebase.initializeApp(root.firebaseConfig);
    }
    try {
      const fs = firebase.firestore();
      try {
        fs.settings({ experimentalAutoDetectLongPolling: true, merge: true });
      } catch (_) {}
      // Single-tab persistence — multi-tab sync often causes INTERNAL ASSERTION FAILED
      fs.enablePersistence({ synchronizeTabs: false }).catch(() => {});
    } catch (_) {}

    root.KG.kdsBoard.start({ onAdvance: advance, onUndo: undo, onCancel: cancel, onSetStatus: setStatus });
    bindUi();
    applyLabels();
    showApp(false); // ensure login-open scroll mode before auth resolves

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./kds-sw.js?v=20261119fast1").catch(() => {});
    }

    firebase.auth().onAuthStateChanged((u) => {
      user = u;
      if (!u) {
        if (unsub) unsub();
        root.KG.kdsOffline.stopKeepAwake();
        showApp(false);
        return;
      }
      showApp(true);
      root.KG.kdsOffline.startKeepAwake();
      const snap = root.KG.kdsOffline.loadSnapshot();
      if (snap?.orders) root.KG.kdsBoard.setOrders(snap.orders, { silent: true });
      startListening();
      root.KG.kdsStore.pruneOlderThan(90).catch(() => {});
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})(window);
