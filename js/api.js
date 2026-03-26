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
    return {
      menuItems: {
        list: () => fetchJson("/api/menu-items", { method: "GET" }),
        create: (body) => fetchJson("/api/menu-items", { method: "POST", body: JSON.stringify(body) }),
        bulkCreate: async (items) => {
          const res = await fetchJson("/api/menu-items/bulk", { method: "POST", body: JSON.stringify({ items }) });
          return Array.isArray(res?.items) ? res.items : [];
        },
        update: (id, body) => fetchJson(`/api/menu-items/${id}`, { method: "PUT", body: JSON.stringify(body) }),
        remove: (id) => fetchJson(`/api/menu-items/${id}`, { method: "DELETE" })
      },
      orders: {
        list: (params) => {
          const q = params && params.date ? `?date=${encodeURIComponent(params.date)}` : "";
          return fetchJson(`/api/orders${q}`, { method: "GET" });
        },
        create: (body) => fetchJson("/api/orders", { method: "POST", body: JSON.stringify(body) })
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
        remove: (id) => fetchJson(`/api/inventory/${id}`, { method: "DELETE" })
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
    console.error("Firestore API not initialized: window.firebaseDB is missing.");
    return;
  }

  const {
    addData,
    getData,
    deleteData,
    updateData,
    upsertByField,
    getDocsByField,
    getDocById,
    exportAllData,
    importAllData
  } = fb;

  // Keep the existing API shape used by `js/app.js` (window.api.*).
  const api = {
    menuItems: {
      list: () => getData("menuItems"),
      create: (body) => addData("menuItems", body),
      update: (id, body) => updateData("menuItems", id, body),
      remove: (id) => deleteData("menuItems", id)
    },
    orders: {
      list: () => getData("orders"),
      create: (body) => addData("orders", body),
      remove: (id) => deleteData("orders", id)
    },
    sales: {
      list: () => getData("sales"),
      create: (body) => addData("sales", body),
      remove: (id) => deleteData("sales", id)
    },
    purchases: {
      list: () => getData("purchases"),
      create: async (body) => {
        const purchaseId = await addData("purchases", body);

        // Keep inventory in sync with paid/unpaid purchase qty by default (same as old backend).
        // Roll-forward inventory by purchase.qty.
        const qty = Number(body.qty || 0);
        const item = body.item;
        if (item && qty > 0) {
          const matches = await getDocsByField("inventory", "item", item);
          if (matches.length) {
            const inv = matches[0];
            const nextQty = Number(inv.qty || 0) + qty;
            await updateData("inventory", inv.id, { qty: nextQty });
          } else {
            await addData("inventory", { item, unit: "unit", qty, threshold: 0 });
          }
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
      remove: (id) => deleteData("inventory", id)
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
