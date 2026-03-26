import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { SalesPage } from "@/pages/SalesPage";
import { StaffPage } from "@/pages/StaffPage";
import { SuppliersPage } from "@/pages/SuppliersPage";
import { ExpensesPage } from "@/pages/ExpensesPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { RemindersPage } from "@/pages/RemindersPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="/sales" element={<SalesPage />} />
        <Route path="/staff" element={<StaffPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/reminders" element={<RemindersPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

