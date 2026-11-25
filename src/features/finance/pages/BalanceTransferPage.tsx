import { useMemo, useState } from "react";
import { ArrowLeftRight, Inbox } from "lucide-react";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { isFullAdmin } from "@/features/pos/utils/permissions";
import { calcDashboardTotals } from "@/lib/calculations";
import type { ExpenseDoc, SaleDoc, StaffDoc, AttendanceDoc, AdvanceDoc, SupplierBillDoc } from "@/lib/firestoreTypes";
import type { PurchaseEntryDoc } from "@/features/inventory/types";
import {
  createBalanceTransfer,
  removeBalanceTransfer,
  type BalanceTransferDoc
} from "../services/balanceTransferService";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { ContentLoading } from "@/components/ui/Loading";

function monthISO(): string {
  return new Date().toISOString().slice(0, 7);
}

export function BalanceTransferPage() {
  const { role } = usePosAuth();
  const canEdit = isFullAdmin(role) || role === "owner" || role === "manager" || role === "accountant" || role === "admin";

  const transfers = useRestaurantCollection<BalanceTransferDoc>({ path: "balance_transfers" });
  const investments = useRestaurantCollection<any>({ path: "investments" });
  const profitWithdrawals = useRestaurantCollection<any>({ path: "profit_withdrawals" });
  const sales = useRestaurantCollection<SaleDoc>({ path: "sales", orderByField: "date", orderDir: "desc" });
  const expenses = useRestaurantCollection<ExpenseDoc>({ path: "expenses", orderByField: "date", orderDir: "desc" });
  const supplierBills = useRestaurantCollection<SupplierBillDoc>({ path: "supplierBills" });
  const purchases = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases", orderByField: "date", orderDir: "desc" });
  const supplierPayments = useRestaurantCollection<any>({
    path: "supplierPayments",
    orderByField: "date",
    orderDir: "desc"
  });
  const staff = useRestaurantCollection<StaffDoc>({ path: "staff" });
  const attendance = useRestaurantCollection<AttendanceDoc>({ path: "attendance", orderByField: "date", orderDir: "desc" });
  const advances = useRestaurantCollection<AdvanceDoc>({ path: "advances", orderByField: "date", orderDir: "desc" });
  const salaries = useRestaurantCollection<any>({ path: "salaries" });
  const fixedSalaries = useRestaurantCollection<any>({ path: "fixedSalaries" });

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<"today" | "week" | "month" | "all">("month");
  const [form, setForm] = useState({
    fromAccount: "cash" as "cash" | "bank",
    toAccount: "bank" as "cash" | "bank",
    amount: "",
    date: isoDate(),
    notes: ""
  });

  const balances = useMemo(
    () =>
      calcDashboardTotals({
        sales: sales.data,
        expenses: expenses.data,
        supplierBills: supplierBills.data,
        purchases: purchases.data,
        supplierPayments: supplierPayments.data,
        staff: staff.data,
        attendance: attendance.data,
        advances: advances.data,
        salaries: salaries.data,
        fixedSalaries: fixedSalaries.data,
        investments: investments.data,
        profitWithdrawals: profitWithdrawals.data,
        balanceTransfers: transfers.data,
        monthISO: monthISO()
      }),
    [
      sales.data,
      expenses.data,
      supplierBills.data,
      purchases.data,
      supplierPayments.data,
      staff.data,
      attendance.data,
      advances.data,
      salaries.data,
      fixedSalaries.data,
      investments.data,
      profitWithdrawals.data,
      transfers.data
    ]
  );

  const rows = useMemo(() => {
    const today = isoDate();
    const month = today.slice(0, 7);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekISO = weekAgo.toISOString().slice(0, 10);
    return [...transfers.data]
      .filter((r) => {
        const d = String(r.date || "").slice(0, 10);
        if (range === "today") return d === today;
        if (range === "week") return d >= weekISO;
        if (range === "month") return d.startsWith(month);
        return true;
      })
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [transfers.data, range]);

  async function save() {
    if (!canEdit) return;
    try {
      setBusy(true);
      setMsg(null);
      const amount = num(form.amount);
      const available = form.fromAccount === "cash" ? balances.cashBalance : balances.bankBalance;
      if (amount > available + 0.009) {
        throw new Error(`Insufficient ${form.fromAccount} balance. Available: ${inr(available)}`);
      }
      await createBalanceTransfer({
        date: form.date,
        fromAccount: form.fromAccount,
        toAccount: form.toAccount,
        amount,
        notes: form.notes
      });
      setForm((f) => ({ ...f, amount: "", notes: "" }));
      setMsg("Transfer saved");
    } catch (e: any) {
      setMsg(e?.message || "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Finance"
        title="Balance transfer"
        description="Move money between Cash and Bank/Online — same as the classic Balance Transfer section."
      />
      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {transfers.loading && <ContentLoading variant="block" label="Loading" />}

      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard title="Available cash" value={inr(balances.cashBalance)} icon={<ArrowLeftRight size={16} />} />
        <KpiCard title="Available bank / online" value={inr(balances.bankBalance)} />
      </div>

      <Card hover={false} padding="sm">
        <SectionTitle title="Transfer" />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            From
            <select
              className="kg-input !w-auto"
              value={form.fromAccount}
              disabled={!canEdit}
              onChange={(e) => {
                const from = e.target.value as "cash" | "bank";
                setForm((f) => ({
                  ...f,
                  fromAccount: from,
                  toAccount: from === "cash" ? "bank" : "cash"
                }));
              }}
            >
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </select>
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            To
            <select
              className="kg-input !w-auto"
              value={form.toAccount}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, toAccount: e.target.value as "cash" | "bank" }))}
            >
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
            </select>
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Amount ₹
            <input
              type="number"
              min={0}
              className="kg-input !w-auto"
              value={form.amount}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Date
            <input
              type="date"
              className="kg-input !w-auto"
              value={form.date}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Notes
            <input
              className="kg-input !w-auto"
              value={form.notes}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional"
            />
          </label>
        </div>
        <button type="button" className="kg-btn kg-btn-primary mt-3 disabled:opacity-50" disabled={!canEdit || busy} onClick={() => void save()}>
          {busy ? "Transferring…" : "Transfer"}
        </button>
      </Card>

      <Card hover={false} padding="sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle title="Transfer history" />
          <select className="kg-input !w-auto" value={range} onChange={(e) => setRange(e.target.value as any)}>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-stroke-0">
                  <td className="px-3 py-2">{String(r.date).slice(0, 10)}</td>
                  <td className="px-3 py-2 capitalize">{r.fromAccount}</td>
                  <td className="px-3 py-2 capitalize">{r.toAccount}</td>
                  <td className="px-3 py-2 font-bold">{inr(r.amount)}</td>
                  <td className="px-3 py-2">{r.notes || "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {canEdit ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-danger"
                        onClick={async () => {
                          if (!confirm("Delete this transfer? Balances will reverse.")) return;
                          await removeBalanceTransfer(r.id);
                          setMsg("Transfer deleted");
                        }}
                      >
                        Delete
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="No transfers in this period." /> : null}
        </div>
      </Card>
    </div>
  );
}
