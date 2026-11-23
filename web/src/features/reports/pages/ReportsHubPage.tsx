import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { ExpenseDoc } from "@/features/tasks/types";
import type { InventoryItemDoc, PurchaseEntryDoc, WastageDoc } from "@/features/inventory/types";
import type { AttendanceDoc, EmployeeDoc, SalaryDoc } from "@/features/hr/types";
import type { SupplierDoc, SupplierPaymentDoc } from "@/features/suppliers/types";
import { buildSupplierLedger } from "@/features/suppliers/utils/ledger";
import { canAccessReports, canExportReports, canViewSalaryReports } from "@/features/suppliers/utils/permissions";
import {
  downloadText,
  expenseReport,
  inventoryReport,
  printReport,
  profitReport,
  purchaseReport,
  salaryReport,
  salesSummary,
  staffAttendanceReport,
  supplierAnalytics,
  toCsv,
  wastageReport,
  type ReportFilters,
  type SaleLike
} from "../utils/reportEngine";
import { cacheReportSnapshot, logReportExport, saveScheduledReport } from "../services/reportService";

const COLORS = ["#0f172a", "#06b6d4", "#64748b", "#f59e0b", "#ef4444", "#10b981", "#8b5cf6", "#ec4899"];

type ReportTab =
  | "overview"
  | "sales"
  | "profit"
  | "gst"
  | "expenses"
  | "inventory"
  | "purchases"
  | "suppliers"
  | "staff"
  | "wastage";

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function ReportsHubPage() {
  const { role } = usePosAuth();
  const canAccess = canAccessReports(role);
  const canExport = canExportReports(role);
  const canSalary = canViewSalaryReports(role);

  const [tab, setTab] = useState<ReportTab>("overview");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoDate());
  const [category, setCategory] = useState("all");
  const [supplier, setSupplier] = useState("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");

  const { data: sales } = useRestaurantCollection<SaleLike>({ path: "sales" });
  const { data: expenses } = useRestaurantCollection<ExpenseDoc>({ path: "expenses" });
  const { data: purchases } = useRestaurantCollection<PurchaseEntryDoc>({ path: "purchases" });
  const { data: inventory } = useRestaurantCollection<InventoryItemDoc>({ path: "inventory" });
  const { data: wastage } = useRestaurantCollection<WastageDoc>({ path: "wastage" });
  const { data: suppliers } = useRestaurantCollection<SupplierDoc>({ path: "suppliers" });
  const { data: payments } = useRestaurantCollection<SupplierPaymentDoc>({ path: "supplierPayments" });
  const { data: staff } = useRestaurantCollection<EmployeeDoc>({ path: "staff" });
  const { data: attendance } = useRestaurantCollection<AttendanceDoc>({ path: "attendance" });
  const { data: salaries } = useRestaurantCollection<SalaryDoc>({ path: "salaries" });

  const filters: ReportFilters = { from, to, category, supplier };

  const salesR = useMemo(() => salesSummary(sales, filters), [sales, from, to]);
  const expR = useMemo(() => expenseReport(expenses, filters), [expenses, from, to, category, supplier]);
  const purR = useMemo(() => purchaseReport(purchases, filters), [purchases, from, to, supplier]);
  const invR = useMemo(() => inventoryReport(inventory), [inventory]);
  const wasteR = useMemo(() => wastageReport(wastage, filters), [wastage, from, to]);
  const profit = useMemo(
    () =>
      profitReport({
        salesTotal: salesR.total,
        expenseTotal: expR.paid,
        purchasePaid: purR.total - purR.unpaid
      }),
    [salesR, expR, purR]
  );
  const ledger = useMemo(() => buildSupplierLedger({ suppliers, purchases, payments, today: isoDate() }), [suppliers, purchases, payments]);
  const supA = useMemo(() => supplierAnalytics(ledger), [ledger]);
  const month = to.slice(0, 7);
  const staffR = useMemo(() => staffAttendanceReport(staff, attendance, month), [staff, attendance, month]);
  const salR = useMemo(() => salaryReport(salaries, filters), [salaries, from, to]);

  const pieCats = expR.byCategory.slice(0, 8).map((c) => ({ name: c.category, value: c.total }));

  async function exportCsv(kind: string, headers: string[], rows: Array<Array<string | number>>) {
    if (!canExport) return;
    const csv = toCsv(headers, rows);
    downloadText(`${kind}-${from}_to_${to}.csv`, csv);
    await logReportExport({ reportType: kind, format: "csv", rowCount: rows.length });
    setMsg(`Exported ${kind} CSV`);
  }

  if (!canAccess) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No access to reports</div>;
  }

  const tabs: Array<{ id: ReportTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "sales", label: "Sales" },
    { id: "profit", label: "Profit" },
    { id: "gst", label: "GST" },
    { id: "expenses", label: "Expenses" },
    { id: "inventory", label: "Inventory" },
    { id: "purchases", label: "Purchases" },
    { id: "suppliers", label: "Suppliers" },
    { id: "staff", label: "Staff" },
    { id: "wastage", label: "Wastage" }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Business intelligence</div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Reports & analytics</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/forecast" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            AI Forecast
          </Link>
          <Link to="/suppliers" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Suppliers
          </Link>
          <Link to="/expenses" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Expenses
          </Link>
          <button
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
            onClick={async () => {
              await cacheReportSnapshot({
                reportType: tab,
                filters: { from, to, category, supplier },
                summary: { sales: salesR.total, expenses: expR.total, profit: profit.net }
              });
              setMsg("Snapshot cached");
            }}
          >
            Cache snapshot
          </button>
        </div>
      </div>

      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          From
          <input type="date" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          To
          <input type="date" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Category
          <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All</option>
            {expR.byCategory.map((c) => (
              <option key={c.category} value={c.category}>
                {c.category}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-slate-600">
          Supplier
          <select className="rounded-xl border border-slate-200 px-3 py-2 text-sm" value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="all">All</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <div className="ml-auto flex items-end gap-2">
          <input className="rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Schedule title" value={presetName} onChange={(e) => setPresetName(e.target.value)} />
          <button
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold"
            onClick={async () => {
              await saveScheduledReport({
                title: presetName || `${tab} report`,
                reportType: tab,
                cadence: "monthly",
                filters: { from, to, category, supplier }
              });
              setMsg("Scheduled report saved");
            }}
          >
            Schedule
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 text-sm">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-lg px-3 py-1.5 ${tab === t.id ? "bg-slate-900 text-white" : "text-slate-600"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {(tab === "overview" || tab === "sales" || tab === "profit") && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Sales" value={inr(salesR.total)} />
          <Kpi label="Expenses (paid)" value={inr(expR.paid)} />
          <Kpi label="Net profit" value={inr(profit.net)} />
          <Kpi label="Margin" value={`${profit.margin.toFixed(1)}%`} />
        </div>
      )}

      {tab === "overview" || tab === "sales" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Daily sales">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={salesR.daily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => inr(num(v))} />
                <Line type="monotone" dataKey="value" stroke="#06b6d4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Expense mix">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieCats} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                  {pieCats.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => inr(num(v))} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      ) : null}

      {tab === "profit" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Gross profit" value={inr(profit.gross)} />
          <Kpi label="COGS / purchases paid" value={inr(profit.cogs)} />
          <Kpi label="Food cost %" value={`${profit.foodCostPct.toFixed(1)}%`} />
          <Kpi label="Net profit" value={inr(profit.net)} />
        </div>
      ) : null}

      {tab === "gst" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Taxable" value={inr(expR.gst.taxable)} />
            <Kpi label="CGST" value={inr(expR.gst.cgst)} />
            <Kpi label="SGST" value={inr(expR.gst.sgst)} />
            <Kpi label="IGST" value={inr(expR.gst.igst)} />
            <Kpi label="Purchase GST" value={inr(purR.gst)} />
          </div>
          <ExportBar
            onCsv={() =>
              exportCsv("gst", ["Taxable", "CGST", "SGST", "IGST", "PurchaseGST"], [[expR.gst.taxable, expR.gst.cgst, expR.gst.sgst, expR.gst.igst, purR.gst]])
            }
            onPrint={() =>
              printReport(
                "GST Report",
                `<table><tr><th>Taxable</th><td>${inr(expR.gst.taxable)}</td></tr><tr><th>CGST</th><td>${inr(expR.gst.cgst)}</td></tr><tr><th>SGST</th><td>${inr(expR.gst.sgst)}</td></tr><tr><th>IGST</th><td>${inr(expR.gst.igst)}</td></tr></table>`
              )
            }
            canExport={canExport}
          />
        </div>
      ) : null}

      {tab === "expenses" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Total" value={inr(expR.total)} />
            <Kpi label="Paid" value={inr(expR.paid)} />
            <Kpi label="Unpaid" value={inr(expR.unpaid)} />
          </div>
          <ChartCard title="Category spend">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={expR.byCategory.slice(0, 12)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => inr(num(v))} />
                <Bar dataKey="total" fill="#0f172a" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ExportBar
            onCsv={() => exportCsv("expenses-by-category", ["Category", "Total"], expR.byCategory.map((c) => [c.category, c.total]))}
            onPrint={() =>
              printReport(
                "Expense Report",
                `<table><thead><tr><th>Category</th><th>Total</th></tr></thead><tbody>${expR.byCategory
                  .map((c) => `<tr><td>${c.category}</td><td>${inr(c.total)}</td></tr>`)
                  .join("")}</tbody></table>`
              )
            }
            canExport={canExport}
          />
        </div>
      ) : null}

      {tab === "inventory" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Kpi label="SKUs" value={invR.skus} />
            <Kpi label="Stock value" value={inr(invR.value)} />
            <Kpi label="Low stock" value={invR.low} />
            <Kpi label="Out of stock" value={invR.out} />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-bold">Low stock items</div>
            {invR.lowItems.map((i) => (
              <div key={i.id} className="flex justify-between border-t border-slate-100 py-2 text-sm">
                <span>{i.item}</span>
                <span className="font-semibold text-amber-700">
                  {availableSafe(i)} {i.unit}
                </span>
              </div>
            ))}
            {!invR.lowItems.length ? <div className="py-6 text-center text-sm text-slate-500">No low stock.</div> : null}
          </div>
        </div>
      ) : null}

      {tab === "purchases" || tab === "suppliers" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Purchase total" value={inr(purR.total)} />
            <Kpi label="Unpaid purchases" value={inr(purR.unpaid)} />
            <Kpi label="Supplier AP" value={inr(ledger.reduce((s, r) => s + r.outstanding, 0))} />
          </div>
          <ChartCard title="Purchases by supplier">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={purR.bySupplier.slice(0, 10)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="supplier" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => inr(num(v))} />
                <Bar dataKey="value" fill="#06b6d4" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-sm font-bold">Credit / overdue alerts</div>
            {supA.creditAlerts.concat(supA.overdue).slice(0, 12).map((r) => (
              <div key={r.supplierId + r.name} className="flex justify-between border-t border-slate-100 py-2 text-sm">
                <span className="font-semibold">{r.name}</span>
                <span>
                  due {inr(r.outstanding)}
                  {r.overdue > 0 ? ` · overdue ${inr(r.overdue)}` : ""}
                </span>
              </div>
            ))}
          </div>
          <ExportBar
            onCsv={() =>
              exportCsv(
                "supplier-ledger",
                ["Supplier", "Purchases", "Payments", "Outstanding", "Overdue"],
                ledger.map((r) => [r.name, r.purchases, r.payments, r.outstanding, r.overdue])
              )
            }
            onPrint={() =>
              printReport(
                "Supplier Report",
                `<table><thead><tr><th>Supplier</th><th>Outstanding</th></tr></thead><tbody>${ledger
                  .map((r) => `<tr><td>${r.name}</td><td>${inr(r.outstanding)}</td></tr>`)
                  .join("")}</tbody></table>`
              )
            }
            canExport={canExport}
          />
        </div>
      ) : null}

      {tab === "staff" ? (
        <div className="space-y-3">
          {canSalary ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Kpi label="Salary total" value={inr(salR.total)} />
              <Kpi label="Paid" value={inr(salR.paid)} />
              <Kpi label="Unpaid" value={inr(salR.unpaid)} />
            </div>
          ) : (
            <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Salary figures hidden for your role.</div>
          )}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Present eq</th>
                  <th className="px-3 py-2">Absent</th>
                  <th className="px-3 py-2">Late</th>
                </tr>
              </thead>
              <tbody>
                {staffR.map((r) => (
                  <tr key={r.name} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">{r.name}</td>
                    <td className="px-3 py-2">{r.presentEq}</td>
                    <td className="px-3 py-2">{r.absent}</td>
                    <td className="px-3 py-2">{r.late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "wastage" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Kpi label="Wastage events" value={wasteR.count} />
            <Kpi label="Cost impact" value={inr(wasteR.cost)} />
          </div>
          <ChartCard title="Wastage by reason">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={wasteR.byReason}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="reason" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => inr(num(v))} />
                <Bar dataKey="value" fill="#ef4444" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      ) : null}

      {(tab === "overview" || tab === "sales") && (
        <ExportBar
          onCsv={() => exportCsv("sales-daily", ["Date", "Sales"], salesR.daily.map((d) => [d.date, d.value]))}
          onPrint={() =>
            printReport(
              "Sales Report",
              `<p>Total ${inr(salesR.total)} · Cash ${inr(salesR.cash)} · Online ${inr(salesR.online)}</p>`
            )
          }
          canExport={canExport}
        />
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-bold">{title}</div>
      {children}
    </div>
  );
}

function ExportBar({ onCsv, onPrint, canExport }: { onCsv: () => void; onPrint: () => void; canExport: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button disabled={!canExport} onClick={onCsv} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40">
        Export CSV / Excel
      </button>
      <button disabled={!canExport} onClick={onPrint} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40">
        Print / PDF
      </button>
    </div>
  );
}

function availableSafe(i: InventoryItemDoc) {
  const q = num((i as any).qty);
  const reserved = num((i as any).reservedQty);
  return Math.max(0, q - reserved);
}
