import { useMemo, useState } from "react";
import { Inbox, PiggyBank } from "lucide-react";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { isFullAdmin } from "@/features/pos/utils/permissions";
import type { InvestmentDoc, ProfitWithdrawalDoc } from "../types";
import {
  accountLabel,
  createInvestment,
  createProfitWithdrawal,
  investmentTotals,
  kindLabel,
  removeInvestment,
  removeProfitWithdrawal
} from "../services/investmentService";
import { calcDashboardTotals } from "@/lib/calculations";
import type { ExpenseDoc, SaleDoc, StaffDoc, AttendanceDoc, AdvanceDoc, SupplierBillDoc } from "@/lib/firestoreTypes";
import type { PurchaseEntryDoc } from "@/features/inventory/types";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { ContentLoading } from "@/components/ui/Loading";

function monthISO(): string {
  return new Date().toISOString().slice(0, 7);
}

export function InvestmentsPage() {
  const { role } = usePosAuth();
  const canEdit = isFullAdmin(role) || role === "owner" || role === "manager" || role === "accountant" || role === "admin";

  const investments = useRestaurantCollection<InvestmentDoc>({ path: "investments" });
  const withdrawals = useRestaurantCollection<ProfitWithdrawalDoc>({ path: "profit_withdrawals" });
  const balanceTransfers = useRestaurantCollection<any>({ path: "balance_transfers" });
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

  const [invForm, setInvForm] = useState({
    date: isoDate(),
    kind: "capital_in" as "capital_in" | "shop_purchase",
    account: "cash" as "cash" | "online" | "personal",
    amount: "",
    title: "",
    notes: ""
  });
  const [wdForm, setWdForm] = useState({
    date: isoDate(),
    account: "cash" as "cash" | "online",
    amount: "",
    notes: ""
  });

  const totals = useMemo(
    () => investmentTotals(investments.data, withdrawals.data),
    [investments.data, withdrawals.data]
  );

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
        profitWithdrawals: withdrawals.data,
        balanceTransfers: balanceTransfers.data,
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
      withdrawals.data,
      balanceTransfers.data
    ]
  );

  const invRows = useMemo(
    () => [...investments.data].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
    [investments.data]
  );
  const wdRows = useMemo(
    () => [...withdrawals.data].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
    [withdrawals.data]
  );

  async function saveInvestment() {
    if (!canEdit) return;
    try {
      setBusy(true);
      setMsg(null);
      const amount = num(invForm.amount);
      if (invForm.kind === "shop_purchase" && (invForm.account === "cash" || invForm.account === "online")) {
        const avail = invForm.account === "cash" ? balances.cashBalance : balances.bankBalance;
        if (amount > avail + 0.009) {
          throw new Error(`Not enough ${accountLabel(invForm.account)}. Available: ${inr(avail)}`);
        }
      }
      await createInvestment({
        date: invForm.date,
        amount,
        kind: invForm.kind,
        account: invForm.account,
        title: invForm.title,
        notes: invForm.notes
      });
      setInvForm((f) => ({ ...f, amount: "", title: "", notes: "" }));
      setMsg("Investment saved");
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveWithdrawal() {
    if (!canEdit) return;
    try {
      setBusy(true);
      setMsg(null);
      const amount = num(wdForm.amount);
      const avail = wdForm.account === "cash" ? balances.cashBalance : balances.bankBalance;
      if (amount > avail + 0.009) {
        throw new Error(`Not enough ${accountLabel(wdForm.account)}. Available: ${inr(avail)}`);
      }
      await createProfitWithdrawal({
        date: wdForm.date,
        amount,
        account: wdForm.account,
        notes: wdForm.notes
      });
      setWdForm((f) => ({ ...f, amount: "", notes: "" }));
      setMsg("Profit withdrawal saved");
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Finance"
        title="Investments & income"
        description="Capital you put into The Kilogram, shop purchases, and profit you take out. Same module as before."
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {(investments.loading || withdrawals.loading) && <ContentLoading variant="block" label="Loading" />}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard title="Total invested" value={inr(totals.totalInvested)} icon={<PiggyBank size={16} />} tone="good" />
        <KpiCard title="Total take profit" value={inr(totals.totalTaken)} />
        <KpiCard title="Net capital" value={inr(totals.netCapital)} tone={totals.netCapital >= 0 ? "good" : "bad"} />
        <KpiCard title="Available cash" value={inr(balances.cashBalance)} />
        <KpiCard title="Available online" value={inr(balances.bankBalance)} />
      </div>

      <Card hover={false} padding="sm">
        <SectionTitle title="Add investment / income" description="Capital into the shop, or shop purchase counted as investment." />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Date
            <input
              type="date"
              className="kg-input !w-auto"
              value={invForm.date}
              disabled={!canEdit}
              onChange={(e) => setInvForm((f) => ({ ...f, date: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Type
            <select
              className="kg-input !w-auto"
              value={invForm.kind}
              disabled={!canEdit}
              onChange={(e) => setInvForm((f) => ({ ...f, kind: e.target.value as any }))}
            >
              <option value="capital_in">Capital / income added to shop</option>
              <option value="shop_purchase">Shop purchase / new item</option>
            </select>
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Account
            <select
              className="kg-input !w-auto"
              value={invForm.account}
              disabled={!canEdit}
              onChange={(e) => setInvForm((f) => ({ ...f, account: e.target.value as any }))}
            >
              <option value="cash">Cash</option>
              <option value="online">Online</option>
              <option value="personal">Personal (no balance change)</option>
            </select>
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Amount ₹
            <input
              type="number"
              min={0}
              className="kg-input !w-auto"
              value={invForm.amount}
              disabled={!canEdit}
              onChange={(e) => setInvForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Item / description
            <input
              className="kg-input !w-auto"
              value={invForm.title}
              disabled={!canEdit}
              onChange={(e) => setInvForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Owner capital / fridge"
            />
          </label>
        </div>
        <input
          className="kg-input mt-2 w-full"
          placeholder="Notes (optional)"
          value={invForm.notes}
          disabled={!canEdit}
          onChange={(e) => setInvForm((f) => ({ ...f, notes: e.target.value }))}
        />
        <button
          type="button"
          className="kg-btn kg-btn-primary mt-3 disabled:opacity-50"
          disabled={!canEdit || busy}
          onClick={() => void saveInvestment()}
        >
          {busy ? "Saving…" : "Save investment"}
        </button>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Item / note</th>
                <th className="px-3 py-2">Account</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {invRows.map((r) => (
                <tr key={r.id} className="border-t border-stroke-0">
                  <td className="px-3 py-2">{String(r.date).slice(0, 10)}</td>
                  <td className="px-3 py-2">{kindLabel(r.kind)}</td>
                  <td className="px-3 py-2 font-semibold">
                    {r.title || "—"}
                    {r.notes ? <div className="text-[11px] font-normal text-text-muted">{r.notes}</div> : null}
                  </td>
                  <td className="px-3 py-2">{accountLabel(r.account)}</td>
                  <td className="px-3 py-2 font-bold">{inr(r.amount)}</td>
                  <td className="px-3 py-2 text-right">
                    {canEdit ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-danger"
                        onClick={async () => {
                          if (!confirm("Delete this investment entry?")) return;
                          await removeInvestment(r.id);
                          setMsg("Investment deleted");
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
          {!invRows.length ? (
            <EmptyState className="m-3" icon={<Inbox size={18} />} title="No investments yet" description="Add capital or shop purchases above." />
          ) : null}
        </div>
      </Card>

      <Card hover={false} padding="sm">
        <SectionTitle title="Take profit" description="Withdraw earnings from Cash or Online — deducted from that account." />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Date
            <input
              type="date"
              className="kg-input !w-auto"
              value={wdForm.date}
              disabled={!canEdit}
              onChange={(e) => setWdForm((f) => ({ ...f, date: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            From
            <select
              className="kg-input !w-auto"
              value={wdForm.account}
              disabled={!canEdit}
              onChange={(e) => setWdForm((f) => ({ ...f, account: e.target.value as any }))}
            >
              <option value="cash">From Cash</option>
              <option value="online">From Online</option>
            </select>
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Amount ₹
            <input
              type="number"
              min={0}
              className="kg-input !w-auto"
              value={wdForm.amount}
              disabled={!canEdit}
              onChange={(e) => setWdForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Notes
            <input
              className="kg-input !w-auto"
              value={wdForm.notes}
              disabled={!canEdit}
              onChange={(e) => setWdForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional"
            />
          </label>
        </div>
        <button
          type="button"
          className="kg-btn kg-btn-primary mt-3 disabled:opacity-50"
          disabled={!canEdit || busy}
          onClick={() => void saveWithdrawal()}
        >
          {busy ? "Saving…" : "Take profit"}
        </button>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {wdRows.map((r) => (
                <tr key={r.id} className="border-t border-stroke-0">
                  <td className="px-3 py-2">{String(r.date).slice(0, 10)}</td>
                  <td className="px-3 py-2">{accountLabel(r.account)}</td>
                  <td className="px-3 py-2">{r.notes || "—"}</td>
                  <td className="px-3 py-2 font-bold">{inr(r.amount)}</td>
                  <td className="px-3 py-2 text-right">
                    {canEdit ? (
                      <button
                        type="button"
                        className="text-xs font-semibold text-danger"
                        onClick={async () => {
                          if (!confirm("Delete this take-profit entry? Balance will reverse.")) return;
                          await removeProfitWithdrawal(r.id);
                          setMsg("Withdrawal deleted");
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
          {!wdRows.length ? (
            <EmptyState className="m-3" icon={<Inbox size={18} />} title="No profit withdrawals yet" />
          ) : null}
        </div>
      </Card>
    </div>
  );
}
