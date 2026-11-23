/**
 * Phase 2 ops: stock lots, POS recipe deduct, alerts, recurring, reports.
 * Depends on window.api, app helpers via callbacks registered after app boot.
 */
(function () {
  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function parseRecipe(str) {
    const raw = String(str || "").trim();
    if (!raw) return [];
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [item, qtyRaw] = part.split(":").map((s) => String(s || "").trim());
        const qty = num(qtyRaw);
        return item && qty > 0 ? { item, qty } : null;
      })
      .filter(Boolean);
  }

  function formatRecipe(recipe) {
    if (!Array.isArray(recipe) || !recipe.length) return "";
    return recipe.map((r) => `${r.item}:${r.qty}`).join(", ");
  }

  function findInventoryByName(inventory, name) {
    const key = String(name || "").trim().toLowerCase();
    return (inventory || []).find((x) => String(x.item || "").trim().toLowerCase() === key) || null;
  }

  async function deductRecipeForCart({ cart, menuItems, inventory, adjustFn, today }) {
    if (!adjustFn) return { deducted: 0, missing: [] };
    const missing = [];
    let deducted = 0;
    const needs = new Map(); // inventoryId -> { qty, item, unit }

    for (const line of cart || []) {
      const menu =
        (menuItems || []).find((m) => String(m.id) === String(line.menuItemId || "")) ||
        (menuItems || []).find((m) => String(m.name || "").toLowerCase() === String(line.name || "").toLowerCase());
      const recipe = Array.isArray(menu?.recipe) ? menu.recipe : parseRecipe(menu?.recipeText);
      if (!recipe.length) continue;
      const serveQty = Math.max(1, Math.floor(num(line.qty)));
      for (const ing of recipe) {
        const inv = findInventoryByName(inventory, ing.item);
        if (!inv) {
          missing.push(ing.item);
          continue;
        }
        const add = num(ing.qty) * serveQty;
        const prev = needs.get(inv.id) || { qty: 0, item: inv.item, unit: inv.unit || "unit" };
        prev.qty += add;
        needs.set(inv.id, prev);
      }
    }

    for (const [id, info] of needs.entries()) {
      await adjustFn(id, {
        delta: -info.qty,
        type: "pos",
        reason: `POS sale deduct · ${info.item}`,
        date: today
      });
      deducted += 1;
    }
    return { deducted, missing: [...new Set(missing)] };
  }

  function stockAlerts({ inventory, lots, today, warnDays = 3 }) {
    const alerts = [];
    (inventory || []).forEach((x) => {
      const thr = num(x.threshold);
      if (thr > 0 && num(x.qty) <= thr) {
        alerts.push({
          kind: "low",
          text: `Low stock: ${x.item} (${num(x.qty)} ${x.unit || "unit"} ≤ alert ${thr})`,
          sort: 0
        });
      }
    });
    (lots || []).forEach((lot) => {
      const exp = String(lot.expiryDate || "").slice(0, 10);
      if (!exp || num(lot.remainingQty ?? lot.qty) <= 0) return;
      const d = daysBetween(today, exp);
      if (d < 0) {
        alerts.push({
          kind: "expired",
          text: `Expired: ${lot.item} lot (${exp}) · ${num(lot.remainingQty ?? lot.qty)} left`,
          sort: -1
        });
      } else if (d <= warnDays) {
        alerts.push({
          kind: "expiry",
          text: `Expiring in ${d}d: ${lot.item} (${exp}) · ${num(lot.remainingQty ?? lot.qty)} left`,
          sort: d
        });
      }
    });
    return alerts.sort((a, b) => a.sort - b.sort);
  }

  function daysBetween(fromISO, toISO) {
    const a = parseDay(fromISO);
    const b = parseDay(toISO);
    if (!a || !b) return 999;
    return Math.round((b - a) / 86400000);
  }

  function parseDay(iso) {
    const s = String(iso || "").slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  }

  function monthKey(iso) {
    return String(iso || "").slice(0, 7);
  }

  function buildReportRows({ sales, expenses, purchases, fromISO, toISO }) {
    const inRange = (d) => {
      const x = String(d || "").slice(0, 10);
      if (!x) return false;
      if (fromISO && x < fromISO) return false;
      if (toISO && x > toISO) return false;
      return true;
    };
    const rows = [["Type", "Date", "Detail", "Amount", "Status"]];
    (sales || []).filter((s) => inRange(s.date)).forEach((s) => {
      rows.push([
        "Sale",
        String(s.date || "").slice(0, 10),
        s.notes || s.source || "Sale",
        String(num(s.totalAmount ?? s.amount)),
        "—"
      ]);
    });
    (expenses || []).filter((e) => inRange(e.date)).forEach((e) => {
      rows.push([
        "Expense",
        String(e.date || "").slice(0, 10),
        `${e.category || ""}${e.note ? " — " + e.note : ""}`,
        String(num(e.amount)),
        e.status || ""
      ]);
    });
    (purchases || []).filter((p) => inRange(p.date)).forEach((p) => {
      rows.push([
        "Supplier bill",
        String(p.date || "").slice(0, 10),
        `${p.seller || ""} — ${p.item || ""}`,
        String(num(p.price)),
        p.paidStatus || ""
      ]);
    });
    return rows;
  }

  function toCsv(rows) {
    return rows
      .map((r) =>
        r
          .map((c) => {
            const s = String(c ?? "");
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      )
      .join("\n");
  }

  function downloadText(filename, text, mime) {
    const blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function fileToDataUrl(file, maxBytes = 450000) {
    if (!file) return null;
    if (file.size > maxBytes * 1.4 && !String(file.type || "").startsWith("image/")) {
      throw new Error("File too large (keep under ~400KB)");
    }
    if (String(file.type || "").startsWith("image/") && file.size > 120000) {
      return compressImage(file, maxBytes);
    }
    if (file.size > maxBytes) throw new Error("File too large (keep under ~400KB)");
    return readAsDataUrl(file);
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => reject(new Error("Failed to read file"));
      fr.readAsDataURL(file);
    });
  }

  function compressImage(file, maxBytes) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        const maxSide = 1280;
        if (Math.max(w, h) > maxSide) {
          const scale = maxSide / Math.max(w, h);
          w = Math.round(w * scale);
          h = Math.round(h * scale);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        let quality = 0.72;
        let data = canvas.toDataURL("image/jpeg", quality);
        while (data.length > maxBytes && quality > 0.35) {
          quality -= 0.1;
          data = canvas.toDataURL("image/jpeg", quality);
        }
        if (data.length > maxBytes) reject(new Error("Image still too large after compress"));
        else resolve(data);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Invalid image"));
      };
      img.src = url;
    });
  }

  window.KgPhase2 = {
    parseRecipe,
    formatRecipe,
    deductRecipeForCart,
    stockAlerts,
    monthKey,
    buildReportRows,
    toCsv,
    downloadText,
    fileToDataUrl,
    daysBetween
  };
})();
