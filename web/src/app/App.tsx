import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { SalesPage } from "@/pages/SalesPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { PosPage } from "@/features/pos/pages/PosPage";
import { PosAuthProvider } from "@/features/pos/auth/PosAuthProvider";
import { OrdersDashboardPage } from "@/features/orders/pages/OrdersDashboardPage";
import { OrderBoardPage } from "@/features/orders/pages/OrderBoardPage";
import { OrderDetailPage } from "@/features/orders/pages/OrderDetailPage";
import { KdsPage } from "@/features/orders/pages/KdsPage";
import { InventoryDashboardPage } from "@/features/inventory/pages/InventoryDashboardPage";
import { InventoryItemsPage } from "@/features/inventory/pages/InventoryItemsPage";
import { InventoryPurchasesPage } from "@/features/inventory/pages/InventoryPurchasesPage";
import { InventoryOpsPage } from "@/features/inventory/pages/InventoryOpsPage";
import { RecipesListPage, RecipeBuilderPage } from "@/features/inventory/pages/RecipePages";
import { ProductionPage } from "@/features/inventory/pages/ProductionPage";
import { HrDashboardPage } from "@/features/hr/pages/HrDashboardPage";
import { EmployeesPage } from "@/features/hr/pages/EmployeesPage";
import { AttendancePage } from "@/features/hr/pages/AttendancePage";
import { LeavePage } from "@/features/hr/pages/LeavePage";
import { PayrollPage } from "@/features/hr/pages/PayrollPage";
import { ShiftsPage } from "@/features/hr/pages/ShiftsPage";
import { TasksBoardPage } from "@/features/tasks/pages/TasksBoardPage";
import { RemindersHubPage } from "@/features/tasks/pages/RemindersHubPage";
import { ExpensesDashboardPage } from "@/features/expenses/pages/ExpensesDashboardPage";
import { ExpensesListPage } from "@/features/expenses/pages/ExpensesListPage";
import { RecurringExpensesPage } from "@/features/expenses/pages/RecurringExpensesPage";
import { ExpenseApprovalsPage } from "@/features/expenses/pages/ExpenseApprovalsPage";
import { SuppliersDashboardPage } from "@/features/suppliers/pages/SuppliersDashboardPage";
import { SuppliersListPage } from "@/features/suppliers/pages/SuppliersListPage";
import { SupplierPaymentsPage } from "@/features/suppliers/pages/SupplierPaymentsPage";
import { ReportsHubPage } from "@/features/reports/pages/ReportsHubPage";
import { AnalyticsDashboardPage } from "@/features/analytics/pages/AnalyticsDashboardPage";
import { CalendarPage } from "@/features/calendar/pages/CalendarPage";
import { DocumentsPage } from "@/features/documents/pages/DocumentsPage";
import { NotificationCenterPage } from "@/features/notifications/pages/NotificationCenterPage";

const ForecastDashboardPage = lazy(() =>
  import("@/features/forecast/pages/ForecastDashboardPage").then((m) => ({ default: m.ForecastDashboardPage }))
);

function ForecastFallback() {
  return (
    <div className="space-y-4">
      <div className="h-28 animate-pulse rounded-3xl bg-gradient-to-r from-indigo-200 via-violet-200 to-fuchsia-200" />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded-2xl bg-indigo-100" />
        <div className="h-24 animate-pulse rounded-2xl bg-violet-100" />
        <div className="h-24 animate-pulse rounded-2xl bg-fuchsia-100" />
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
    </div>
  );
}

export default function App() {
  return (
    <PosAuthProvider>
      <Routes>
        <Route path="/pos" element={<PosPage />} />
        <Route path="/kds" element={<KdsPage />} />
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="/orders" element={<OrdersDashboardPage />} />
          <Route path="/orders/board" element={<OrderBoardPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/inventory" element={<InventoryDashboardPage />} />
          <Route path="/inventory/items" element={<InventoryItemsPage />} />
          <Route path="/inventory/purchases" element={<InventoryPurchasesPage />} />
          <Route path="/inventory/ops" element={<InventoryOpsPage />} />
          <Route path="/inventory/recipes" element={<RecipesListPage />} />
          <Route path="/inventory/recipes/:recipeId" element={<RecipeBuilderPage />} />
          <Route path="/inventory/production" element={<ProductionPage />} />
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/hr" element={<HrDashboardPage />} />
          <Route path="/hr/employees" element={<EmployeesPage />} />
          <Route path="/hr/attendance" element={<AttendancePage />} />
          <Route path="/hr/leave" element={<LeavePage />} />
          <Route path="/hr/payroll" element={<PayrollPage />} />
          <Route path="/hr/shifts" element={<ShiftsPage />} />
          <Route path="/staff" element={<Navigate to="/hr" replace />} />
          <Route path="/tasks" element={<TasksBoardPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/suppliers" element={<SuppliersDashboardPage />} />
          <Route path="/suppliers/list" element={<SuppliersListPage />} />
          <Route path="/suppliers/payments" element={<SupplierPaymentsPage />} />
          <Route path="/expenses" element={<ExpensesDashboardPage />} />
          <Route path="/expenses/list" element={<ExpensesListPage />} />
          <Route path="/expenses/recurring" element={<RecurringExpensesPage />} />
          <Route path="/expenses/approvals" element={<ExpenseApprovalsPage />} />
          <Route path="/analytics" element={<AnalyticsDashboardPage />} />
          <Route
            path="/forecast"
            element={
              <Suspense fallback={<ForecastFallback />}>
                <ForecastDashboardPage />
              </Suspense>
            }
          />
          <Route path="/reports" element={<ReportsHubPage />} />
          <Route path="/notifications" element={<NotificationCenterPage />} />
          <Route path="/reminders" element={<RemindersHubPage />} />
          <Route path="/analytics/legacy" element={<AnalyticsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </PosAuthProvider>
  );
}
