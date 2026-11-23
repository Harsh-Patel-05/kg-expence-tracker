/**
 * Firebase Auth + role gate for The Kilogram ERP.
 * Roles: owner | manager | kitchen | accountant | employee
 */
(function () {
  const ROLES = ["owner", "manager", "kitchen", "accountant", "employee"];

  /** Sections each role can open (owner = all). */
  const ROLE_SECTIONS = {
    owner: null, // all
    manager: [
      "dashboard",
      "sales",
      "supplier",
      "expenses",
      "balance-transfer",
      "investments",
      "daily-closing",
      "staff",
      "analytics",
      "menu",
      "pos",
      "scheduled",
      "kds",
      "inventory",
      "reminders",
      "documents",
      "backup"
    ],
    kitchen: ["dashboard", "pos", "scheduled", "kds", "menu", "inventory", "reminders", "documents"],
    accountant: [
      "dashboard",
      "sales",
      "supplier",
      "expenses",
      "balance-transfer",
      "investments",
      "daily-closing",
      "analytics",
      "scheduled",
      "reminders",
      "documents",
      "backup"
    ],
    employee: ["dashboard", "pos", "scheduled", "reminders", "documents"]
  };

  let auth = null;
  let currentUser = null;
  let currentProfile = null;
  let readyResolve;
  const readyPromise = new Promise((r) => {
    readyResolve = r;
  });

  function normalizeRole(role) {
    const r = String(role || "employee").toLowerCase().trim();
    return ROLES.includes(r) ? r : "employee";
  }

  function canAccessSection(sectionName) {
    const role = normalizeRole(currentProfile?.role);
    if (role === "owner") return true;
    const list = ROLE_SECTIONS[role] || ROLE_SECTIONS.employee;
    return list.includes(sectionName);
  }

  async function ensureAuth() {
    if (!window.firebase?.auth) throw new Error("Firebase Auth SDK not loaded");
    if (!firebase.apps?.length && window.firebaseConfig) {
      firebase.initializeApp(window.firebaseConfig);
    }
    auth = firebase.auth();
    return auth;
  }

  async function fetchProfile(uid) {
    try {
      const get = window.firebaseDB?.getDocById;
      if (typeof get === "function") {
        return await get("users", uid);
      }
      const snap = await firebase.firestore().collection("users").doc(uid).get();
      if (!snap.exists) return null;
      return { id: snap.id, ...snap.data() };
    } catch (e) {
      console.warn("Profile fetch failed", e);
      return null;
    }
  }

  async function upsertProfile(uid, data) {
    const payload = {
      ...data,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    const fb = window.firebaseDB;
    if (fb?.getDocById && fb?.updateData) {
      try {
        const existing = await fb.getDocById("users", uid);
        if (existing) {
          await fb.updateData("users", uid, payload);
          return;
        }
      } catch (_) {}
    }
    await firebase.firestore().collection("users").doc(uid).set(
      {
        ...payload,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );
  }

  async function countUsers() {
    try {
      const snap = await firebase.firestore().collection("users").limit(2).get();
      return snap.size;
    } catch {
      return 0;
    }
  }

  function applyNavGate() {
    document.querySelectorAll(".nav-item[data-section]").forEach((el) => {
      const section = el.getAttribute("data-section");
      const ok = canAccessSection(section);
      el.style.display = ok ? "" : "none";
      el.classList.toggle("nav-locked", !ok);
    });
    // legacy nav without data-section: parse onclick
    document.querySelectorAll('.nav-item[onclick*="showSection"]').forEach((el) => {
      if (el.hasAttribute("data-section")) return;
      const m = String(el.getAttribute("onclick") || "").match(/showSection\('([^']+)'\)/);
      if (!m) return;
      el.setAttribute("data-section", m[1]);
      const ok = canAccessSection(m[1]);
      el.style.display = ok ? "" : "none";
    });
  }

  function updateTopbarUser() {
    const nameEl = document.getElementById("kgUserName");
    const roleEl = document.getElementById("kgUserRole");
    const wrap = document.getElementById("kgUserChip");
    if (!wrap) return;
    const email = currentUser?.email || "";
    const name = currentProfile?.displayName || email.split("@")[0] || "User";
    const role = normalizeRole(currentProfile?.role);
    if (nameEl) nameEl.textContent = name;
    if (roleEl) roleEl.textContent = role;
    wrap.hidden = false;
    const hero = document.querySelector(".dash-title");
    if (hero) hero.textContent = `Welcome back, ${name} 👋`;
  }

  async function onUser(user) {
    currentUser = user;
    if (!user) {
      currentProfile = null;
      readyResolve({ user: null, profile: null });
      return;
    }
    let profile = await fetchProfile(user.uid);
    if (!profile) {
      const n = await countUsers();
      const role = n === 0 ? "owner" : "employee";
      await upsertProfile(user.uid, {
        email: user.email || "",
        displayName: user.displayName || (user.email || "").split("@")[0] || "User",
        role
      });
      profile = await fetchProfile(user.uid);
    }
    currentProfile = profile || {
      email: user.email,
      displayName: user.displayName || "User",
      role: "employee"
    };
    window.__kgUser = { uid: user.uid, email: user.email, ...currentProfile };
    applyNavGate();
    updateTopbarUser();
    readyResolve({ user, profile: currentProfile });
    window.dispatchEvent(new CustomEvent("kg-auth-ready", { detail: window.__kgUser }));
  }

  async function login(email, password) {
    await ensureAuth();
    const cred = await auth.signInWithEmailAndPassword(String(email).trim(), password);
    await onUser(cred.user);
    return cred.user;
  }

  async function register({ email, password, displayName, role }) {
    await ensureAuth();
    const n = await countUsers();
    const finalRole = n === 0 ? "owner" : normalizeRole(role || "employee");
    const cred = await auth.createUserWithEmailAndPassword(String(email).trim(), password);
    if (displayName) {
      try {
        await cred.user.updateProfile({ displayName: String(displayName).trim() });
      } catch (_) {}
    }
    await upsertProfile(cred.user.uid, {
      email: cred.user.email || email,
      displayName: String(displayName || "").trim() || (email || "").split("@")[0],
      role: finalRole
    });
    await onUser(cred.user);
    return { user: cred.user, role: finalRole, isFirstUser: n === 0 };
  }

  async function logout() {
    await ensureAuth();
    await auth.signOut();
    currentUser = null;
    currentProfile = null;
    window.__kgUser = null;
    window.location.replace("login.html");
  }

  function requireAuthPage() {
    const path = (location.pathname || "").toLowerCase();
    const isLogin = path.endsWith("login.html") || path.endsWith("/login");
    return !isLogin;
  }

  async function boot() {
    try {
      await ensureAuth();
    } catch (e) {
      console.error(e);
      readyResolve({ user: null, profile: null, error: e });
      return;
    }

    auth.onAuthStateChanged(async (user) => {
      if (!user && requireAuthPage()) {
        readyResolve({ user: null, profile: null });
        const ret = encodeURIComponent(location.pathname.split("/").pop() || "index.html");
        location.replace(`login.html?next=${ret}`);
        return;
      }
      if (user && !requireAuthPage()) {
        const params = new URLSearchParams(location.search);
        const next = params.get("next") || "index.html";
        location.replace(next);
        return;
      }
      await onUser(user);
    });
  }

  window.KgAuth = {
    ROLES,
    ROLE_SECTIONS,
    ready: () => readyPromise,
    login,
    register,
    logout,
    canAccessSection,
    applyNavGate,
    getUser: () => currentUser,
    getProfile: () => currentProfile,
    normalizeRole
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
