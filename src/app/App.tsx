import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { TransactionsHistoryPage } from "@/pages/TransactionsHistoryPage";
import { SalesPage } from "@/pages/SalesPage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { LoginPage } from "@/pages/LoginPage";
import { PosPage } from "@/features/pos/pages/PosPage";
import { MenuManagementPage } from "@/features/pos/pages/MenuManagementPage";
import { PosAuthProvider, usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import { OrdersDashboardPage } from "@/features/orders/pages/OrdersDashboardPage";
import { OrdersHistoryPage } from "@/features/orders/pages/OrdersHistoryPage";
import { ScheduledOrdersPage } from "@/features/orders/pages/ScheduledOrdersPage";
import { OrderBoardPage } from "@/features/orders/pages/OrderBoardPage";
import { OrderDetailPage } from "@/features/orders/pages/OrderDetailPage";
import { StandaloneKdsPage } from "@/features/orders/pages/StandaloneKdsPage";
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
import { InvestmentsPage } from "@/features/finance/pages/InvestmentsPage";
import { BalanceTransferPage } from "@/features/finance/pages/BalanceTransferPage";
import { BackupPage } from "@/features/finance/pages/BackupPage";
import { ProfitAnalysisPage } from "@/features/analytics/pages/ProfitAnalysisPage";
import { ContentLoading, FullPageLoading } from "@/components/ui/Loading";

const ForecastDashboardPage = lazy(() =>
  import("@/features/forecast/pages/ForecastDashboardPage").then((m) => ({ default: m.ForecastDashboardPage }))
);

function AuthedApp() {
  const { user, loading } = usePosAuth();

  if (loading) {
    return <FullPageLoading label="Signing you in…" />;
  }

  return (
    <Routes>
      {/* Standalone kitchen display — same idea as classic kds.html (no AppShell) */}
      <Route path="/kds" element={<StandaloneKdsPage />} />
      <Route path="/kds.html" element={<Navigate to="/kds" replace />} />

      {!user ? (
        <Route path="*" element={<LoginPage />} />
      ) : (
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="/transactions" element={<TransactionsHistoryPage />} />
        <Route path="/pos" element={<PosPage />} />
        <Route path="/menu" element={<MenuManagementPage />} />
        <Route path="/orders" element={<OrdersDashboardPage />} />
        <Route path="/orders/history" element={<OrdersHistoryPage />} />
        <Route path="/scheduled" element={<ScheduledOrdersPage />} />
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
        <Route path="/investments" element={<InvestmentsPage />} />
        <Route path="/finance/investments" element={<InvestmentsPage />} />
        <Route path="/balance-transfer" element={<BalanceTransferPage />} />
        <Route path="/finance/balance-transfer" element={<BalanceTransferPage />} />
        <Route path="/backup" element={<BackupPage />} />
        <Route path="/finance/backup" element={<BackupPage />} />
        <Route path="/profit-analysis" element={<ProfitAnalysisPage />} />
        <Route path="/analytics" element={<AnalyticsDashboardPage />} />
        <Route
          path="/forecast"
          element={
            <Suspense fallback={<ContentLoading variant="dashboard" label="Loading forecast" />}>
              <ForecastDashboardPage />
            </Suspense>
          }
        />
        <Route path="/reports" element={<ReportsHubPage />} />
        <Route path="/notifications" element={<NotificationCenterPage />} />
        <Route path="/reminders" element={<RemindersHubPage />} />
        <Route path="/analytics/legacy" element={<AnalyticsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <PosAuthProvider>
      <AuthedApp />
    </PosAuthProvider>
  );
}
