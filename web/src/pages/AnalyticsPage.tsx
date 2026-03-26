import { Card } from "@/components/ui/Card";

export function AnalyticsPage() {
  return (
    <div className="grid gap-4">
      <Card>
        <div className="text-sm font-semibold">Analytics</div>
        <div className="mt-1 text-xs text-white/55">
          Next: sales trends, profit trends, expense insights (filters by week/month/custom range).
        </div>
      </Card>
    </div>
  );
}

