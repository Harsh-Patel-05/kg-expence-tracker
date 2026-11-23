// Expose `window.api` only after Firebase helpers are ready.
// If `js/firebase.js` fails during init, `window.firebaseDB` never gets created and
// this file would previously crash (leaving `window.api` undefined).
(function initApi() {
  const API_BASE_URL = window.API_BASE_URL || "http://localhost:5050";

  async function fetchJson(path, opts) {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts && opts.headers ? opts.headers : {})
      }
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { message: text || "Invalid JSON from server" };
    }
    if (!res.ok) {
      const msg = (json && (json.message || json.error)) || `Request failed: ${res.status}`;
      throw new Error(msg);
    }
    return json;
  }

  function buildBackendApi() {
    const lsKey = (k) => `kg_api_${k}`;
    const lsList = (k) => {
      try {
        const raw = localStorage.getItem(lsKey(k));
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    };
    const lsSave = (k, arr) => {
      try {
        localStorage.setItem(lsKey(k), JSON.stringify(arr));
      } catch {}
    };

    return {
      menuItems: {
        list: () => fetchJson("/api/menu-items", { method: "GET" }),
        create: (body) => fetchJson("/api/menu-items", { method: "POST", body: JSON.stringify(body) }),
        bulkCreate: async (items) => {
          const res = await fetchJson("/api/menu-items/bulk", { method: "POST", body: JSON.stringify({ items }) });
          return Array.isArray(res?.items) ? res.items : [];
        },
        removeAll: () => fetchJson("/api/menu-items/all", { method: "DELETE" }),
        update: (id, body) => fetchJson(`/api/menu-items/${id}`, { method: "PUT", body: JSON.stringify(body) }),
        remove: (id) => fetchJson(`/api/menu-items/${id}`, { method: "DELETE" })
      },
      orders: {
        list: (params) => {
          const q = params && params.date ? `?date=${encodeURIComponent(params.date)}` : "";
          return fetchJson(`/api/orders${q}`, { method: "GET" });
        },
        create: (body) => fetchJson("/api/orders", { method: "POST", body: JSON.stringify(body) }),
        remove: (id) => fetchJson(`/api/orders/${id}`, { method: "DELETE" })
      },
      sales: {
        list: () => fetchJson("/api/sales", { method: "GET" }),
        create: (body) => fetchJson("/api/sales", { method: "POST", body: JSON.stringify(body) }),
        remove: (id) => fetchJson(`/api/sales/${id}`, { method: "DELETE" })
      },
      purchases: {
        list: () => fetchJson("/api/purchases", { method: "GET" }),
        create: (body) => fetchJson("/api/purchases", { method: "POST", body: JSON.stringify(body) }),
        update: (id, body) => fetchJson(`/api/purchases/${id}`, { method: "PUT", body: JSON.stringify(body) }),
        remove: (id) => fetchJson(`/api/purchases/${id}`, { method: "DELETE" })
      },
      expenses: {
        list: () => fetchJson("/api/expenses", { method: "GET" }),
        create: (body) => fetchJson("/api/expenses", { method: "POST", body: JSON.stringify(body) }),
        update: (id, body) => fetchJson(`/api/expenses/${id}`, { method: "PUT", body: JSON.stringify(body) }),
        remove: (id) => fetchJson(`/api/expenses/${id}`, { method: "DELETE" })
      },
      inventory: {
        list: () => fetchJson("/api/inventory", { method: "GET" }),
        create: (body) => fetchJson("/api/inventory", { method: "POST", body: JSON.stringify(body) }),
        update: (id, body) => fetchJson(`/api/inventory/${id}`, { method: "PUT", body: JSON.stringify(body) }),
        remove: (id) => fetchJson(`/api/inventory/${id}`, { method: "DELETE" }),
        adjust: async () => {
          throw new Error("Stock adjust requires Firestore mode");
        },
        movements: async () => [],
        lots: async () => []
      },
      recurringExpenses: {
        list: async () => [],
        create: async () => {
          throw new Error("Recurring expenses require Firestore mode");
        },
        update: async () => {},
        remove: async () => {}
      },
      attendance: {
        list: () => fetchJson("/api/attendance", { method: "GET" }),
        create: (body) => fetchJson("/api/attendance", { method: "POST", body: JSON.stringify(body) }),
        update: (id, body) => fetchJson(`/api/attendance/${id}`, { method: "PUT", body: JSON.stringify(body) }),
        remove: (id) => fetchJson(`/api/attendance/${id}`, { method: "DELETE" })
      },
      salaries: {
        list: () => fetchJson("/api/salaries", { method: "GET" }),
        create: (body) => fetchJson("/api/salaries", { method: "POST", body: JSON.stringify(body) }),
        update: (id, body) => fetchJson(`/api/salaries/${id}`, { method: "PUT", body: JSON.stringify(body) }),
        remove: (id) => fetchJson(`/api/salaries/${id}`, { method: "DELETE" })
      },
      advances: {
        list: () => fetchJson("/api/advances", { method: "GET" }),
        create: (body) => fetchJson("/api/advances", { method: "POST", body: JSON.stringify(body) }),
        remove: (id) => fetchJson(`/api/advances/${id}`, { method: "DELETE" })
      },
      suppliers: {
        list: async () => {
          const res = await fetchJson("/api/suppliers", { method: "GET" });
          return Array.isArray(res?.items) ? res.items : [];
        },
        create: async (body) => {
          const res = await fetchJson("/api/suppliers", { method: "POST", body: JSON.stringify(body) });
          return Array.isArray(res?.items) ? res.items : [];
        },
        update: async (id, body) => {
          const res = await fetchJson(`/api/suppliers/${id}`, { method: "PUT", body: JSON.stringify(body) });
          return Array.isArray(res?.items) ? res.items : [];
        },
        remove: (id) => fetchJson(`/api/suppliers/${id}`, { method: "DELETE" })
      },
      supplierPayments: {
        list: () => fetchJson("/api/supplier-payments", { method: "GET" }),
        create: (body) => fetchJson("/api/supplier-payments", { method: "POST", body: JSON.stringify(body) }),
        remove: (id) => fetchJson(`/api/supplier-payments/${id}`, { method: "DELETE" })
      },
      staff: {
        list: async () => {
          const res = await fetchJson("/api/staff", { method: "GET" });
          return Array.isArray(res?.items) ? res.items : res;
        },
        create: (body) => fetchJson("/api/staff", { method: "POST", body: JSON.stringify(body) }),
        remove: (id) => fetchJson(`/api/staff/${id}`, { method: "DELETE" })
      },
      backup: {
        export: async () => {
          const json = await fetchJson("/api/backup/export", { method: "GET" });
          return new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
        },
        import: async (body) => {
          await fetchJson("/api/backup/import", { method: "POST", body: JSON.stringify(body) });
        }
      },
      analytics: {
        get: (type) => fetchJson(`/api/analytics?type=${encodeURIComponent(type || "monthly")}`, { method: "GET" })
      },
      balanceTransfers: {
        list: async () => lsList("balance_transfers"),
        create: async (body) => {
          const rows = lsList("balance_transfers");
          const id = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const row = {
            id,
            date: String(body.date || "").slice(0, 10),
            fromAccount: String(body.fromAccount || "").toLowerCase(),
            toAccount: String(body.toAccount || "").toLowerCase(),
            amount: Number(body.amount),
            notes: String(body.notes || ""),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          rows.push(row);
          lsSave("balance_transfers", rows);
          return id;
        },
        remove: async (id) => {
          const rows = lsList("balance_transfers").filter((r) => r.id !== id);
          lsSave("balance_transfers", rows);
          return { ok: true, id };
        }
      },
      investments: {
        list: async () => lsList("investments"),
        create: async (body) => {
          const rows = lsList("investments");
          const id = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          rows.push({
            id,
            date: String(body.date || "").slice(0, 10),
            amount: Number(body.amount) || 0,
            kind: String(body.kind || "capital_in"),
            account: String(body.account || "cash").toLowerCase(),
            title: String(body.title || "").trim(),
            notes: String(body.notes || "").trim(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          lsSave("investments", rows);
          return id;
        },
        remove: async (id) => {
          lsSave(
            "investments",
            lsList("investments").filter((r) => r.id !== id)
          );
          return { ok: true, id };
        }
      },
      profitWithdrawals: {
        list: async () => lsList("profit_withdrawals"),
        create: async (body) => {
          const rows = lsList("profit_withdrawals");
          const id = `pwd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          rows.push({
            id,
            date: String(body.date || "").slice(0, 10),
            amount: Number(body.amount) || 0,
            account: String(body.account || "cash").toLowerCase(),
            notes: String(body.notes || "").trim(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          lsSave("profit_withdrawals", rows);
          return id;
        },
        remove: async (id) => {
          lsSave(
            "profit_withdrawals",
            lsList("profit_withdrawals").filter((r) => r.id !== id)
          );
          return { ok: true, id };
        }
      },
      dailyClosings: {
        list: async () => lsList("daily_closings"),
        create: async (body) => {
          const rows = lsList("daily_closings");
          const id = `dc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          rows.push({ id, ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
          lsSave("daily_closings", rows);
          return id;
        },
        remove: async (id) => {
          const rows = lsList("daily_closings").filter((r) => r.id !== id);
          lsSave("daily_closings", rows);
          return { ok: true, id };
        }
      },
      documents: {
        list: async () => lsList("documents"),
        create: async (body) => {
          const rows = lsList("documents");
          const id = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          rows.unshift({
            id,
            ...body,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          lsSave("documents", rows);
          return id;
        },
        update: async (id, body) => {
          const rows = lsList("documents");
          const i = rows.findIndex((r) => r.id === id);
          if (i < 0) throw new Error("Document not found");
          rows[i] = { ...rows[i], ...body, updatedAt: new Date().toISOString() };
          lsSave("documents", rows);
          return { ok: true, id };
        },
        remove: async (id) => {
          const rows = lsList("documents").filter((r) => r.id !== id);
          lsSave("documents", rows);
          return { ok: true, id };
        }
      }
    };
  }

  // If Firebase init failed, switch to backend APIs automatically.
  if (window.__firebaseInitError) {
    window.api = buildBackendApi();
    return;
  }

  const fb = window.firebaseDB;
  if (!fb) {
    // Retry a few times in case scripts load slowly.
    window.__apiInitAttempts = (window.__apiInitAttempts || 0) + 1;
    if (window.__apiInitAttempts <= 40) return setTimeout(initApi, 50);
    console.error("Firestore API not initialized: window.firebaseDB is missing. Falling back to backend API.");
    window.__firebaseInitError = true;
    window.api = buildBackendApi();
    return;
  }

  const {
    addData,
    getData,
    deleteData,
    updateData,
    upsertByField,
    bulkUpsertMenuItems,
    getDocsByField,
    getDocById,
    createBalanceTransfer,
    deleteBalanceTransfer,
    exportAllData,
    importAllData
  } = fb;

  function getLocallyDeletedIds() {
    try {
      const raw = localStorage.getItem("kg_deleted_orders_v1");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map((x) => String(x)) : [];
    } catch {
      return [];
    }
  }

  function addLocallyDeletedId(id) {
    const oid = String(id || "").trim();
    if (!oid) return;
    try {
      const cur = new Set(getLocallyDeletedIds());
      cur.add(oid);
      localStorage.setItem("kg_deleted_orders_v1", JSON.stringify(Array.from(cur).slice(-500)));
    } catch {}
  }

  // Keep the existing API shape used by `js/app.js` (window.api.*).
  const api = {
    menuItems: {
      list: () => getData("menuItems"),
      create: (body) => addData("menuItems", body),
      bulkCreate: async (items) => {
        if (typeof bulkUpsertMenuItems === "function") {
          return bulkUpsertMenuItems(items);
        }
        for (const it of items) {
          const name = String(it?.name || "").trim();
          if (!name) continue;
          const price = Number(it?.price);
          if (!Number.isFinite(price) || price < 0) continue;
          const row = {
            name,
            nameHi: String(it?.nameHi || "").trim(),
            price,
            category: String(it?.category || "General").trim() || "General",
            imageUrl: String(it?.imageUrl || "").trim(),
            available: it?.available !== false
          };
          await upsertByField("menuItems", "name", name, row);
        }
        return getData("menuItems");
      },
      removeAll: async () => {
        const docs = await getData("menuItems");
        await Promise.all(docs.map((d) => deleteData("menuItems", d.id)));
        return { deletedCount: docs.length };
      },
      update: (id, body) => updateData("menuItems", id, body),
      remove: (id) => deleteData("menuItems", id)
    },
    orders: {
      list: async (params) => {
        const all = await getData("orders");
        const list = Array.isArray(all) ? all : [];
        const localDel = new Set(getLocallyDeletedIds());
        const filtered = list.filter((o) => o && o.deleted !== true && !localDel.has(String(o.id || "")));
        const date = params && params.date ? String(params.date).slice(0, 10) : "";
        return date ? filtered.filter((o) => String(o.date || "").slice(0, 10) === date) : filtered;
      },
      create: (body) => addData("orders", body),
      remove: async (id) => {
        // Always hide it locally immediately (POS must move fast).
        addLocallyDeletedId(id);
        try {
          return await deleteData("orders", id);
        } catch (e) {
          // If Firestore rules block deletes, do a soft-delete (update) instead.
          // This keeps history clean without needing delete permissions.
          try {
            await updateData("orders", id, { deleted: true, deletedAt: new Date().toISOString() });
            return { ok: true, id, soft: true };
          } catch {
            // Last resort: backend delete (works only for Mongo ObjectIds)
            return await fetchJson(`/api/orders/${encodeURIComponent(id)}`, { method: "DELETE" });
          }
        }
      }
    },
    sales: {
      list: () => getData("sales"),
      create: async (body) => {
        const cash = Number(body?.cashAmount) || 0;
        const swiggy = Number(body?.swiggyAmount) || 0;
        const zomato = Number(body?.zomatoAmount) || 0;
        const other = Number(body?.otherOnlineAmount) || 0;
        const legacy = Number(body?.onlineAmount) || 0;
        const upi = swiggy > 0 || zomato > 0 || other > 0 ? other : legacy;
        const total =
          Number(body?.totalAmount) || cash + upi + swiggy + zomato;
        const date = String(body?.date || "").slice(0, 10);
        const id = await addData("sales", {
          ...body,
          cashAmount: cash,
          swiggyAmount: swiggy,
          zomatoAmount: zomato,
          otherOnlineAmount: other || (upi && !other ? upi : other),
          onlineAmount: Number(body?.onlineAmount) || upi + swiggy + zomato,
          totalAmount: total
        });
        // Keep dailySalesSummary in sync (POS already does this via salesBridge)
        if (date && typeof firebase !== "undefined" && firebase.firestore) {
          try {
            const incr = firebase.firestore.FieldValue.increment;
            await firebase
              .firestore()
              .collection("dailySalesSummary")
              .doc(date)
              .set(
                {
                  date,
                  totalSales: incr(total),
                  cashSales: incr(cash),
                  onlineSales: incr(upi),
                  swiggySales: incr(swiggy),
                  zomatoSales: incr(zomato),
                  billCount: incr(1),
                  cashBillCount: incr(cash > 0 ? 1 : 0),
                  onlineBillCount: incr(upi > 0 ? 1 : 0),
                  updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                },
                { merge: true }
              );
          } catch (_) {}
        }
        return id;
      },
      remove: async (id) => {
        let sale = null;
        try {
          if (typeof firebase !== "undefined" && firebase.firestore) {
            const snap = await firebase.firestore().collection("sales").doc(id).get();
            if (snap.exists) sale = snap.data();
          }
        } catch (_) {}
        await deleteData("sales", id);
        if (sale && String(sale.status || "") !== "void") {
          const cash = Number(sale.cashAmount) || 0;
          const swiggy = Number(sale.swiggyAmount) || 0;
          const zomato = Number(sale.zomatoAmount) || 0;
          const other = Number(sale.otherOnlineAmount) || 0;
          const legacy = Number(sale.onlineAmount) || 0;
          const upi = swiggy > 0 || zomato > 0 || other > 0 ? other : legacy;
          const total = Number(sale.totalAmount) || cash + upi + swiggy + zomato;
          const date = String(sale.date || "").slice(0, 10);
          if (date && typeof firebase !== "undefined" && firebase.firestore) {
            try {
              const incr = firebase.firestore.FieldValue.increment;
              await firebase
                .firestore()
                .collection("dailySalesSummary")
                .doc(date)
                .set(
                  {
                    totalSales: incr(-total),
                    cashSales: incr(-cash),
                    onlineSales: incr(-upi),
                    swiggySales: incr(-swiggy),
                    zomatoSales: incr(-zomato),
                    billCount: incr(-1),
                    cashBillCount: incr(cash > 0 ? -1 : 0),
                    onlineBillCount: incr(upi > 0 ? -1 : 0),
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                  },
                  { merge: true }
                );
            } catch (_) {}
          }
        }
      }
    },
    purchases: {
      list: () => getData("purchases"),
      create: async (body) => {
        const paidStatus = String(body?.paidStatus || body?.status || "unpaid").toLowerCase() === "paid" ? "paid" : "unpaid";
        const paymentMethod =
          paidStatus === "paid"
            ? String(body?.paymentMethod || "cash").toLowerCase() === "online"
              ? "online"
              : "cash"
            : "unpaid";
        const purchaseId = await addData("purchases", { ...body, paidStatus, paymentMethod, status: paidStatus });

        // Keep inventory in sync with paid/unpaid purchase qty by default (same as old backend).
        // Roll-forward inventory by purchase.qty.
        const qty = Number(body.qty || 0);
        const item = body.item;
        let inventoryId = null;
        if (item && qty > 0) {
          const matches = await getDocsByField("inventory", "item", item);
          if (matches.length) {
            const inv = matches[0];
            inventoryId = inv.id;
            const nextQty = Number(inv.qty || 0) + qty;
            await updateData("inventory", inv.id, { qty: nextQty });
          } else {
            inventoryId = await addData("inventory", { item, unit: "unit", qty, threshold: 0 });
          }
          // Supplier lot with optional expiry (milk, paneer, cream…)
          await addData("stock_lots", {
            inventoryId,
            item,
            unit: "unit",
            qty,
            remainingQty: qty,
            supplier: String(body.seller || "").trim(),
            expiryDate: String(body.expiryDate || "").slice(0, 10),
            date: String(body.date || "").slice(0, 10),
            purchaseId
          });
          await addData("inventory_movements", {
            inventoryId,
            item,
            unit: "unit",
            delta: qty,
            type: "purchase",
            reason: `Supplier bill · ${body.seller || ""}`,
            date: String(body.date || "").slice(0, 10)
          });
        }

        return purchaseId;
      },
      update: (id, body) => updateData("purchases", id, body),
      remove: async (id) => {
        const p = await getDocById("purchases", id);
        if (p) {
          const qty = Number(p.qty || 0);
          const item = p.item;
          if (item && qty > 0) {
            const matches = await getDocsByField("inventory", "item", item);
            if (matches.length) {
              const inv = matches[0];
              const nextQty = Math.max(0, Number(inv.qty || 0) - qty);
              await updateData("inventory", inv.id, { qty: nextQty });
            }
          }
        }
        await deleteData("purchases", id);
      }
    },
    expenses: {
      list: () => getData("expenses"),
      create: (body) => addData("expenses", body),
      update: (id, body) => updateData("expenses", id, body),
      remove: (id) => deleteData("expenses", id)
    },
    inventory: {
      list: () => getData("inventory"),
      create: (body) => upsertByField("inventory", "item", body.item, body),
      update: (id, body) => updateData("inventory", id, body),
      remove: (id) => deleteData("inventory", id),
      adjust: async (id, body) => {
        const inv = typeof getDocById === "function" ? await getDocById("inventory", id) : null;
        if (!inv) throw new Error("Inventory item not found");
        const delta = Number(body?.delta);
        if (!Number.isFinite(delta) || delta === 0) throw new Error("Enter a non-zero quantity");
        const prev = Number(inv.qty) || 0;
        const nextQty = Math.max(0, prev + delta);
        await updateData("inventory", id, { qty: nextQty });
        await addData("inventory_movements", {
          inventoryId: id,
          item: inv.item || "",
          unit: inv.unit || "unit",
          delta,
          qtyBefore: prev,
          qtyAfter: nextQty,
          type: body?.type || (delta > 0 ? "in" : "out"),
          reason: String(body?.reason || "").trim(),
          date: body?.date || new Date().toISOString().slice(0, 10)
        });

        // Stock in with lot / expiry
        if (delta > 0 && (body?.expiryDate || body?.createLot)) {
          await addData("stock_lots", {
            inventoryId: id,
            item: inv.item || "",
            unit: inv.unit || "unit",
            qty: delta,
            remainingQty: delta,
            supplier: String(body?.supplier || "").trim(),
            expiryDate: String(body?.expiryDate || "").slice(0, 10),
            date: body?.date || new Date().toISOString().slice(0, 10)
          });
        }

        // Stock out: FIFO consume lots
        if (delta < 0) {
          let need = Math.abs(delta);
          const lots = (await getData("stock_lots"))
            .filter((l) => String(l.inventoryId) === String(id) && Number(l.remainingQty ?? l.qty) > 0)
            .sort((a, b) => String(a.expiryDate || "9999").localeCompare(String(b.expiryDate || "9999")));
          for (const lot of lots) {
            if (need <= 0) break;
            const rem = Number(lot.remainingQty ?? lot.qty) || 0;
            const take = Math.min(rem, need);
            await updateData("stock_lots", lot.id, { remainingQty: Math.max(0, rem - take) });
            need -= take;
          }
        }

        return { id, qty: nextQty };
      },
      movements: () => getData("inventory_movements"),
      lots: () => getData("stock_lots")
    },
    recurringExpenses: {
      list: () => getData("recurring_expenses"),
      create: (body) => addData("recurring_expenses", body),
      update: (id, body) => updateData("recurring_expenses", id, body),
      remove: (id) => deleteData("recurring_expenses", id)
    },
    attendance: {
      list: () => getData("attendance"),
      create: (body) => addData("attendance", body),
      update: (id, body) => updateData("attendance", id, body),
      remove: (id) => deleteData("attendance", id)
    },
    salaries: {
      list: () => getData("salaries"),
      create: (body) => addData("salaries", body),
      update: (id, body) => updateData("salaries", id, body),
      remove: (id) => deleteData("salaries", id)
    },
    advances: {
      list: () => getData("advances"),
      create: (body) => addData("advances", body),
      remove: (id) => deleteData("advances", id)
    },
    suppliers: {
      list: () => getData("suppliers"),
      create: (body) => addData("suppliers", body),
      update: (id, body) => updateData("suppliers", id, body),
      remove: (id) => deleteData("suppliers", id)
    },
    supplierPayments: {
      list: () => getData("supplierPayments"),
      create: (body) => addData("supplierPayments", body),
      remove: (id) => deleteData("supplierPayments", id)
    },
    staff: {
      list: () => getData("staff"),
      create: (body) => addData("staff", body),
      remove: (id) => deleteData("staff", id)
    },
    fixedSalaries: {
      list: () => getData("fixedSalaries"),
      create: (body) => addData("fixedSalaries", body),
      update: (id, body) => updateData("fixedSalaries", id, body),
      remove: (id) => deleteData("fixedSalaries", id)
    },
    reminders: {
      list: () => getData("reminders"),
      create: (body) => addData("reminders", body),
      update: (id, body) => updateData("reminders", id, body),
      remove: (id) => deleteData("reminders", id)
    },
    balanceTransfers: {
      list: () => getData("balance_transfers"),
      create: (body) => createBalanceTransfer(body),
      remove: (id) => deleteBalanceTransfer(id)
    },
    investments: {
      list: () => getData("investments"),
      create: (body) =>
        addData("investments", {
          date: String(body.date || "").slice(0, 10),
          amount: Number(body.amount) || 0,
          kind: String(body.kind || "capital_in"),
          account: String(body.account || "cash").toLowerCase(),
          title: String(body.title || "").trim(),
          notes: String(body.notes || "").trim()
        }),
      remove: (id) => deleteData("investments", id)
    },
    profitWithdrawals: {
      list: () => getData("profit_withdrawals"),
      create: (body) =>
        addData("profit_withdrawals", {
          date: String(body.date || "").slice(0, 10),
          amount: Number(body.amount) || 0,
          account: String(body.account || "cash").toLowerCase(),
          notes: String(body.notes || "").trim()
        }),
      remove: (id) => deleteData("profit_withdrawals", id)
    },
    dailyClosings: {
      list: () => getData("daily_closings"),
      create: (body) => addData("daily_closings", body),
      remove: (id) => deleteData("daily_closings", id)
    },
    documents: {
      list: () => getData("documents"),
      create: (body) => addData("documents", body),
      update: (id, body) => updateData("documents", id, body),
      remove: (id) => deleteData("documents", id)
    },
    backup: {
      export: async () => {
        const payload = await exportAllData();
        const json = JSON.stringify(payload, null, 2);
        return new Blob([json], { type: "application/json" });
      },
      import: async (body) => {
        await importAllData(body);
      }
    }
  };

  window.api = api;
})();
