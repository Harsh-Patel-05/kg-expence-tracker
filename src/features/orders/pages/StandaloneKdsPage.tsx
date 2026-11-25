import { useEffect, useMemo, useRef, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { clsx } from "clsx";
import { auth } from "@/lib/firebase";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { canAccessKds } from "@/features/pos/utils/permissions";
import { useLiveOrders, type LiveOrder } from "../hooks/useLiveOrders";
import { updateKitchenStatus, activateScheduledOrders } from "../services/orderEngine";
import type { KitchenStatus } from "@/features/pos/types";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { MenuItemDoc } from "@/features/pos/types";
import { deriveBaseAndVariant } from "@/features/pos/domain/menuGrouping";
import { inr, isoDate, num } from "@/lib/utils";
import { formatKitchenLineView, parseKitchenLineName } from "@/features/pos/utils/kitchenLineFormat";
import { PRODUCTS } from "@/features/pos/domain/productsCatalog";
import { platformTokenFromId } from "@/features/pos/services/posFirestore";
import { elapsedTone, formatCountdownLabel, formatElapsedLabel, countdownTone } from "../utils/orderTiming";
import "../styles/kds-standalone.css";

type Lang = "hi" | "en";
type Lane = "waiting" | "preparing";

const COPY = {
  hi: {
    title: "किचन लॉगिन",
    hint: "मैनेजर अकाउंट से साइन इन करें",
    email: "ईमेल",
    password: "पासवर्ड",
    signIn: "साइन इन",
    guest: "गेस्ट से जारी रखें",
    brand: "किचन डिस्प्ले",
    online: "ऑनलाइन",
    offline: "ऑफ़लाइन",
    soundTip: "🔊 आवाज़ के लिए एक बार टैप करें",
    beep: "बीप",
    lang: "English",
    logout: "लॉग आउट",
    waiting: "वेटिंग",
    preparing: "तैयार हो रहा",
    empty: "कोई ऑर्डर नहीं",
    advance: "आगे",
    served: "डिलिवर",
    undo: "अनडू",
    cancel: "रद्द",
    note: "नोट",
    table: "टेबल",
    denied: "किचन एक्सेस नहीं है",
    unpaid: "बकाया",
    ready: "तैयार",
    readyCount: "तैयार",
    target: "लक्ष्य",
    eta: "समय",
    updated: "अपडेट",
    takeaway: "टेकअवे",
    dine_in: "डाइन-इन",
    delivery: "डिलिवरी",
    swiggy: "स्विगी",
    zomato: "ज़ोमैटो",
    counter: "काउंटर",
    scheduled: "शेड्यूल्ड"
  },
  en: {
    title: "Kitchen login",
    hint: "Sign in with manager account",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    guest: "Continue as guest",
    brand: "Kitchen Display",
    online: "Online",
    offline: "Offline",
    soundTip: "🔊 Tap once to enable sound",
    beep: "Beep",
    lang: "हिंदी",
    logout: "Log out",
    waiting: "Waiting",
    preparing: "Preparing",
    empty: "No orders",
    advance: "Advance",
    served: "Delivered",
    undo: "Undo",
    cancel: "Cancel",
    note: "Note",
    table: "Table",
    denied: "Kitchen access denied",
    unpaid: "UNPAID",
    ready: "READY",
    readyCount: "ready",
    target: "Target",
    eta: "ETA",
    updated: "UPDATED",
    takeaway: "Takeaway",
    dine_in: "Dine-in",
    delivery: "Delivery",
    swiggy: "Swiggy",
    zomato: "Zomato",
    counter: "Counter",
    scheduled: "Scheduled"
  }
} as const;

function orderTypeLabel(lang: Lang, orderType?: string) {
  const raw = String(orderType || "").toLowerCase().trim().replace(/\s+/g, "_");
  const t = COPY[lang];
  if (raw.includes("swiggy")) return t.swiggy;
  if (raw.includes("zomato")) return t.zomato;
  if (raw.includes("takeaway") || raw.includes("take_away") || raw === "parcel") return t.takeaway;
  if (raw.includes("dine") || raw === "table") return t.dine_in;
  if (raw.includes("delivery")) return t.delivery;
  if (raw.includes("counter")) return t.counter;
  if (raw.includes("schedul")) return t.scheduled;
  return orderType || "—";
}


function boardLane(o: LiveOrder): Lane | "done" {
  const ks = String(o.kitchenStatus || "").toLowerCase();
  const s = String(o.status || "").toLowerCase();
  if (["served", "completed", "delivered", "cancelled", "rejected"].includes(s) || ["served", "completed"].includes(ks)) {
    return "done";
  }
  if (["ready", "packed"].includes(ks) || ["ready", "packed"].includes(s)) return "preparing";
  if (["preparing", "cooking", "plating", "accepted"].includes(ks) || ["preparing", "cooking", "accepted"].includes(s)) {
    return "preparing";
  }
  return "waiting";
}

function isReady(o: LiveOrder) {
  const ks = String(o.kitchenStatus || "").toLowerCase();
  const s = String(o.status || "").toLowerCase();
  return ks === "ready" || ks === "packed" || s === "ready" || s === "packed";
}

function isAgg(o: LiveOrder) {
  const c = String(o.orderType || "").toLowerCase();
  return c.includes("swiggy") || c.includes("zomato") || !!String(o.platformOrderId || "").trim();
}

function displayToken(o: LiveOrder) {
  // Aggregator tickets: show the Swiggy/Zomato ID cashier entered — never shop daily #
  if (isAgg(o)) {
    const raw = String(o.platformOrderId || "").trim();
    if (raw) return raw;
    const tok = String(o.tokenNumber || "").trim();
    if (tok) return tok;
    const plat = platformTokenFromId(o.platformOrderId);
    if (plat) return plat;
    return "----";
  }
  const tok = String(o.tokenNumber || "").trim();
  if (tok) return tok.replace(/^0+/, "") || tok;
  // Legacy invoices like KG-2026-00012 → show 12 (until new daily tokens)
  if (o.invoiceNo) {
    const last = String(o.invoiceNo).split("-").pop() || "";
    const stripped = last.replace(/^0+/, "");
    if (stripped) return stripped;
  }
  return o.id.slice(0, 6);
}

function ageMin(o: LiveOrder) {
  const t = Date.parse(String(o.createdAt || (o as any).confirmedAt || ""));
  if (!Number.isFinite(t)) return o.ageMin || 0;
  return Math.max(0, Math.floor((Date.now() - t) / 60_000));
}

/** KDS only shows today's live tickets — drops stale backlog (days-old unpaid / waiting). */
const KDS_MAX_AGE_MIN = 18 * 60; // 18 hours

function orderBusinessDate(o: LiveOrder) {
  const d = String(o.date || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const t = Date.parse(String(o.createdAt || ""));
  if (Number.isFinite(t)) return isoDate(new Date(t));
  return "";
}

function isFreshKdsOrder(o: LiveOrder) {
  // Prefer age window so timezone/date mismatches never hide live tickets
  if (ageMin(o) > KDS_MAX_AGE_MIN) return false;
  const today = isoDate();
  const biz = orderBusinessDate(o);
  // If we have a business date and it's older than yesterday, drop it
  if (biz && biz < today) {
    const yesterday = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return isoDate(d);
    })();
    if (biz < yesterday) return false;
  }
  return true;
}

function beep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    setTimeout(() => {
      o.stop();
      void ctx.close();
    }, 140);
  } catch {
    /* ignore */
  }
}

function nextStatus(o: LiveOrder): KitchenStatus {
  if (isReady(o)) return "served";
  const lane = boardLane(o);
  if (lane === "waiting") return "preparing";
  return "ready";
}

function prevStatus(o: LiveOrder): KitchenStatus | null {
  if (isReady(o)) return "preparing";
  const lane = boardLane(o);
  if (lane === "preparing") return "new";
  return null;
}

function hiNameFromMenu(lineName: string, menuByBase: Map<string, string>) {
  const parsed = parseKitchenLineName(lineName);
  const key = deriveBaseAndVariant(parsed.base || lineName).base.toLowerCase().trim();
  return menuByBase.get(key) || "";
}

export function StandaloneKdsPage() {
  const { user, role, loading: authLoading, continueAsGuest, logout } = usePosAuth();
  const { allOrders, loading, error } = useLiveOrders();
  const { data: menuItems } = useRestaurantCollection<MenuItemDoc>({ path: "menuItems", max: 600 });
  const menuByBase = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of PRODUCTS) {
      const hi = String(p.nameHi || "").trim();
      if (!hi) continue;
      map.set(String(p.name).toLowerCase().trim(), hi);
      map.set(String(p.id).toLowerCase(), hi);
    }
    for (const m of menuItems) {
      const hi = String(m.nameHi || "").trim();
      if (!hi) continue;
      const baseEn = deriveBaseAndVariant(String(m.name || "")).base.toLowerCase().trim();
      const baseHi = deriveBaseAndVariant(hi).base;
      if (baseEn) map.set(baseEn, baseHi || hi);
    }
    return map;
  }, [menuItems]);
  const updateSeenRef = useRef<Map<string, number>>(new Map());
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("kg_kds_lang") === "en" ? "en" : "hi"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const [flash, setFlash] = useState<{ text: string; kind: string } | null>(null);
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);
  const t = COPY[lang];

  useEffect(() => {
    document.documentElement.classList.add("kds-standalone");
    document.body.classList.add("kds-body", "kds-standalone");
    return () => {
      document.documentElement.classList.remove("kds-standalone");
      document.body.classList.remove("kds-body", "kds-standalone", "kds-login-open");
    };
  }, []);

  useEffect(() => {
    if (!user) document.body.classList.add("kds-login-open");
    else document.body.classList.remove("kds-login-open");
  }, [user]);

  useEffect(() => {
    localStorage.setItem("kg_kds_lang", lang);
  }, [lang]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    void activateScheduledOrders().catch(() => undefined);
    const id = window.setInterval(() => void activateScheduledOrders().catch(() => undefined), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const kitchenOrders = useMemo(() => {
    return allOrders.filter((o) => {
      const lane = boardLane(o);
      if (lane !== "waiting" && lane !== "preparing") return false;
      return isFreshKdsOrder(o);
    });
  }, [allOrders]);

  const columns = useMemo(() => {
    const waiting: LiveOrder[] = [];
    const preparing: LiveOrder[] = [];
    kitchenOrders.forEach((o) => {
      if (boardLane(o) === "waiting") waiting.push(o);
      else preparing.push(o);
    });
    // Most urgent first (least time left / overdue)
    waiting.sort((a, b) => (a.urgencyScore ?? 0) - (b.urgencyScore ?? 0));
    preparing.sort((a, b) => Number(isReady(b)) - Number(isReady(a)) || (a.urgencyScore ?? 0) - (b.urgencyScore ?? 0));
    return { waiting, preparing };
  }, [kitchenOrders]);

  useEffect(() => {
    if (!soundOn || !primedRef.current) {
      kitchenOrders.forEach((o) => seenRef.current.add(o.id));
      primedRef.current = true;
      return;
    }
    let newWaiting = false;
    let newReady = false;
    for (const o of kitchenOrders) {
      const was = seenRef.current.has(o.id);
      if (!was && boardLane(o) === "waiting") newWaiting = true;
      if (isReady(o) && !was) newReady = true;
      seenRef.current.add(o.id);
    }
    if (newWaiting || newReady) beep();
    if (newReady) {
      setFlash({ text: lang === "hi" ? "ऑर्डर तैयार है" : "Order ready", kind: "ready" });
    }
  }, [kitchenOrders, soundOn, lang]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 3200);
    return () => window.clearTimeout(id);
  }, [flash]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginErr(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      sessionStorage.removeItem("kg_signed_out");
    } catch (err: any) {
      setLoginErr(err?.message || "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function bump(o: LiveOrder, to: KitchenStatus) {
    try {
      await updateKitchenStatus({ orderId: o.id, toStatus: to, role });
      if (to === "ready") {
        setFlash({
          text: lang === "hi" ? `ऑर्डर #${displayToken(o)} तैयार है` : `Order #${displayToken(o)} is READY`,
          kind: "ready"
        });
        if (soundOn) beep();
      }
    } catch (err: any) {
      setFlash({ text: err?.message || "Update failed", kind: "info" });
    }
  }

  if (authLoading) {
    return (
      <div className="kds-login">
        <h1>{t.brand}</h1>
        <p>{loading ? "…" : ""}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="kds-login">
        <h1>{t.title}</h1>
        <p>{t.hint}</p>
        <form className="kds-login-form" onSubmit={(e) => void onLogin(e)}>
          <label className="kds-field-label" htmlFor="kdsEmail">
            {t.email}
          </label>
          <input
            id="kdsEmail"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <label className="kds-field-label" htmlFor="kdsPassword">
            {t.password}
          </label>
          <input
            id="kdsPassword"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? "…" : t.signIn}
          </button>
        </form>
        <button
          type="button"
          className="kds-guest"
          style={{ marginTop: 12, width: "100%", minHeight: 44, borderRadius: 12, border: "1px solid #e6e8ee", background: "#f8f9fb", color: "#111827", fontWeight: 700 }}
          disabled={busy}
          onClick={() => void continueAsGuest()}
        >
          {t.guest}
        </button>
        {loginErr ? <div className="kds-error">{loginErr}</div> : null}
      </div>
    );
  }

  if (!canAccessKds(role)) {
    return (
      <div className="kds-login">
        <h1>{t.denied}</h1>
        <p>{role}</p>
        <button type="button" onClick={() => void logout()}>
          {t.logout}
        </button>
      </div>
    );
  }

  const readyN = columns.preparing.filter(isReady).length;

  return (
    <div className="kds-app-root" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: "100dvh" }}>
      <header className="kds-top">
        <div className="kds-brand">{t.brand}</div>
        <div className={clsx("kds-conn", !online && "is-offline")}>{online ? t.online : t.offline}</div>
        {!soundOn ? (
          <button
            type="button"
            id="kdsSoundTip"
            style={{ fontSize: 13, fontWeight: 700, color: "#e56b2c", background: "transparent", border: 0, cursor: "pointer" }}
            onClick={() => {
              setSoundOn(true);
              beep();
            }}
          >
            {t.soundTip}
          </button>
        ) : (
          <button type="button" id="kdsBeepBtn" onClick={() => beep()}>
            {t.beep}
          </button>
        )}
        <button
          type="button"
          id="kdsLangBtn"
          onClick={() => setLang((l) => (l === "hi" ? "en" : "hi"))}
        >
          {t.lang}
        </button>
        <a href="/pos" className="kds-pos-link">
          POS
        </a>
        <button
          type="button"
          id="kdsLogoutBtn"
          onClick={() => {
            sessionStorage.setItem("kg_signed_out", "1");
            void logout();
          }}
        >
          {t.logout}
        </button>
      </header>

      {error ? <div className="kds-error" style={{ margin: 8 }}>{error}</div> : null}

      <main className="kds-board" aria-live="polite">
        {(["waiting", "preparing"] as const).map((lane) => {
          const rows = columns[lane];
          const head =
            lane === "preparing" && readyN > 0 ? `${t[lane]} · ${readyN} ${t.readyCount}` : t[lane];
          return (
            <section key={lane} className="kds-col" data-status={lane}>
              <div className="kds-col-head">
                <span>{head}</span>
                <span className="kds-col-count">{rows.length}</span>
              </div>
              <div className="kds-col-body" data-drop-status={lane}>
                {!rows.length ? <div className="kds-empty">{t.empty}</div> : null}
                {rows.map((o) => {
                  const unpaid = !!(o.payLater || o.paymentStatus === "unpaid" || num(o.balanceDue) > 0.01);
                  const ready = isReady(o);
                  const agg = isAgg(o);
                  const liveAgeSec = Math.max(0, o.ageSec ?? (o.ageMin || 0) * 60);
                  const aggTimer = agg;
                  const remain = o.remainSec ?? (o.eta || 18) * 60 - liveAgeSec;
                  const tone = ready
                    ? "ok"
                    : aggTimer
                      ? countdownTone(remain)
                      : elapsedTone(liveAgeSec, o.eta || 25);
                  const typeLabel = orderTypeLabel(lang, o.orderType);
                  const kotV = num((o as { kotVersion?: number }).kotVersion);
                  const updatedAtMs = Date.parse(String((o as { kitchenUpdatedAt?: string }).kitchenUpdatedAt || o.updatedAt || ""));
                  const justUpdated =
                    !ready &&
                    ((kotV > 1 && Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs < 5 * 60_000) ||
                      (Boolean((o as { kitchenModified?: boolean }).kitchenModified) &&
                        Number.isFinite(updatedAtMs) &&
                        Date.now() - updatedAtMs < 5 * 60_000));
                  if (justUpdated) {
                    const prev = updateSeenRef.current.get(o.id) || 0;
                    if (kotV > prev) {
                      updateSeenRef.current.set(o.id, kotV);
                      if (soundOn) beep();
                    }
                  }
                  return (
                    <article
                      key={o.id}
                      className={clsx(
                        "kds-card",
                        `status-${ready ? "ready" : lane}`,
                        unpaid && "is-unpaid",
                        ready && "is-ready-blink",
                        agg && "is-agg",
                        !ready && tone === "late" && "is-late",
                        justUpdated && "is-updated"
                      )}
                      role="button"
                      tabIndex={0}
                      onDoubleClick={() => void bump(o, nextStatus(o))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void bump(o, nextStatus(o));
                      }}
                    >
                      <div className="kds-card-top">
                        <div className="kds-oid">{agg ? displayToken(o) : `#${displayToken(o)}`}</div>
                        <div
                          className={clsx("kds-timer", tone === "warn" && "warn", tone === "late" && "late")}
                          title={`${t.eta} ${o.eta}m`}
                        >
                          {ready
                            ? "✓"
                            : aggTimer
                              ? formatCountdownLabel(remain, lang)
                              : formatElapsedLabel(liveAgeSec, lang)}
                        </div>
                      </div>
                      <div className="kds-meta">
                        {!agg && o.tableName ? (
                          <span>
                            {t.table} {o.tableName}
                          </span>
                        ) : null}
                        {agg ? <span className="kds-plat">{typeLabel}</span> : <span>{typeLabel}</span>}
                      </div>
                      {justUpdated ? <span className="kds-badge kds-badge-updated">{t.updated}</span> : null}
                      {ready ? <span className="kds-badge kds-badge-ready">{t.ready}</span> : null}
                      {unpaid ? (
                        <span className="kds-badge kds-badge-unpaid">
                          {t.unpaid} {inr(o.balanceDue || o.total)}
                        </span>
                      ) : null}
                      <ul className="kds-items">
                        {(o.items || []).length ? (
                          (o.items || []).map((l) => {
                            const enriched = {
                              ...l,
                              nameHi: l.nameHi || hiNameFromMenu(l.name || l.nameHead || "", menuByBase)
                            };
                            const view = formatKitchenLineView(lang, enriched);
                            return (
                              <li key={l.lineId}>
                                <strong>
                                  <span className="kds-qty">{l.qty}×</span>
                                  <span>{view.title}</span>
                                </strong>
                                {view.detail ? <span className="kds-item-detail">{view.detail}</span> : null}
                                {l.kitchenNote || l.note || l.specialInstructions ? (
                                  <div className="kds-item-note">{l.kitchenNote || l.note || l.specialInstructions}</div>
                                ) : null}
                              </li>
                            );
                          })
                        ) : (
                          <li>
                            <strong>{lang === "hi" ? "आइटम नहीं मिले" : "No items on ticket"}</strong>
                          </li>
                        )}
                      </ul>
                      {o.kitchenNote ? (
                        <div className="kds-order-note">
                          {t.note}: {o.kitchenNote}
                        </div>
                      ) : null}
                      <div className="kds-card-actions">
                        <button
                          type="button"
                          className={clsx("advance", ready && "deliver")}
                          onClick={() => void bump(o, nextStatus(o))}
                        >
                          {ready ? t.served : t.advance}
                        </button>
                        {prevStatus(o) ? (
                          <button type="button" className="undo" onClick={() => void bump(o, prevStatus(o)!)}>
                            {t.undo}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </main>

      {flash ? (
        <div className={clsx("kds-flash", `kds-flash--${flash.kind}`, "kds-flash--show")} role="status">
          {flash.text}
        </div>
      ) : null}
    </div>
  );
}
