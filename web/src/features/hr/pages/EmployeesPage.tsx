import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { inr, isoDate, num } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { EmployeeDoc, SalaryType } from "../types";
import { upsertEmployee, softDeleteEmployee } from "../services/employeeService";
import { canEditEmployees } from "../utils/permissions";

const emptyForm = {
  id: "",
  name: "",
  employeeCode: "",
  department: "Kitchen",
  designation: "",
  role: "employee",
  phone: "",
  email: "",
  whatsapp: "",
  joiningDate: isoDate(),
  salaryType: "monthly" as SalaryType,
  monthlySalary: "",
  dailyWage: "",
  hourlyRate: "",
  branch: "Main",
  notes: "",
  active: true
};

export function EmployeesPage() {
  const { role } = usePosAuth();
  const canEdit = canEditEmployees(role);
  const { data, loading, error } = useRestaurantCollection<EmployeeDoc>({ path: "staff" });
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("all");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return data.filter((s) => {
      if (dept !== "all" && (s.department || "") !== dept) return false;
      if (!query) return true;
      return `${s.name} ${s.employeeCode || ""} ${s.phone || ""} ${s.email || ""} ${s.designation || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [data, q, dept]);

  const departments = useMemo(() => {
    const set = new Set(data.map((s) => s.department || "General").filter(Boolean));
    return ["all", ...Array.from(set).sort()];
  }, [data]);

  async function save() {
    if (!canEdit) return;
    try {
      setBusy(true);
      await upsertEmployee({
        id: form.id || undefined,
        name: form.name,
        employeeCode: form.employeeCode || undefined,
        department: form.department,
        designation: form.designation,
        role: form.role,
        phone: form.phone,
        email: form.email,
        whatsapp: form.whatsapp,
        joiningDate: form.joiningDate,
        salaryType: form.salaryType,
        monthlySalary: num(form.monthlySalary),
        dailyWage: num(form.dailyWage),
        hourlyRate: num(form.hourlyRate),
        branch: form.branch,
        notes: form.notes,
        active: form.active
      });
      setMsg("Employee saved");
      setForm({ ...emptyForm, joiningDate: isoDate() });
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function edit(s: EmployeeDoc & { id: string }) {
    setForm({
      id: s.id,
      name: s.name || "",
      employeeCode: s.employeeCode || "",
      department: s.department || "Kitchen",
      designation: s.designation || "",
      role: s.role || "employee",
      phone: s.phone || "",
      email: s.email || "",
      whatsapp: s.whatsapp || "",
      joiningDate: s.joiningDate || isoDate(),
      salaryType: s.salaryType || "monthly",
      monthlySalary: String(s.monthlySalary ?? ""),
      dailyWage: String(s.dailyWage ?? ""),
      hourlyRate: String(s.hourlyRate ?? ""),
      branch: s.branch || "Main",
      notes: s.notes || "",
      active: s.active !== false
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/hr" className="text-xs font-semibold text-cyan-700">
            ← HR
          </Link>
          <h1 className="text-2xl font-black text-slate-900">Employee master</h1>
        </div>
      </div>

      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}
      {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold">{form.id ? "Edit employee" : "Add employee"}</div>
          <div className="grid gap-2">
            {(
              [
                ["name", "Full name"],
                ["employeeCode", "Employee code"],
                ["department", "Department"],
                ["designation", "Designation"],
                ["role", "Role"],
                ["phone", "Phone"],
                ["email", "Email"],
                ["whatsapp", "WhatsApp"],
                ["joiningDate", "Joining date"],
                ["branch", "Branch"],
                ["monthlySalary", "Monthly salary"],
                ["dailyWage", "Daily wage"],
                ["hourlyRate", "Hourly rate"],
                ["notes", "Notes"]
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="grid gap-1 text-xs font-semibold text-slate-600">
                {label}
                <input
                  disabled={!canEdit}
                  type={key.includes("Date") ? "date" : key.includes("Salary") || key.includes("Wage") || key.includes("Rate") ? "number" : "text"}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            ))}
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Salary type
              <select
                disabled={!canEdit}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                value={form.salaryType}
                onChange={(e) => setForm((f) => ({ ...f, salaryType: e.target.value as SalaryType }))}
              >
                <option value="monthly">Monthly</option>
                <option value="daily">Daily</option>
                <option value="hourly">Hourly</option>
              </select>
            </label>
            <button
              disabled={!canEdit || busy || !form.name.trim()}
              onClick={save}
              className="mt-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save employee"}
            </button>
            {form.id ? (
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                onClick={() => setForm({ ...emptyForm, joiningDate: isoDate() })}
              >
                Clear form
              </button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"
                placeholder="Search name, code, phone…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={dept} onChange={(e) => setDept(e.target.value)}>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d === "all" ? "All departments" : d}
                </option>
              ))}
            </select>
          </div>

          {loading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70" /> : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-3 py-2">Dept</th>
                  <th className="px-3 py-2">Salary</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{s.name}</div>
                      <div className="text-xs text-slate-500">
                        {s.employeeCode || "—"} · {s.phone || "no phone"}
                      </div>
                    </td>
                    <td className="px-3 py-2">{s.department || "—"}</td>
                    <td className="px-3 py-2">
                      {s.salaryType === "daily"
                        ? `${inr(s.dailyWage)}/day`
                        : s.salaryType === "hourly"
                          ? `${inr(s.hourlyRate)}/hr`
                          : inr(s.monthlySalary)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase">
                        {s.active === false ? "inactive" : "active"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canEdit ? (
                        <div className="flex justify-end gap-2">
                          <button className="text-xs font-semibold text-cyan-700" onClick={() => edit(s)}>
                            Edit
                          </button>
                          <button
                            className="text-xs font-semibold text-rose-600"
                            onClick={async () => {
                              await softDeleteEmployee(s.id);
                              setMsg("Employee deactivated");
                            }}
                          >
                            Deactivate
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length && !loading ? <div className="py-10 text-center text-sm text-slate-500">No employees found.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
