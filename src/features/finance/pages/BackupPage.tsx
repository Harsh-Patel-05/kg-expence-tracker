import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { downloadBackupJson, exportRestaurantBackup, importRestaurantBackup } from "../services/backupService";
import { isFullAdmin } from "@/features/pos/utils/permissions";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";

export function BackupPage() {
  const { role } = usePosAuth();
  const canImport = isFullAdmin(role) || role === "owner" || role === "manager" || role === "admin";
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "error" } | null>(null);

  const onExport = async () => {
    setBusy("export");
    setMsg(null);
    try {
      const backup = await exportRestaurantBackup();
      downloadBackupJson(backup);
      setMsg({ text: "Export downloaded", kind: "ok" });
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : "Export failed", kind: "error" });
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setMsg({ text: "Invalid JSON", kind: "error" });
      return;
    }
    const count =
      parsed && typeof parsed === "object" && (parsed as { data?: Record<string, unknown[]> }).data
        ? Object.values((parsed as { data: Record<string, unknown[]> }).data).reduce((n, arr) => n + (Array.isArray(arr) ? arr.length : 0), 0)
        : 0;
    const hint = count > 0 ? `About ${count} records may be written. Existing doc IDs will be overwritten.` : "No record arrays found — import may do nothing.";
    if (!window.confirm(`Import backup from "${file.name}"?\n\n${hint}\n\nContinue?`)) return;

    setBusy("import");
    setMsg(null);
    try {
      const { written, collections } = await importRestaurantBackup(parsed);
      setMsg({
        text: written ? `Imported ${written} docs into ${collections.length} collection(s).` : "No records imported (empty backup).",
        kind: "ok"
      });
    } catch (e: unknown) {
      setMsg({ text: e instanceof Error ? e.message : "Import failed", kind: "error" });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Backup"
        description="Export your restaurant data as JSON or restore from a previous backup file."
      />

      {msg ? (
        <div
          className={
            msg.kind === "ok"
              ? "rounded-xl border border-success/30 bg-success-bg px-4 py-3 text-sm text-success"
              : "rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger"
          }
        >
          {msg.text}
        </div>
      ) : null}

      <Card>
        <SectionTitle title="Data backup" />
        <p className="mb-4 text-sm text-text-muted">
          Matches classic Export JSON / Import JSON. Includes sales, expenses, purchases, staff, payroll, suppliers, investments,
          transfers, reminders, documents, and menu items where available.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button type="button" disabled={busy !== null} onClick={() => void onExport()} className="inline-flex items-center justify-center gap-2">
            <Download size={16} aria-hidden />
            {busy === "export" ? "Exporting…" : "Export JSON"}
          </Button>
          <label className="cursor-pointer">
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="sr-only"
              disabled={!canImport || busy !== null}
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
            <span
              className="kg-btn kg-btn-secondary flex w-full items-center justify-center gap-2"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
              }}
              onClick={() => canImport && fileRef.current?.click()}
            >
              <Upload size={16} aria-hidden />
              {busy === "import" ? "Importing…" : "Import JSON"}
            </span>
          </label>
        </div>
        {!canImport ? (
          <p className="mt-3 text-xs text-text-muted">Import requires owner or admin access.</p>
        ) : null}
      </Card>
    </div>
  );
}