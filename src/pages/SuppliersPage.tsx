import { Navigate } from "react-router-dom";

/** Legacy page — live suppliers hub is /suppliers */
export function SuppliersPage() {
  return <Navigate to="/suppliers" replace />;
}
