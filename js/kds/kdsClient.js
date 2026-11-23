/**
 * POS → KDS bridge. Writes Firestore first (same project as POS),
 * then optionally mirrors to REST API if configured.
 */
(function (root) {
  "use strict";

  const STORAGE_URL = "kg_kds_api_url";
  const STORAGE_KEY = "kg_kds_api_key";

  function getConfig() {
    const fromWindow = root.KG?.config || {};
    return {
      apiUrl: String(
        fromWindow.kdsApiUrl || root.localStorage?.getItem(STORAGE_URL) || ""
      ).replace(/\/$/, ""),
      apiKey: String(
        fromWindow.kdsApiKey || root.localStorage?.getItem(STORAGE_KEY) || ""
      ).trim()
    };
  }

  function saveConfig({ apiUrl, apiKey }) {
    if (apiUrl != null) {
      root.localStorage?.setItem(STORAGE_URL, String(apiUrl).replace(/\/$/, ""));
      root.KG = root.KG || {};
      root.KG.config = root.KG.config || {};
      root.KG.config.kdsApiUrl = String(apiUrl).replace(/\/$/, "");
    }
    if (apiKey != null) {
      root.localStorage?.setItem(STORAGE_KEY, String(apiKey));
      root.KG = root.KG || {};
      root.KG.config = root.KG.config || {};
      root.KG.config.kdsApiKey = String(apiKey);
    }
  }

  function billToPayload(bill) {
    const b = bill || {};
    const cleanVar = (v) => {
      const s = String(v || "").trim();
      return !s || /^default$/i.test(s) ? "" : s;
    };
    const stripSize = (n) =>
      String(n || "")
        .replace(/\s*[·\-–—]\s*Default\s*$/i, "")
        .replace(/\s*\(\s*Default\s*\)\s*$/i, "")
        .replace(/\s*\(\s*\d+(?:\.\d+)?\s*(?:kg|g|gm|gms)\s*\)\s*$/i, "")
        .replace(/\s+/g, " ")
        .trim();
    const sizeFor = (name, variant) => {
      const v = cleanVar(variant);
      if (!v) return "";
      const compact = (x) =>
        String(x || "")
          .toLowerCase()
          .replace(/\s+/g, "")
          .replace(/gms?/g, "g");
      if (compact(name).includes(compact(v))) return "";
      return v;
    };
    const channel = String(b.channel || b.orderType || "takeaway").toLowerCase();
    const agg = channel === "swiggy" || channel === "zomato";
    const items = (b.items || []).map((it) => {
      const nameEn = stripSize(it.name || it.nameEn || "");
      const nameHi = stripSize(it.nameHi || it.name_hi || "");
      const variant = sizeFor(nameHi || nameEn, it.variantLabel || it.variant || "");
      return {
        name_en: nameEn,
        name_hi: nameHi,
        qty: it.qty || 1,
        variant,
        item_note: it.note || it.itemNote || ""
      };
    });
    let created = b.at || b.createdAt || new Date().toISOString();
    if (typeof created === "number") created = new Date(created).toISOString();
    let orderType = b.orderType || "Takeaway";
    if (channel === "swiggy") orderType = "Swiggy";
    else if (channel === "zomato") orderType = "Zomato";
    const platformNo = String(b.platformOrderNo || "").trim();
    let orderNote = String(b.orderNote || b.notes || "").trim();
    // Do NOT put platform # or our bill # into the note — KDS card top already shows the right id
    if (platformNo && agg) {
      orderNote = orderNote
        .replace(new RegExp(`\\b(?:swiggy|zomato)\\s*#\\s*${platformNo}\\b`, "ig"), "")
        .replace(/\|\s*\|/g, "|")
        .replace(/^\||\|$/g, "")
        .trim();
    }
    const payLater = !!(b.payLater || b.paymentStatus === "unpaid" || b.status === "pending_payment");
    if (payLater && !orderNote.toLowerCase().includes("pay later")) {
      orderNote = orderNote ? `Pay later | ${orderNote}` : "Pay later";
    }
    return {
      order_id: String(b.billNo || b.billId || b.id || "").trim(),
      // Never put Swiggy/Zomato platform # into table_no (KDS was showing "टेबल 5244")
      table_no: agg ? "" : String(b.tableId || b.tableNo || "").trim(),
      order_type: orderType,
      channel,
      platform_order_no: platformNo,
      items,
      order_note: orderNote,
      waiter_name: String(b.cashierName || b.waiterName || ""),
      created_time: String(created),
      bill_id: String(b.billId || b.id || "").trim(),
      pay_later: payLater,
      payment_status: payLater ? "unpaid" : "paid",
      grand_total: Number(b.grandTotal) || 0,
      daily_no: Number(b.dailyNo || b.tokenNo) || 0,
      token_no: Number(b.tokenNo || b.dailyNo) || 0
    };
  }

  async function postApi(path, body) {
    const { apiUrl, apiKey } = getConfig();
    if (!apiUrl || !apiKey) throw new Error("KDS API not configured");
    const res = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify(body || {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || `KDS API ${res.status}`);
    return data;
  }

  async function writeFirestore(payload) {
    if (!root.KG?.kdsStore?.createOrder) {
      throw new Error("KDS store not loaded — hard-refresh the POS page");
    }
    if (!root.firebase?.firestore) {
      throw new Error("Firestore not ready");
    }
    const order = await root.KG.kdsStore.createOrder({
      orderId: payload.order_id,
      tableNo: payload.table_no,
      orderType: payload.order_type,
      channel: payload.channel,
      platformOrderNo: payload.platform_order_no,
      items: payload.items.map((it) => ({
        nameEn: it.name_en,
        nameHi: it.name_hi,
        qty: it.qty,
        variant: it.variant,
        itemNote: it.item_note
      })),
      orderNote: payload.order_note,
      waiterName: payload.waiter_name,
      createdAt: payload.created_time,
      billId: payload.bill_id,
      payLater: !!payload.pay_later,
      paymentStatus: payload.payment_status,
      grandTotal: payload.grand_total,
      dailyNo: payload.daily_no || payload.token_no,
      tokenNo: payload.token_no || payload.daily_no,
      by: "pos"
    });
    return { order };
  }

  async function pushOrderFromBill(bill) {
    const payload = billToPayload(bill);
    if (!payload.order_id) throw new Error("Missing order id");
    if (!payload.items.length) throw new Error("No items for KDS");

    // Primary path: Firestore (tablet listens here)
    const result = await writeFirestore(payload);

    // Optional mirror to external REST (non-fatal)
    const cfg = getConfig();
    if (cfg.apiUrl && cfg.apiKey) {
      postApi("/orders", payload).catch((e) =>
        console.warn("KDS API mirror failed (Firestore OK)", e)
      );
    }
    return result;
  }

  root.KG = root.KG || {};
  root.KG.kdsClient = {
    getConfig,
    saveConfig,
    billToPayload,
    postApi,
    pushOrderFromBill,
    writeFirestore
  };
})(typeof window !== "undefined" ? window : globalThis);
