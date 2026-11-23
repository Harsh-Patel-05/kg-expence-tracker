import { Link } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export function AnalyticsPage() {
  return (
    <div className="grid gap-4">
      <PageHeader eyebrow="Insights" title="Analytics (legacy)" description="Older analytics view kept for reference." />
      <Card hover={false}>
        <div className="text-[14px] font-bold text-text-primary">Moved to the live module</div>
        <div className="mt-1 text-[12px] text-text-muted">
          Prefer the live Analytics module.{" "}
          <Link to="/analytics" className="font-semibold text-primary hover:underline">
            Open Analytics →
          </Link>
        </div>
      </Card>
    </div>
  );
}
