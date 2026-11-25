import { useMemo, useState } from "react";
import { isoDate, num } from "@/lib/utils";
import { EXPENSE_CATEGORY_GROUPS } from "@/features/tasks/types";
import { upsertExpense } from "../services/expenseService";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { canCreateExpense } from "../utils/permissions";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/PageHeader";

const CUSTOM_KEY = "kg_expense_categories_v1";

type CustomCats = { kitchen: Array<{ id: string; label: string }>; fixed: Array<{ id: string; label: string }> };

function loadCustom(): CustomCats {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return { kitchen: [], fixed: [] };
    const parsed = JSON.parse(raw);
    return {
      kitchen: Array.isArray(parsed.kitchen) ? parsed.kitchen : [],
      fixed: Array.isArray(parsed.fixed) ? parsed.fixed : []
    };
  } catch {
    return { kitchen: [], fixed: [] };
  }
}

function saveCustom(c: CustomCats) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(c));
}

function slugify(label: string) {
  return String(label || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0900-\u097f]+/gi, "_")
    .replace(/^_|_$/g, "");
}

type Props = {
  onSaved?: () => void;
};

export function DailyExpenseForm({ onSaved }: Props) {
  const { role } = usePosAuth();
  const canCreate = canCreateExpense(role);
  const [group, setGroup] = useState<"kitchen" | "fixed">("kitchen");
  const [custom, setCustom] = useState<CustomCats>(() => loadCustom());
  const [date, setDate] = useState(isoDate());
  const [category, setCategory] = useState(EXPENSE_CATEGORY_GROUPS.kitchen[0]?.value || "vegetables");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"paid" | "unpaid">("paid");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const categories = useMemo(() => {
    const base = EXPENSE_CATEGORY_GROUPS[group] || [];
    const extras = (custom[group] || []).map((c) => ({ value: c.id, label: c.label }));
    const seen = new Set(base.map((b) => b.value));
    const merged = [...base];
    extras.forEach((e) => {
      if (seen.has(e.value)) return;
      seen.add(e.value);
      merged.push(e);
    });
    return merged;
  }, [group, custom]);

  function onGroupChange(g: "kitchen" | "fixed") {
    setGroup(g);
    const first = (EXPENSE_CATEGORY_GROUPS[g] || [])[0]?.value || "misc";
    setCategory(first);
  }

  function addCategory() {
    const label = String(prompt(`New ${group === "fixed" ? "fixed cost" : "kitchen"} category name:`) || "").trim();
    if (!label) return;
    let id = slugify(label);
    if (!id) {
      setMsg("Enter a valid name");
      return;
    }
    if (categories.some((c) => c.value === id || c.label.toLowerCase() === label.toLowerCase())) {
      setCategory(id);
      setMsg("Category already exists");
      return;
    }
    const next = { ...custom, [group]: [...(custom[group] || []), { id, label }] };
    saveCustom(next);
    setCustom(next);
    setCategory(id);
    setMsg(`Added “${label}”`);
  }

  async function save() {
    if (!canCreate) return;
    try {
      setBusy(true);
      setMsg(null);
      const amt = num(amount);
      if (!(amt > 0)) throw new Error("Enter valid amount");
      await upsertExpense(
        {
          date,
          category,
          amount: amt,
          status,
          paidFrom: paymentMethod === "online" ? "bank" : "cash",
          paymentMethod: status === "paid" ? (paymentMethod === "online" ? "online" : "cash") : "unpaid",
          note,
          description: note,
          approvalStatus: "approved",
          expenseType: "daily"
        },
        { file }
      );
      setAmount("");
      setNote("");
      setFile(null);
      setMsg("Expense saved");
      onSaved?.();
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="daily-expense-add">
    <Card hover={false} padding="sm">
      <SectionTitle
        title="Daily expenses"
        description="Add kitchen / fixed costs — same flow as before"
      />
      {!canCreate ? (
        <div className="mb-2 rounded-lg border border-stroke-0 bg-bg-1 px-3 py-2 text-[12px] text-text-muted">
          Your role cannot add expenses.
        </div>
      ) : null}
      {msg ? (
        <div className="mb-2 rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Type
          <select
            className="kg-input !w-auto"
            value={group}
            disabled={!canCreate}
            onChange={(e) => onGroupChange(e.target.value as "kitchen" | "fixed")}
          >
            <option value="kitchen">Kitchen / grocery</option>
            <option value="fixed">Fixed costs</option>
          </select>
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Category
          <select
            className="kg-input !w-auto"
            value={category}
            disabled={!canCreate}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-1 text-[12px] font-semibold text-text-muted">
          <span aria-hidden>&nbsp;</span>
          <button type="button" className="kg-btn kg-btn-secondary" disabled={!canCreate} onClick={addCategory}>
            + Add category
          </button>
        </div>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Date
          <input
            type="date"
            className="kg-input !w-auto"
            value={date}
            disabled={!canCreate}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Amount
          <input
            type="number"
            min={0}
            step={1}
            className="kg-input !w-auto"
            placeholder="0"
            value={amount}
            disabled={!canCreate}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
            }}
          />
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
          Status
          <select
            className="kg-input !w-auto"
            value={status}
            disabled={!canCreate}
            onChange={(e) => setStatus(e.target.value as "paid" | "unpaid")}
          >
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
        </label>
        {status === "paid" ? (
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Payment
            <select
              className="kg-input !w-auto"
              value={paymentMethod}
              disabled={!canCreate}
              onChange={(e) => setPaymentMethod(e.target.value as "cash" | "online")}
            >
              <option value="cash">Cash</option>
              <option value="online">Online</option>
            </select>
          </label>
        ) : null}
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted sm:col-span-2">
          Note
          <input
            className="kg-input !w-auto"
            placeholder="Optional note"
            value={note}
            disabled={!canCreate}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-[12px] font-semibold text-text-muted sm:col-span-2">
          Bill photo / PDF
          <input
            type="file"
            accept="image/*,application/pdf"
            className="kg-input !w-auto !py-1.5 text-[12px]"
            disabled={!canCreate}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <div className="grid gap-1 text-[12px] font-semibold text-text-muted">
          <span aria-hidden>&nbsp;</span>
          <button
            type="button"
            className="kg-btn kg-btn-primary disabled:opacity-50"
            disabled={!canCreate || busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save Expense"}
          </button>
        </div>
      </div>
    </Card>
    </div>
  );
}
