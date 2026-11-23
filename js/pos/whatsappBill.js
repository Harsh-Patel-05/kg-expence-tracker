/**
 * Share takeaway bill on WhatsApp (opens WhatsApp Desktop/Web/Mobile via wa.me).
 * Staff clicks Send — no WhatsApp Business API required.
 */
(function (root) {
  "use strict";

  const DEFAULTS = {
    shopName: "The Kilogram",
    address: "",
    phone: "",
    upiId: "",
    ratingsUrl: ""
  };

  function moneyFmt(n) {
    if (root.KG?.money?.formatINR) return root.KG.money.formatINR(n);
    const x = Math.round(Number(n) || 0);
    return "₹" + x.toLocaleString("en-IN");
  }

  function cleanVar(v) {
    const s = String(v || "").trim();
    return !s || /^default$/i.test(s) ? "" : s;
  }

  /** Normalize to international digits without + (e.g. 9198XXXXXXXX). */
  function normalizePhone(raw) {
    let d = String(raw || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith("0") && d.length === 11) d = d.slice(1);
    if (d.length === 10) d = "91" + d;
    if (d.length < 11 || d.length > 15) return "";
    return d;
  }

  function paymentLabel(bill) {
    if (bill.paymentLabel) return bill.paymentLabel;
    const parts = [];
    if (bill.cashAmount) parts.push("Cash");
    if (bill.otherOnlineAmount || bill.onlineAmount) parts.push("Online");
    if (bill.swiggyAmount) parts.push("Swiggy");
    if (bill.zomatoAmount) parts.push("Zomato");
    return parts.join(" + ") || "Paid";
  }

  function lineTitle(it) {
    const name = String(it.name || it.nameHi || "Item").trim();
    const size = cleanVar(it.variantLabel || it.variant);
    if (!size) return name;
    const compact = (x) =>
      String(x || "")
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/gms?/g, "g");
    if (compact(name).includes(compact(size))) return name;
    return `${name} (${size})`;
  }

  function shopFromSettings(settings) {
    const s = settings || root.KG?.posState?.getState?.()?.settings || {};
    return {
      shopName: String(s.shopName || DEFAULTS.shopName).trim() || DEFAULTS.shopName,
      address: String(s.address || "").trim(),
      phone: String(s.phone || "").trim(),
      upiId: String(s.upiId || "").trim(),
      ratingsUrl: String(s.ratingsUrl || s.googleReviewUrl || "").trim()
    };
  }

  function buildMessage(bill, settings) {
    const shop = shopFromSettings(settings);
    const b = bill || {};
    const when = new Date(b.at || Date.now()).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    const cust = String(b.customerName || "").trim();
    const lines = [
      `🙏 Thank you for ordering from *${shop.shopName}*!`,
      "",
      cust ? `👤 Customer: ${cust}` : null,
      `🧾 Bill: ${b.billNo || b.billId || "—"}`,
      `📅 ${when}`,
      `🥡 Takeaway`,
      "",
      "*Your order*"
    ].filter((x) => x != null);

    (b.items || []).forEach((it) => {
      const qty = Number(it.qty) || 1;
      const amt = (Number(it.price) || 0) * qty;
      lines.push(`• ${qty}× ${lineTitle(it)} — ${moneyFmt(amt)}`);
      if (it.note) lines.push(`   📝 ${it.note}`);
    });

    lines.push("");
    if (b.subtotal != null) lines.push(`Subtotal: ${moneyFmt(b.subtotal)}`);
    if (b.discount) lines.push(`Discount: −${moneyFmt(b.discount)}`);
    if (b.charges) lines.push(`Charges: ${moneyFmt(b.charges)}`);
    lines.push(`*Total: ${moneyFmt(b.grandTotal != null ? b.grandTotal : b.total)}*`);
    lines.push(`Paid: ${paymentLabel(b)}`);

    lines.push("");
    if (shop.address) lines.push(`📍 ${shop.address}`);
    if (shop.phone) lines.push(`📞 ${shop.phone}`);
    if (shop.upiId) lines.push(`💳 UPI: ${shop.upiId}`);
    if (shop.ratingsUrl) {
      lines.push("");
      lines.push(`⭐ Loved the food? Rate us here:`);
      lines.push(shop.ratingsUrl);
    }
    lines.push("");
    lines.push("See you again soon! 💛");
    lines.push(`— ${shop.shopName}`);

    return lines.join("\n");
  }

  function waUrl(phoneDigits, text) {
    return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
  }

  /**
   * Open WhatsApp chat to customer with bill text pre-filled.
   * @returns {{ ok: boolean, url?: string, phone?: string, error?: string }}
   */
  function shareBill(bill, opts) {
    const o = opts || {};
    const phone = normalizePhone(o.phone || bill?.customerPhone || "");
    if (!phone) {
      return { ok: false, error: "Enter customer mobile (10-digit WhatsApp number)" };
    }
    const text = buildMessage(bill, o.settings);
    const url = waUrl(phone, text);
    if (o.open !== false) {
      const w = root.open(url, "_blank", "noopener,noreferrer");
      if (!w) {
        // Popup blocked — still return URL so UI can show link
        return { ok: true, url, phone, blocked: true };
      }
    }
    return { ok: true, url, phone };
  }

  function canShare(bill) {
    const phone = normalizePhone(bill?.customerPhone || "");
    const ch = String(bill?.channel || bill?.orderType || "takeaway").toLowerCase();
    if (ch.includes("swiggy") || ch.includes("zomato")) return false;
    return !!phone && Array.isArray(bill?.items) && bill.items.length > 0;
  }

  root.KG = root.KG || {};
  root.KG.whatsappBill = {
    DEFAULTS,
    normalizePhone,
    buildMessage,
    shareBill,
    canShare,
    waUrl
  };
})(typeof window !== "undefined" ? window : globalThis);
