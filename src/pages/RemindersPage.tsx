import { Navigate } from "react-router-dom";

/** Legacy page — live reminders hub is /reminders */
export function RemindersPage() {
  return <Navigate to="/reminders" replace />;
}
