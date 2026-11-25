import { Navigate } from "react-router-dom";

/** Legacy in-shell KDS — live kitchen is standalone /kds */
export function KdsPage() {
  return <Navigate to="/kds" replace />;
}
