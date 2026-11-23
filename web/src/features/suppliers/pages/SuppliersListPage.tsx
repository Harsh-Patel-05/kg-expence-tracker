import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { PurchaseEntryDoc } from "@/features/inventory/types";
import type { SupplierDoc, SupplierPaymentDoc } from "../types";
import { buildSupplierLedger } from "../utils/ledger";
import { canEditSuppliers } from "../utils/permissions";
import {
  archiveSupplier,
  duplicateSupplier,
  logSupplierContact,
  mergeSuppliers,
  saveSupplierRating,
  softDeleteSupplier,
  upsertSupplier
} from "../services/supplierService";

const empty = {
  id: "",
  name: "",
  supplierCode: "",
  companyName: "",
  gstin: "",
  pan: "",
  contact: "",
  phone: "",
  whatsapp: "",
  email: "",
  website: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  upi: "",
  paymentTerms: "Net 30",
  creditLimit: "",
  creditDays: "30",
  category: "General",
  notes: ""
};

export function SuppliersListPage() {
  const { role } = usePosAuth();
  const canEdit = canEditSuppliers(role);
  const { data: suppliers, loading, error } = useRestaurantCollection<SupplierDoc>({ path: "suppliers" });
  const { data: purchases } = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases" });
  const { data: payments } = useRestaurantCollection<SupplierPaymentDoc>({ path: "supplierPayments" });

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [credit, setCredit] = useState("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(empty);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mergeId, setMergeId] = useState("");
  const [rating, setRating] = useState({ quality: "4", delivery: "4", pricing: "4", service: "4", notes: "" });
  const [contact, setContact] = useState({ channel: "call" as const, note: "", nextFollowUp: "" });

  const ledger = useMemo(() => buildSupplierLedger({ suppliers, purchases, payments, today: isoDate() }), [suppliers, purchases, payments]);
  const ledgerMap = useMemo(() => new Map(ledger.map((r) => [r.supplierId, r])), [ledger]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return suppliers.filter((s) => {
      if (s.archived && credit !== "archived") return false;
      if (category !== "all" && (s.category || "General") !== category) return false;
      const row = ledgerMap.get(s.id);
      if (credit === "outstanding" && !(row && row.outstanding > 0)) return false;
      if (credit === "overdue" && !(row && row.overdue > 0)) return false;
      if (credit === "limit" && !(row && row.creditLimit > 0 && row.creditUsed >= row.creditLimit * 0.9)) return false;
      if (!query) return true;
      return `${s.name} ${s.supplierCode || ""} ${s.gstin || ""} ${s.phone || ""} ${s.email || ""} ${s.companyName || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [suppliers, q, category, credit, ledgerMap]);

  const categories = useMemo(() => {
    const set = new Set(suppliers.map((s) => s.category || "General"));
    return ["all", ...Array.from(set).sort()];
  }, [suppliers]);

  const selected = suppliers.find((s) => s.id === selectedId) || null;
  const selectedLedger = selected ? ledgerMap.get(selected.id) : null;

  async function save() {
    if (!canEdit) return;
    try {
      setBusy(true);
      const id = await upsertSupplier({
        id: form.id || undefined,
        name: form.name,
        supplierCode: form.supplierCode || undefined,
        companyName: form.companyName,
        gstin: form.gstin,
        pan: form.pan,
        contact: form.contact,
        phone: form.phone,
        whatsapp: form.whatsapp,
        email: form.email,
        website: form.website,
        address: form.address,
        city: form.city,
        state: form.state,
        pincode: form.pincode,
        upi: form.upi,
        paymentTerms: form.paymentTerms,
        creditLimit: num(form.creditLimit),
        creditDays: num(form.creditDays),
        category: form.category,
        notes: form.notes
      });
      setMsg("Supplier saved");
      setForm(empty);
      setSelectedId(id);
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function edit(s: SupplierDoc & { id: string }) {
    setForm({
      id: s.id,
      name: s.name || "",
      supplierCode: s.supplierCode || "",
      companyName: s.companyName || "",
      gstin: s.gstin || "",
      pan: s.pan || "",
      contact: s.contact || "",
      phone: s.phone || "",
      whatsapp: s.whatsapp || "",
      email: s.email || "",
      website: s.website || "",
      address: s.address || "",
      city: s.city || "",
      state: s.state || "",
      pincode: s.pincode || "",
      upi: s.upi || "",
      paymentTerms: s.paymentTerms || "Net 30",
      creditLimit: String(s.creditLimit ?? ""),
      creditDays: String(s.creditDays ?? 30),
      category: s.category || "General",
      notes: s.notes || ""
    });
    setSelectedId(s.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/suppliers" className="text-xs font-semibold text-cyan-700">
            ← Suppliers
          </Link>
          <h1 className="text-2xl font-black text-slate-900">Supplier master</h1>
        </div>
      </div>

      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}
      {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[320px_1fr_300px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">{form.id ? "Edit supplier" : "Add supplier"}</div>
          <div className="grid max-h-[70vh] gap-2 overflow-auto pr-1">
            {(
              [
                ["name", "Name"],
                ["supplierCode", "Code"],
                ["companyName", "Company"],
                ["gstin", "GSTIN"],
                ["pan", "PAN"],
                ["contact", "Contact person"],
                ["phone", "Phone"],
                ["whatsapp", "WhatsApp"],
                ["email", "Email"],
                ["website", "Website"],
                ["address", "Address"],
                ["city", "City"],
                ["state", "State"],
                ["pincode", "Pincode"],
                ["upi", "UPI"],
                ["paymentTerms", "Payment terms"],
                ["creditLimit", "Credit limit"],
                ["creditDays", "Credit days"],
                ["category", "Category"],
                ["notes", "Notes"]
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="grid gap-1 text-xs font-semibold text-slate-600">
                {label}
                <input
                  disabled={!canEdit}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            ))}
            <button disabled={!canEdit || busy || !form.name.trim()} onClick={save} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Save supplier"}
            </button>
          </div>
        </div>

        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm" placeholder="Search name, GST, phone, code…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "All categories" : c}
                </option>
              ))}
            </select>
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={credit} onChange={(e) => setCredit(e.target.value)}>
              <option value="all">All status</option>
              <option value="outstanding">Outstanding</option>
              <option value="overdue">Overdue</option>
              <option value="limit">Near credit limit</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {loading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70" /> : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Purchases</th>
                  <th className="px-3 py-2">Outstanding</th>
                  <th className="px-3 py-2">Rating</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const row = ledgerMap.get(s.id);
                  return (
                    <tr key={s.id} className={`border-t border-slate-100 ${selectedId === s.id ? "bg-cyan-50/50" : ""}`}>
                      <td className="px-3 py-2">
                        <button type="button" className="text-left" onClick={() => setSelectedId(s.id)}>
                          <div className="font-semibold">{s.name}</div>
                          <div className="text-xs text-slate-500">
                            {s.supplierCode || "—"} · {s.gstin || "no GST"} · {s.phone || "—"}
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-2">{inr(row?.purchases || 0)}</td>
                      <td className="px-3 py-2 font-bold">{inr(row?.outstanding || 0)}</td>
                      <td className="px-3 py-2">{num(s.rating).toFixed(1)}</td>
                      <td className="px-3 py-2 text-right">
                        {canEdit ? (
                          <button className="text-xs font-semibold text-cyan-700" onClick={() => edit(s)}>
                            Edit
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && !loading ? <div className="py-10 text-center text-sm text-slate-500">No suppliers found.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!selected ? <div className="py-12 text-center text-sm text-slate-500">Select a supplier</div> : null}
          {selected ? (
            <div className="space-y-3">
              <div>
                <div className="text-lg font-black">{selected.name}</div>
                <div className="text-xs text-slate-500">{selected.companyName || selected.category}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[10px] uppercase text-slate-500">Outstanding</div>
                  <div className="font-bold">{inr(selectedLedger?.outstanding || 0)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[10px] uppercase text-slate-500">Credit avail</div>
                  <div className="font-bold">{inr(selectedLedger?.availableCredit || 0)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[10px] uppercase text-slate-500">Overdue</div>
                  <div className="font-bold">{inr(selectedLedger?.overdue || 0)}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <div className="text-[10px] uppercase text-slate-500">Last PO</div>
                  <div className="font-bold text-xs">{selectedLedger?.lastPurchaseDate || "—"}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="text-xs font-semibold text-cyan-700" onClick={async () => { await duplicateSupplier(selected.id); setMsg("Duplicated"); }}>
                  Duplicate
                </button>
                <button className="text-xs font-semibold text-amber-700" onClick={async () => { await archiveSupplier(selected.id, !selected.archived); setMsg(selected.archived ? "Restored" : "Archived"); }}>
                  {selected.archived ? "Restore" : "Archive"}
                </button>
                <button className="text-xs font-semibold text-rose-600" onClick={async () => { await softDeleteSupplier(selected.id); setSelectedId(null); setMsg("Deleted"); }}>
                  Delete
                </button>
              </div>

              <div>
                <div className="mb-1 text-xs font-bold uppercase text-slate-500">Merge into this</div>
                <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={mergeId} onChange={(e) => setMergeId(e.target.value)}>
                  <option value="">Select duplicate…</option>
                  {suppliers.filter((s) => s.id !== selected.id).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={!canEdit || !mergeId}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40"
                  onClick={async () => {
                    await mergeSuppliers(selected.id, mergeId);
                    setMergeId("");
                    setMsg("Merged suppliers");
                  }}
                >
                  Merge selected → keep this
                </button>
              </div>

              <div>
                <div className="mb-1 text-xs font-bold uppercase text-slate-500">Rate supplier</div>
                <div className="grid grid-cols-2 gap-2">
                  {(["quality", "delivery", "pricing", "service"] as const).map((k) => (
                    <input key={k} type="number" min={1} max={5} step={0.5} className="rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder={k} value={(rating as any)[k]} onChange={(e) => setRating((r) => ({ ...r, [k]: e.target.value }))} />
                  ))}
                </div>
                <button
                  className="mt-2 w-full rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                  onClick={async () => {
                    await saveSupplierRating({
                      supplierId: selected.id,
                      supplierName: selected.name,
                      quality: num(rating.quality),
                      delivery: num(rating.delivery),
                      pricing: num(rating.pricing),
                      service: num(rating.service),
                      notes: rating.notes
                    });
                    setMsg("Rating saved");
                  }}
                >
                  Save rating
                </button>
              </div>

              <div>
                <div className="mb-1 text-xs font-bold uppercase text-slate-500">Contact log</div>
                <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={contact.channel} onChange={(e) => setContact((c) => ({ ...c, channel: e.target.value as any }))}>
                  <option value="call">Call</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                </select>
                <textarea className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" rows={2} value={contact.note} onChange={(e) => setContact((c) => ({ ...c, note: e.target.value }))} placeholder="Notes" />
                <input type="date" className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={contact.nextFollowUp} onChange={(e) => setContact((c) => ({ ...c, nextFollowUp: e.target.value }))} />
                <button
                  className="w-full rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-white"
                  onClick={async () => {
                    await logSupplierContact({
                      supplierId: selected.id,
                      supplierName: selected.name,
                      channel: contact.channel,
                      note: contact.note,
                      nextFollowUp: contact.nextFollowUp || null
                    });
                    setMsg("Contact logged");
                    setContact({ channel: "call", note: "", nextFollowUp: "" });
                  }}
                >
                  Log contact
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
