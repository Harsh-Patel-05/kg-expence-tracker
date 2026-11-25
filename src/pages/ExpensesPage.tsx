import { Navigate } from "react-router-dom";

/** Legacy page — live expenses hub is /expenses */
export function ExpensesPage() {
  return <Navigate to="/expenses" replace />;
}
