const { useEffect, useMemo, useRef, useState } = React;
const {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell
} = Recharts;

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function formatINR(value) {
  const n = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
  } catch {
    return `₹${Math.round(n).toLocaleString("en-IN")}`;
  }
}

function formatCompactNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  try {
    return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  } catch {
    return String(Math.round(n));
  }
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysUntil(dateISO) {
  const t0 = startOfToday().getTime();
  const d = new Date(`${dateISO}T00:00:00`).getTime();
  const diff = (d - t0) / (24 * 60 * 60 * 1000);
  return Math.round(diff);
}

function useCountUp(target, { durationMs = 900, decimals = 0 } = {}) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const to = Number(target || 0);
    const from = 0;
    const start = performance.now();

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (now) => {
      const t = clamp((now - start) / durationMs, 0, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = from + (to - from) * eased;
      setValue(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  const rounded = decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value);
  return rounded;
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="seg" role="tablist" aria-label="Date range filter">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`segBtn ${value === opt.value ? "segBtnActive" : ""}`}
          onClick={() => onChange(opt.value)}
          role="tab"
          aria-selected={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Trend({ deltaPct }) {
  const up = deltaPct >= 0;
  const color = up ? "var(--green)" : "var(--red)";
  const arrow = up ? "↑" : "↓";
  const abs = Math.abs(deltaPct);
  return (
    <div className="trend" style={{ color }}>
      <span className="trendArrow" aria-hidden="true">{arrow}</span>
      <span className="trendText">{abs.toFixed(1)}%</span>
    </div>
  );
}

function KPICard({ icon, title, value, format = "inr", deltaPct, hint, tone = "neutral" }) {
  const animated = useCountUp(value, { durationMs: 950 });

  const displayValue =
    format === "inr" ? formatINR(animated) : format === "count" ? formatCompactNumber(animated) : String(animated);

  const accent =
    tone === "income" ? "rgba(34,197,94,.14)" :
    tone === "expense" ? "rgba(239,68,68,.14)" :
    tone === "pending" ? "rgba(245,158,11,.14)" :
    tone === "online" ? "rgba(59,130,246,.14)" :
    "rgba(15,23,42,.06)";

  return (
    <div className="card cardHover kpi">
      <div className="kpiTop">
        <div className="kpiIcon" style={{ background: accent }} aria-hidden="true">{icon}</div>
        <Trend deltaPct={deltaPct} />
      </div>
      <div className="kpiTitle">{title}</div>
      <div className="kpiValue">{displayValue}</div>
      <div className="kpiHint">{hint}</div>
    </div>
  );
}

function CardHeader({ title, subtitle, right }) {
  return (
    <div className="cardHeader">
      <div>
        <div className="cardTitle">{title}</div>
        {subtitle ? <div className="cardSub">{subtitle}</div> : null}
      </div>
      {right ? <div className="cardRight">{right}</div> : null}
    </div>
  );
}

function SalesOverview({ data }) {
  return (
    <div className="card panel">
      <CardHeader
        title="Sales Overview"
        subtitle="Cash vs Online — daily"
      />
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap={18}>
            <CartesianGrid stroke="rgba(15,23,42,.08)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "rgba(15,23,42,.55)", fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "rgba(15,23,42,.55)", fontSize: 12 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip
              cursor={{ fill: "rgba(15,23,42,.04)" }}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,.10)",
                boxShadow: "0 18px 40px rgba(15,23,42,.12)"
              }}
              formatter={(v) => formatINR(v)}
              labelFormatter={(l) => `Date: ${l}`}
            />
            <Bar dataKey="cash" name="Cash" fill="var(--green)" radius={[10, 10, 10, 10]} animationDuration={800} />
            <Bar dataKey="online" name="Online" fill="var(--blue)" radius={[10, 10, 10, 10]} animationDuration={950} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="legendMini">
        <span className="dot" style={{ background: "var(--green)" }} /> Cash
        <span className="dot" style={{ background: "var(--blue)", marginLeft: 14 }} /> Online
      </div>
    </div>
  );
}

function ExpenseBreakdown({ data }) {
  const colors = {
    Staff: "rgba(59,130,246,.95)",
    Suppliers: "rgba(34,197,94,.95)",
    Rent: "rgba(245,158,11,.95)",
    Others: "rgba(148,163,184,.95)"
  };

  return (
    <div className="card panel">
      <CardHeader title="Expense Breakdown" subtitle="Staff / Suppliers / Rent / Others" />
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={92}
              paddingAngle={4}
              animationDuration={900}
            >
              {data.map((x) => (
                <Cell key={x.name} fill={colors[x.name] || "rgba(15,23,42,.22)"} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,.10)",
                boxShadow: "0 18px 40px rgba(15,23,42,.12)"
              }}
              formatter={(v) => formatINR(v)}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="pieMeta">
        {data.map((x) => (
          <div key={x.name} className="pieRow">
            <div className="pieLeft">
              <span className="dot" style={{ background: colors[x.name] || "rgba(15,23,42,.22)" }} />
              <span className="pieName">{x.name}</span>
            </div>
            <div className="pieValue">{formatINR(x.value)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RecentActivity({ items }) {
  return (
    <div className="card panel">
      <CardHeader title="Recent Activity" subtitle="Last 5 updates" />
      <div className="list">
        {items.map((it) => {
          const amountColor = it.kind === "expense" ? "var(--red)" : "var(--green)";
          const pillBg =
            it.kind === "expense" ? "rgba(239,68,68,.12)" :
            it.kind === "payment" ? "rgba(245,158,11,.12)" :
            "rgba(34,197,94,.12)";
          const pillColor =
            it.kind === "expense" ? "var(--red)" :
            it.kind === "payment" ? "var(--yellow)" :
            "var(--green)";

          return (
            <div key={it.id} className="listRow">
              <div className="listMain">
                <div className="listTitle">{it.title}</div>
                <div className="listSub">{it.sub}</div>
              </div>
              <div className="listRight">
                <div className="pill" style={{ background: pillBg, color: pillColor }}>{it.badge}</div>
                <div className="amt" style={{ color: amountColor }}>{it.amount}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UpcomingPayments({ items }) {
  return (
    <div className="card panel">
      <CardHeader title="Upcoming Payments" subtitle="Don’t miss your dues" right={<span className="bell pulse" aria-label="Reminders">🔔</span>} />
      <div className="list">
        {items.map((it) => {
          const due = daysUntil(it.dueDate);
          const urgent = due <= 1;
          const dueColor = urgent ? "var(--red)" : "var(--yellow)";
          const dueText =
            due < 0 ? `Overdue by ${Math.abs(due)} day${Math.abs(due) === 1 ? "" : "s"}` :
            due === 0 ? "Due today" :
            due === 1 ? "Due tomorrow" :
            `Due in ${due} days`;

          return (
            <div key={it.id} className={`payRow ${urgent ? "payUrgent" : ""}`}>
              <div className="payMain">
                <div className="payTitle">{it.title}</div>
                <div className="paySub" style={{ color: dueColor }}>{dueText}</div>
              </div>
              <div className="payAmt">{it.amount}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Dashboard() {
  const [range, setRange] = useState("today");

  const heroSubtitle = "Here’s your restaurant performance today";
  const nowLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  }, []);

  const salesData = useMemo(() => {
    const base = startOfToday();
    const days = range === "month" ? 14 : range === "week" ? 7 : 7;
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      const cash = 9000 + (Math.sin(i * 0.7) + 1.2) * 6200 + (i % 3) * 900;
      const online = 6500 + (Math.cos(i * 0.6) + 1.1) * 5200 + (i % 2) * 1100;
      result.push({ date: label, cash: Math.round(cash), online: Math.round(online) });
    }
    return result;
  }, [range]);

  const expenseData = useMemo(() => ([
    { name: "Staff", value: 38000 },
    { name: "Suppliers", value: 52000 },
    { name: "Rent", value: 20000 },
    { name: "Others", value: 12000 }
  ]), []);

  const recent = useMemo(() => ([
    { id: "a1", kind: "sale", title: "Sales added", sub: "Lunch shift • Cash + Online", badge: "Income", amount: `+${formatINR(18950)}` },
    { id: "a2", kind: "expense", title: "Expense recorded", sub: "Suppliers • Veg purchase", badge: "Expense", amount: `-${formatINR(5400)}` },
    { id: "a3", kind: "payment", title: "Payment scheduled", sub: "Rent reminder set", badge: "Pending", amount: formatINR(20000) },
    { id: "a4", kind: "sale", title: "Sales added", sub: "Dinner shift • Online spike", badge: "Income", amount: `+${formatINR(24620)}` },
    { id: "a5", kind: "expense", title: "Expense recorded", sub: "Staff • Advances", badge: "Expense", amount: `-${formatINR(3000)}` }
  ]), []);

  const upcoming = useMemo(() => {
    const today = startOfToday();
    const iso = (d) => d.toISOString().slice(0, 10);
    const d1 = new Date(today); d1.setDate(d1.getDate() + 1);
    const d3 = new Date(today); d3.setDate(d3.getDate() + 3);
    return [
      { id: "p1", title: "Rent", amount: formatINR(20000), dueDate: iso(d3) },
      { id: "p2", title: "Milk Supplier", amount: formatINR(5000), dueDate: iso(d1) },
      { id: "p3", title: "Salaries", amount: formatINR(38000), dueDate: iso(d3) }
    ];
  }, []);

  const kpis = useMemo(() => {
    const totalRevenue = salesData.reduce((s, x) => s + x.cash + x.online, 0);
    const totalSales = 128; // UI-only placeholder
    const cashBalance = 62896;
    const bankBalance = 34120;
    const totalBalance = cashBalance + bankBalance;
    const unpaidBills = 12450;
    const netProfit = totalRevenue - expenseData.reduce((s, x) => s + x.value, 0);
    return { cashBalance, bankBalance, totalBalance, totalRevenue, totalSales, unpaidBills, netProfit };
  }, [salesData, expenseData]);

  return (
    <div className="wrap">
      <div className="inner fadeSlideIn">
        <header className="hero">
          <div className="heroLeft">
            <div className="heroTitle">Welcome back, Mihir <span className="wave" aria-hidden="true">👋</span></div>
            <div className="heroSub">{heroSubtitle}</div>
          </div>
          <div className="heroRight">
            <div className="dateBlock">
              <div className="dateSmall">{nowLabel}</div>
              <Segmented
                value={range}
                onChange={setRange}
                options={[
                  { value: "today", label: "Today" },
                  { value: "week", label: "Week" },
                  { value: "month", label: "Month" }
                ]}
              />
            </div>
            <div className="profile" aria-label="Profile">
              <div className="avatar" aria-hidden="true">M</div>
            </div>
          </div>
        </header>

        <section className="kpiGrid" aria-label="Key metrics">
          {/* Row 1 */}
          <div className="kpiSpan4">
            <KPICard icon="💰" title="Cash Balance" value={kpis.cashBalance} deltaPct={+3.2} hint="Available cash today" tone="income" />
          </div>
          <div className="kpiSpan4">
            <KPICard icon="🏦" title="Bank Balance" value={kpis.bankBalance} deltaPct={-1.4} hint="Online collections" tone="online" />
          </div>
          <div className="kpiSpan4">
            <KPICard icon="🧾" title="Total Balance" value={kpis.totalBalance} deltaPct={+1.1} hint="Cash + bank combined" />
          </div>

          {/* Row 2 */}
          <div className="kpiSpan3">
            <KPICard icon="📈" title="Total Revenue" value={kpis.totalRevenue} deltaPct={+6.7} hint="All sales (selected range)" tone="income" />
          </div>
          <div className="kpiSpan3">
            <KPICard icon="🛒" title="Total Sales" value={kpis.totalSales} format="count" deltaPct={+2.3} hint="Number of transactions" />
          </div>
          <div className="kpiSpan3">
            <KPICard icon="⚠️" title="Unpaid Bills" value={kpis.unpaidBills} deltaPct={-0.8} hint="Pending supplier dues" tone="pending" />
          </div>
          <div className="kpiSpan3">
            <KPICard icon="💵" title="Net Profit" value={kpis.netProfit} deltaPct={kpis.netProfit >= 0 ? +4.9 : -4.9} hint="Revenue minus expenses" tone={kpis.netProfit >= 0 ? "income" : "expense"} />
          </div>
        </section>

        <section className="mainGrid" aria-label="Dashboard content">
          <div className="leftCol">
            <SalesOverview data={salesData} />
            <RecentActivity items={recent} />
          </div>
          <div className="rightCol">
            <ExpenseBreakdown data={expenseData} />
            <UpcomingPayments items={upcoming} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Styles() {
  return (
    <style>{`
      .wrap{max-width:1200px;margin:0 auto;padding:28px 18px 60px}
      .inner{display:flex;flex-direction:column;gap:18px}

      .hero{
        width:100%;
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:16px;
        padding:18px 18px 6px;
      }
      .heroTitle{font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-.02em}
      .heroSub{margin-top:6px;color:var(--muted);font-size:14px}
      .wave{display:inline-block;transform-origin:70% 70%;animation:wave .9s ease 1}
      @keyframes wave{
        0%{transform:rotate(0)}
        20%{transform:rotate(12deg)}
        40%{transform:rotate(-6deg)}
        60%{transform:rotate(10deg)}
        80%{transform:rotate(-4deg)}
        100%{transform:rotate(0)}
      }

      .heroRight{display:flex;align-items:center;gap:12px}
      .dateBlock{display:flex;flex-direction:column;align-items:flex-end;gap:8px}
      .dateSmall{color:var(--muted);font-size:12px}

      .profile{display:flex;align-items:center;justify-content:center}
      .avatar{
        width:40px;height:40px;border-radius:999px;
        display:flex;align-items:center;justify-content:center;
        border:1px solid rgba(15,23,42,.10);
        background:linear-gradient(180deg,#fff,rgba(15,23,42,.02));
        box-shadow:0 10px 30px rgba(15,23,42,.10);
        font-weight:800;
      }

      .seg{
        display:flex;
        gap:6px;
        padding:6px;
        border-radius:999px;
        background:rgba(15,23,42,.05);
        border:1px solid rgba(15,23,42,.06);
      }
      .segBtn{
        appearance:none;
        border:0;
        background:transparent;
        color:rgba(15,23,42,.65);
        font-weight:700;
        font-size:12px;
        padding:8px 12px;
        border-radius:999px;
        cursor:pointer;
        transition: background .16s ease, color .16s ease, transform .16s ease;
      }
      .segBtn:hover{background:rgba(255,255,255,.7);transform:translateY(-1px)}
      .segBtnActive{
        background:#fff;
        color:rgba(15,23,42,.90);
        box-shadow:0 10px 26px rgba(15,23,42,.10);
      }

      .kpiGrid{
        display:grid;
        grid-template-columns:repeat(12,minmax(0,1fr));
        gap:14px;
      }
      .kpiSpan4{grid-column:span 4}
      .kpiSpan3{grid-column:span 3}

      .kpi{padding:14px 14px 12px}
      .kpiTop{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
      .kpiIcon{
        width:38px;height:38px;border-radius:12px;
        display:flex;align-items:center;justify-content:center;
        font-size:18px;
        border:1px solid rgba(15,23,42,.06);
      }
      .kpiTitle{font-size:13px;color:rgba(15,23,42,.65);font-weight:700}
      .kpiValue{margin-top:6px;font-size:24px;font-weight:900;letter-spacing:-.02em}
      .kpiHint{margin-top:4px;font-size:12px;color:var(--muted)}

      .trend{display:flex;align-items:center;gap:6px;font-weight:900}
      .trendArrow{font-size:14px}
      .trendText{font-size:12px}

      .mainGrid{
        display:grid;
        grid-template-columns:minmax(0,7fr) minmax(0,3fr);
        gap:14px;
        align-items:start;
      }
      .leftCol,.rightCol{display:flex;flex-direction:column;gap:14px}

      .panel{padding:16px}
      .cardHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px}
      .cardTitle{font-size:16px;font-weight:900;letter-spacing:-.01em}
      .cardSub{margin-top:3px;font-size:12px;color:var(--muted)}
      .cardRight{display:flex;align-items:center;gap:10px}

      .chart{height:270px;border-radius:14px;background:linear-gradient(180deg,rgba(15,23,42,.02),rgba(15,23,42,.00));border:1px solid rgba(15,23,42,.06);padding:10px}
      .legendMini{display:flex;align-items:center;color:rgba(15,23,42,.70);font-size:12px;font-weight:700;margin-top:10px}
      .dot{display:inline-block;width:10px;height:10px;border-radius:999px;margin-right:8px}

      .list{display:flex;flex-direction:column;gap:10px}
      .listRow{
        display:flex;align-items:center;justify-content:space-between;gap:12px;
        padding:12px;
        border-radius:14px;
        background:rgba(15,23,42,.02);
        border:1px solid rgba(15,23,42,.06);
      }
      .listTitle{font-weight:900}
      .listSub{margin-top:2px;color:var(--muted);font-size:12px}
      .listRight{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
      .pill{
        display:inline-flex;align-items:center;justify-content:center;
        padding:6px 10px;border-radius:999px;font-size:12px;font-weight:900;
      }
      .amt{font-weight:900}

      .pieMeta{margin-top:10px;display:flex;flex-direction:column;gap:8px}
      .pieRow{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .pieLeft{display:flex;align-items:center;gap:8px}
      .pieName{font-weight:800;color:rgba(15,23,42,.78);font-size:12px}
      .pieValue{font-weight:900;font-size:12px;color:rgba(15,23,42,.82)}

      .bell{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:999px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.22)}

      .payRow{
        display:flex;align-items:center;justify-content:space-between;gap:12px;
        padding:12px;
        border-radius:14px;
        background:rgba(245,158,11,.08);
        border:1px solid rgba(245,158,11,.18);
        transition: transform .16s ease, box-shadow .16s ease;
      }
      .payRow:hover{transform:translateY(-2px);box-shadow:0 16px 34px rgba(15,23,42,.10)}
      .payUrgent{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.18)}
      .payTitle{font-weight:900}
      .paySub{margin-top:2px;font-size:12px;font-weight:800}
      .payAmt{font-weight:900}

      @media (max-width: 980px){
        .mainGrid{grid-template-columns:1fr}
        .dateBlock{align-items:flex-start}
        .hero{padding:18px 4px 6px;flex-direction:column;align-items:flex-start}
        .heroRight{width:100%;justify-content:space-between}
      }
      @media (max-width: 900px){
        .kpiSpan4,.kpiSpan3{grid-column:span 6}
      }
      @media (max-width: 560px){
        .kpiSpan4,.kpiSpan3{grid-column:span 12}
        .wrap{padding:22px 14px 48px}
        .heroTitle{font-size:24px}
        .kpiValue{font-size:22px}
      }
    `}</style>
  );
}

function App() {
  return (
    <>
      <Styles />
      <Dashboard />
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(React.createElement(App));

