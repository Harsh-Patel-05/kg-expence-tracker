import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Inbox } from "lucide-react";
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
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";

import { ContentLoading } from "@/components/ui/Loading";

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
    <div className="grid gap-4">
      <PageHeader
        back={<Link to="/suppliers" className="text-xs font-semibold text-primary"> ← Suppliers </Link>}
        title="Supplier master"
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[320px_1fr_300px]">
        <Card padding="sm" hover={false}>
          <SectionTitle title={form.id ? "Edit supplier" : "Add supplier"} />
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
              <label key={key} className="grid gap-1 text-[12px] font-semibold text-text-muted">
                {label}
                <input
                  disabled={!canEdit}
                  className="kg-input !w-auto"
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            ))}
            <button disabled={!canEdit || busy || !form.name.trim()} onClick={save} className="kg-btn kg-btn-primary disabled:opacity-50">
              {busy ? "Saving…" : "Save supplier"}
            </button>
          </div>
        </Card>

        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
              <input className="kg-input w-full !pl-9 pr-3" placeholder="Search name, GST, phone, code…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search suppliers" />
            </div>
            <select className="kg-input !w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "All categories" : c}
                </option>
              ))}
            </select>
            <select className="kg-input !w-auto" value={credit} onChange={(e) => setCredit(e.target.value)}>
              <option value="all">All status</option>
              <option value="outstanding">Outstanding</option>
              <option value="overdue">Overdue</option>
              <option value="limit">Near credit limit</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {loading ? <ContentLoading variant="table" label="Loading" /> : null}

          <Card hover={false} className="!p-0">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                <tr>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2">Purchases</th>
                  <th className="px-3 py-2">Outstanding</th>
                  <th className="px-3 py-2">Rating</th>
                  <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => {
                  const row = ledgerMap.get(s.id);
                  return (
                    <tr key={s.id} className={`border-t border-stroke-0 ${selectedId === s.id ? "bg-primary-light" : ""}`}>
                      <td className="px-3 py-2">
                        <button type="button" className="text-left" onClick={() => setSelectedId(s.id)}>
                          <div className="font-semibold">{s.name}</div>
                          <div className="text-xs text-text-muted">
                            {s.supplierCode || "—"} · {s.gstin || "no GST"} · {s.phone || "—"}
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-2">{inr(row?.purchases || 0)}</td>
                      <td className="px-3 py-2 font-bold">{inr(row?.outstanding || 0)}</td>
                      <td className="px-3 py-2">{num(s.rating).toFixed(1)}</td>
                      <td className="px-3 py-2 text-right">
                        {canEdit ? (
                          <button className="text-xs font-semibold text-primary" onClick={() => edit(s)}>
                            Edit
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            {!rows.length && !loading ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No suppliers found." /> : null}
          </Card>
        </div>

        <Card padding="sm" hover={false}>
          {!selected ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="Select a supplier" /> : null}
          {selected ? (
            <div className="space-y-3">
              <div>
                <div className="text-[16px] font-bold text-text-primary">{selected.name}</div>
                <div className="text-xs text-text-muted">{selected.companyName || selected.category}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[13px]">
                <div className="rounded-lg border border-stroke-0 bg-bg-1/60 p-2">
                  <div className="text-[10px] uppercase text-text-muted">Outstanding</div>
                  <div className="font-bold">{inr(selectedLedger?.outstanding || 0)}</div>
                </div>
                <div className="rounded-lg border border-stroke-0 bg-bg-1/60 p-2">
                  <div className="text-[10px] uppercase text-text-muted">Credit avail</div>
                  <div className="font-bold">{inr(selectedLedger?.availableCredit || 0)}</div>
                </div>
                <div className="rounded-lg border border-stroke-0 bg-bg-1/60 p-2">
                  <div className="text-[10px] uppercase text-text-muted">Overdue</div>
                  <div className="font-bold">{inr(selectedLedger?.overdue || 0)}</div>
                </div>
                <div className="rounded-lg border border-stroke-0 bg-bg-1/60 p-2">
                  <div className="text-[10px] uppercase text-text-muted">Last PO</div>
                  <div className="font-bold text-xs">{selectedLedger?.lastPurchaseDate || "—"}</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="text-xs font-semibold text-primary" onClick={async () => { await duplicateSupplier(selected.id); setMsg("Duplicated"); }}>
                  Duplicate
                </button>
                <button className="text-xs font-semibold text-warning" onClick={async () => { await archiveSupplier(selected.id, !selected.archived); setMsg(selected.archived ? "Restored" : "Archived"); }}>
                  {selected.archived ? "Restore" : "Archive"}
                </button>
                <button className="text-xs font-semibold text-danger" onClick={async () => { await softDeleteSupplier(selected.id); setSelectedId(null); setMsg("Deleted"); }}>
                  Delete
                </button>
              </div>

              <div>
                <div className="mb-1 text-xs font-bold uppercase text-text-muted">Merge into this</div>
                <select className="kg-input mb-2 w-full" value={mergeId} onChange={(e) => setMergeId(e.target.value)}>
                  <option value="">Select duplicate…</option>
                  {suppliers.filter((s) => s.id !== selected.id).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  disabled={!canEdit || !mergeId}
                  className="kg-btn kg-btn-secondary w-full disabled:opacity-40"
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
                <div className="mb-1 text-xs font-bold uppercase text-text-muted">Rate supplier</div>
                <div className="grid grid-cols-2 gap-2">
                  {(["quality", "delivery", "pricing", "service"] as const).map((k) => (
                    <input key={k} type="number" min={1} max={5} step={0.5} className="kg-input !w-auto" placeholder={k} value={(rating as any)[k]} onChange={(e) => setRating((r) => ({ ...r, [k]: e.target.value }))} />
                  ))}
                </div>
                <button
                  className="kg-btn kg-btn-primary mt-2 w-full"
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
                <div className="mb-1 text-xs font-bold uppercase text-text-muted">Contact log</div>
                <select className="kg-input mb-2 w-full" value={contact.channel} onChange={(e) => setContact((c) => ({ ...c, channel: e.target.value as any }))}>
                  <option value="call">Call</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="meeting">Meeting</option>
                </select>
                <textarea className="kg-input mb-2 w-full" rows={2} value={contact.note} onChange={(e) => setContact((c) => ({ ...c, note: e.target.value }))} placeholder="Notes" />
                <input type="date" className="kg-input mb-2 w-full" value={contact.nextFollowUp} onChange={(e) => setContact((c) => ({ ...c, nextFollowUp: e.target.value }))} />
                <button
                  className="kg-btn kg-btn-primary w-full"
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
        </Card>
      </div>
    </div>
  );
}
