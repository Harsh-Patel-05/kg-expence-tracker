import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Folder, Search, Inbox } from "lucide-react";
import { isoDate } from "@/lib/utils";
import { useRestaurantCollection } from "@/features/pos/hooks/useRestaurantCollection";
import { usePosAuth } from "@/features/pos/auth/PosAuthProvider";
import type { DocumentFolderDoc, DocumentVersionDoc, ManagedDocumentDoc } from "@/features/calendar/types";
import { DOCUMENT_CATEGORIES } from "@/features/calendar/types";
import {
  addDocumentComment,
  archiveDocument,
  formatBytes,
  restoreDocumentVersion,
  scanDocumentExpiry,
  softDeleteDocument,
  softDeleteFolder,
  uploadDocument,
  upsertFolder
} from "../services/documentService";
import { useRestaurantCollection as useCol } from "@/features/pos/hooks/useRestaurantCollection";
import { EmptyState, PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";

import { ContentLoading } from "@/components/ui/Loading";

export function DocumentsPage() {
  const { user } = usePosAuth();
  const { data: docs, loading, error } = useRestaurantCollection<ManagedDocumentDoc>({ path: "documents" });
  const { data: folders } = useRestaurantCollection<DocumentFolderDoc>({ path: "documentFolders" });
  const { data: versions } = useCol<DocumentVersionDoc>({ path: "documentVersions" });
  const { data: comments } = useCol<{ documentId: string; text: string; by?: string; id: string }>({ path: "documentComments" });

  const [folderId, setFolderId] = useState<string | "all" | "root">("all");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [comment, setComment] = useState("");
  const [folderName, setFolderName] = useState("");
  const [form, setForm] = useState({
    title: "",
    category: "fssai",
    expiryDate: "",
    tags: "",
    notes: ""
  });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (scanned || !docs.length) return;
    scanDocumentExpiry(docs)
      .catch(() => null)
      .finally(() => setScanned(true));
  }, [docs, scanned]);

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (d.archived) return false;
      if (folderId === "root" && d.folderId) return false;
      if (folderId !== "all" && folderId !== "root" && d.folderId !== folderId) return false;
      if (category !== "all" && d.category !== category) return false;
      if (!query) return true;
      return `${d.title} ${d.fileName} ${d.category} ${(d.tags || []).join(" ")} ${d.uploadedByName || ""}`.toLowerCase().includes(query);
    });
  }, [docs, q, category, folderId]);

  const selected = docs.find((d) => d.id === selectedId) || null;
  const selectedVersions = versions.filter((v) => v.documentId === selectedId).sort((a, b) => b.version - a.version);
  const selectedComments = comments.filter((c) => c.documentId === selectedId);
  const expiring = docs.filter((d) => d.expiryDate && d.expiryDate >= isoDate() && d.expiryDate <= addDays(isoDate(), 30));

  async function upload() {
    if (!file) return;
    try {
      setBusy(true);
      const folder = folders.find((f) => f.id === folderId);
      const id = await uploadDocument({
        title: form.title || file.name,
        category: form.category,
        file,
        folderId: folderId !== "all" && folderId !== "root" ? folderId : null,
        folderPath: folder?.path || "",
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        expiryDate: form.expiryDate || null,
        notes: form.notes,
        uploadedByName: user?.email || "user"
      });
      setMsg("Document uploaded");
      setFile(null);
      setForm({ title: "", category: "fssai", expiryDate: "", tags: "", notes: "" });
      setSelectedId(id);
    } catch (e: any) {
      setMsg(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        eyebrow="Document management"
        title="Documents"
        actions={
          <>
          <Link to="/calendar" className="kg-btn kg-btn-secondary">
            Calendar
          </Link>
          <button onClick={() => setView(view === "grid" ? "list" : "grid")} className="kg-btn kg-btn-secondary">
            {view === "grid" ? "List view" : "Grid view"}
          </button>
          </>
        }
      />

      {msg ? <div className="rounded-lg border border-primary/20 bg-primary-light px-3 py-2 text-[13px] text-primary">{msg}</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Documents" value={docs.filter((d) => !d.archived).length} />
        <Stat label="Folders" value={folders.length} />
        <Stat label="Expiring ≤30d" value={expiring.length} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[240px_1fr_300px]">
        <div className="space-y-3">
          <Card hover={false} className="!p-3">
            <div className="mb-2 text-[14px] font-bold text-text-primary">Folders</div>
            <button className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] ${folderId === "all" ? "bg-primary hover:bg-primary-hover text-white" : "hover:bg-bg-1"}`} onClick={() => setFolderId("all")}>
              <Folder size={14} /> All files
            </button>
            <button className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] ${folderId === "root" ? "bg-primary hover:bg-primary-hover text-white" : "hover:bg-bg-1"}`} onClick={() => setFolderId("root")}>
              <Folder size={14} /> Unfiled
            </button>
            {folders.map((f) => (
              <div key={f.id} className="flex items-center gap-1">
                <button className={`mb-1 flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] ${folderId === f.id ? "bg-primary hover:bg-primary-hover text-white" : "hover:bg-bg-1"}`} onClick={() => setFolderId(f.id)}>
                  <Folder size={14} /> {f.name}
                </button>
                <button className="text-[10px] text-danger" onClick={() => softDeleteFolder(f.id)}>
                  ×
                </button>
              </div>
            ))}
            <div className="mt-2 flex gap-1">
              <input className="kg-input flex-1 !w-auto" placeholder="New folder" value={folderName} onChange={(e) => setFolderName(e.target.value)} />
              <button
                className="kg-btn kg-btn-primary"
                onClick={async () => {
                  await upsertFolder({ name: folderName, parentId: folderId !== "all" && folderId !== "root" ? folderId : null });
                  setFolderName("");
                  setMsg("Folder created");
                }}
              >
                Add
              </button>
            </div>
          </Card>

          <Card hover={false} className="!p-3">
            <div className="mb-2 text-[14px] font-bold text-text-primary">Upload</div>
            <input className="kg-input mb-2 w-full" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <select className="kg-input mb-2 w-full" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input type="date" className="kg-input mb-2 w-full" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} title="Expiry" />
            <input className="kg-input mb-2 w-full" placeholder="Tags (comma)" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
            <input type="file" className="mb-2 w-full text-xs" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button disabled={!file || busy} onClick={upload} className="w-full kg-btn kg-btn-primary disabled:opacity-50">
              {busy ? "Uploading…" : "Upload"}
            </button>
          </Card>
        </div>

        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden />
              <input className="kg-input w-full !pl-9 pr-3" placeholder="Search title, tags, file…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search documents" />
            </div>
            <select className="kg-input !w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {loading ? <ContentLoading variant="table" label="Loading" /> : null}

          {view === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((d) => (
                <button key={d.id} type="button" onClick={() => setSelectedId(d.id)} className={`rounded-[var(--radius-xl)] border p-4 text-left shadow-panel ${selectedId === d.id ? "border-primary bg-primary-light" : "border-stroke-0 bg-card-0"}`}>
                  <FileText className="mb-2 text-text-muted" size={22} />
                  <div className="truncate font-semibold text-text-primary">{d.title}</div>
                  <div className="text-xs text-text-muted">
                    {d.category} · v{d.version} · {formatBytes(d.fileSize)}
                  </div>
                  {d.expiryDate ? <div className="mt-1 text-[10px] font-bold text-warning">Exp {d.expiryDate}</div> : null}
                </button>
              ))}
            </div>
          ) : (
            <Card hover={false} className="!p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[13px]">
                  <thead className="bg-bg-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                    <tr>
                      <th className="px-3 py-2">Title</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Size</th>
                      <th className="px-3 py-2">Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id} className="cursor-pointer border-t border-stroke-0 hover:bg-bg-1" onClick={() => setSelectedId(d.id)}>
                        <td className="px-3 py-2 font-semibold">{d.title}</td>
                        <td className="px-3 py-2">{d.category}</td>
                        <td className="px-3 py-2">{formatBytes(d.fileSize)}</td>
                        <td className="px-3 py-2">{d.expiryDate || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          {!rows.length && !loading ? <EmptyState title="No documents." /> : null}
        </div>

        <Card padding="sm" hover={false}>
          {!selected ? <EmptyState className="m-3" icon={<Inbox size={18} />} title="Select a document" /> : null}
          {selected ? (
            <div className="space-y-3">
              <div>
                <div className="text-[16px] font-bold text-text-primary">{selected.title}</div>
                <div className="text-xs text-text-muted">
                  {selected.fileName} · {formatBytes(selected.fileSize)} · v{selected.version}
                </div>
              </div>
              {selected.fileType.startsWith("image/") || selected.downloadUrl.startsWith("data:image") ? (
                <img src={selected.downloadUrl} alt={selected.title} className="max-h-48 w-full rounded-lg object-contain border border-stroke-0" />
              ) : selected.fileType === "application/pdf" || selected.downloadUrl.includes("pdf") ? (
                <iframe title="preview" src={selected.downloadUrl} className="h-48 w-full rounded-lg border border-stroke-0" />
              ) : (
                <div className="rounded-lg bg-bg-1 p-4 text-center text-xs text-text-muted">Preview not available — download instead</div>
              )}
              <a href={selected.downloadUrl} target="_blank" rel="noreferrer" download={selected.fileName} className="kg-btn kg-btn-primary w-full justify-center">
                Download
              </a>
              <div className="flex flex-wrap gap-2">
                <button className="text-xs font-semibold text-warning" onClick={async () => { await archiveDocument(selected.id); setMsg("Archived"); }}>
                  Archive
                </button>
                <button className="text-xs font-semibold text-danger" onClick={async () => { await softDeleteDocument(selected.id); setSelectedId(null); setMsg("Deleted"); }}>
                  Delete
                </button>
              </div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase text-text-muted">Versions</div>
                {selectedVersions.map((v) => (
                  <div key={v.id} className="mb-1 flex items-center justify-between text-xs">
                    <span>
                      v{v.version} · {v.comment}
                    </span>
                    <button className="font-semibold text-primary" onClick={async () => { await restoreDocumentVersion(selected.id, v.id); setMsg("Version restored"); }}>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase text-text-muted">Comments</div>
                <div className="max-h-28 space-y-1 overflow-auto">
                  {selectedComments.map((c) => (
                    <div key={c.id} className="rounded-lg border border-stroke-0 bg-bg-1/60 px-2 py-1 text-xs">
                      <strong>{c.by || "User"}:</strong> {c.text}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input className="kg-input flex-1 !w-auto" placeholder="Comment… @mention" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <button
                    className="kg-btn kg-btn-primary"
                    onClick={async () => {
                      await addDocumentComment(selected.id, comment, user?.email || "user");
                      setComment("");
                    }}
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <KpiCard title={label} value={String(value)} />;
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
