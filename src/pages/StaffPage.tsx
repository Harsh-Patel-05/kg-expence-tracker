import { Navigate } from "react-router-dom";

/** Legacy page — live HR is under /hr */
export function StaffPage() {
  return <Navigate to="/hr" replace />;
}
