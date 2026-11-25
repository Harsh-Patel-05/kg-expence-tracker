import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Inbox } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState, PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import type { ExpenseDoc, SaleDoc, SupplierBillDoc } from "@/lib/firestoreTypes";
import { buildTransactionHistory, filterTransactions } from "@/lib/transactions";
import { inr, isoDate, num } from "@/lib/utils";
import { ContentLoading } from "@/components/ui/Loading";

export function TransactionsHistoryPage() {
  const sales = useRestaurantCollection<SaleDoc>({ path: "sales", orderByField: "date", orderDir: "desc" });
  const expenses = useRestaurantCollection<ExpenseDoc>({ path: "expenses", orderByField: "date", orderDir: "desc" });
  const supplierBills = useRestaurantCollection<SupplierBillDoc>({ path: "supplierBills" });
  const supplierPayments = useRestaurantCollection<any>({
    path: "supplierPayments",
    orderByField: "date",
    orderDir: "desc"
  });

  const today = isoDate();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [kind, setKind] = useState("all");

  const allRows = useMemo(
    () =>
      buildTransactionHistory({
        sales: sales.data,
        expenses: expenses.data,
        supplierBills: supplierBills.data,
        supplierPayments: supplierPayments.data
      }),
    [sales.data, expenses.data, supplierBills.data, supplierPayments.data]
  );

  const filtered = useMemo(
    () =>
      filterTransactions(allRows, {
        from,
        to,
        minAmount: minAmount === "" ? undefined : num(minAmount),
        maxAmount: maxAmount === "" ? undefined : num(maxAmount),
        kind
      }),
    [allRows, from, to, minAmount, maxAmount, kind]
  );

  const loading = sales.loading || expenses.loading || supplierBills.loading;

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Overview"
        title="Transaction history"
        description="All sales, expenses, and supplier payments — filter by date and amount."
        actions={
          <Link to="/" className="kg-btn kg-btn-secondary">
            Back to dashboard
          </Link>
        }
      />

      <Card hover={false} padding="sm">
        <SectionTitle title="Filters" />
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            From date
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            To date
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Min amount ₹
            <Input
              type="number"
              min={0}
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="Any"
            />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Max amount ₹
            <Input
              type="number"
              min={0}
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="Any"
            />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-text-muted">
            Type
            <select className="kg-input !w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All</option>
              <option value="sale">Sale</option>
              <option value="expense">Expense</option>
              <option value="supplier paid">Supplier paid</option>
              <option value="supplier payment">Supplier payment</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className="kg-btn kg-btn-secondary w-full"
              onClick={() => {
                setFrom(monthStart);
                setTo(today);
                setMinAmount("");
                setMaxAmount("");
                setKind("all");
              }}
            >
              Reset
            </button>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-text-muted">
          Showing {filtered.length} of {allRows.length} transactions
        </p>
      </Card>

      {loading ? <ContentLoading variant="block" label="Loading history" /> : null}

      <Card hover={false} className="!p-0 overflow-hidden">
        {filtered.length ? (
          <div className="divide-y divide-stroke-0">
            {filtered.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-text-primary">
                    {t.kind}
                    {t.label ? <span className="font-normal text-text-muted"> · {t.label}</span> : null}
                  </div>
                  <div className="text-[11px] text-text-muted">{t.date}</div>
                </div>
                <div
                  className={
                    t.amount >= 0
                      ? "text-[13px] font-bold tabular-nums text-success"
                      : "text-[13px] font-bold tabular-nums text-danger"
                  }
                >
                  {t.amount >= 0 ? "+" : "−"}
                  {inr(Math.abs(t.amount))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            className="m-4"
            icon={<Inbox size={18} />}
            title="No matching transactions"
            description="Try widening the date range or clearing amount filters."
          />
        )}
      </Card>
    </div>
  );
}
