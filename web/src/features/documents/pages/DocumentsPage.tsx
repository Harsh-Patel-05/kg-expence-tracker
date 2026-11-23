import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Folder, Search } from "lucide-react";
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Document management</div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Documents</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/calendar" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            Calendar
          </Link>
          <button onClick={() => setView(view === "grid" ? "list" : "grid")} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">
            {view === "grid" ? "List view" : "Grid view"}
          </button>
        </div>
      </div>

      {msg ? <div className="rounded-xl bg-cyan-50 px-3 py-2 text-sm text-cyan-900">{msg}</div> : null}
      {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Documents" value={docs.filter((d) => !d.archived).length} />
        <Stat label="Folders" value={folders.length} />
        <Stat label="Expiring ≤30d" value={expiring.length} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[240px_1fr_300px]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 text-sm font-bold">Folders</div>
            <button className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${folderId === "all" ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`} onClick={() => setFolderId("all")}>
              <Folder size={14} /> All files
            </button>
            <button className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${folderId === "root" ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`} onClick={() => setFolderId("root")}>
              <Folder size={14} /> Unfiled
            </button>
            {folders.map((f) => (
              <div key={f.id} className="flex items-center gap-1">
                <button className={`mb-1 flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm ${folderId === f.id ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`} onClick={() => setFolderId(f.id)}>
                  <Folder size={14} /> {f.name}
                </button>
                <button className="text-[10px] text-rose-600" onClick={() => softDeleteFolder(f.id)}>
                  ×
                </button>
              </div>
            ))}
            <div className="mt-2 flex gap-1">
              <input className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" placeholder="New folder" value={folderName} onChange={(e) => setFolderName(e.target.value)} />
              <button
                className="rounded-lg bg-slate-900 px-2 text-xs font-semibold text-white"
                onClick={async () => {
                  await upsertFolder({ name: folderName, parentId: folderId !== "all" && folderId !== "root" ? folderId : null });
                  setFolderName("");
                  setMsg("Folder created");
                }}
              >
                Add
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 text-sm font-bold">Upload</div>
            <input className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            <select className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input type="date" className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} title="Expiry" />
            <input className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Tags (comma)" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
            <input type="file" className="mb-2 w-full text-xs" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <button disabled={!file || busy} onClick={upload} className="w-full rounded-xl bg-cyan-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>

        <div className="space-y-3 min-w-0">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm" placeholder="Search title, tags, file…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <select className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {loading ? <div className="h-40 animate-pulse rounded-2xl bg-slate-200/70" /> : null}

          {view === "grid" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((d) => (
                <button key={d.id} type="button" onClick={() => setSelectedId(d.id)} className={`rounded-2xl border p-4 text-left shadow-sm ${selectedId === d.id ? "border-cyan-400 bg-cyan-50" : "border-slate-200 bg-white"}`}>
                  <FileText className="mb-2 text-slate-400" size={22} />
                  <div className="truncate font-semibold text-slate-900">{d.title}</div>
                  <div className="text-xs text-slate-500">
                    {d.category} · v{d.version} · {formatBytes(d.fileSize)}
                  </div>
                  {d.expiryDate ? <div className="mt-1 text-[10px] font-bold text-amber-700">Exp {d.expiryDate}</div> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Size</th>
                    <th className="px-3 py-2">Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setSelectedId(d.id)}>
                      <td className="px-3 py-2 font-semibold">{d.title}</td>
                      <td className="px-3 py-2">{d.category}</td>
                      <td className="px-3 py-2">{formatBytes(d.fileSize)}</td>
                      <td className="px-3 py-2">{d.expiryDate || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!rows.length && !loading ? <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">No documents.</div> : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {!selected ? <div className="py-12 text-center text-sm text-slate-500">Select a document</div> : null}
          {selected ? (
            <div className="space-y-3">
              <div>
                <div className="text-lg font-black">{selected.title}</div>
                <div className="text-xs text-slate-500">
                  {selected.fileName} · {formatBytes(selected.fileSize)} · v{selected.version}
                </div>
              </div>
              {selected.fileType.startsWith("image/") || selected.downloadUrl.startsWith("data:image") ? (
                <img src={selected.downloadUrl} alt={selected.title} className="max-h-48 w-full rounded-xl object-contain border border-slate-100" />
              ) : selected.fileType === "application/pdf" || selected.downloadUrl.includes("pdf") ? (
                <iframe title="preview" src={selected.downloadUrl} className="h-48 w-full rounded-xl border border-slate-100" />
              ) : (
                <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-500">Preview not available — download instead</div>
              )}
              <a href={selected.downloadUrl} target="_blank" rel="noreferrer" download={selected.fileName} className="block rounded-xl bg-slate-900 px-3 py-2 text-center text-sm font-semibold text-white">
                Download
              </a>
              <div className="flex flex-wrap gap-2">
                <button className="text-xs font-semibold text-amber-700" onClick={async () => { await archiveDocument(selected.id); setMsg("Archived"); }}>
                  Archive
                </button>
                <button className="text-xs font-semibold text-rose-600" onClick={async () => { await softDeleteDocument(selected.id); setSelectedId(null); setMsg("Deleted"); }}>
                  Delete
                </button>
              </div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase text-slate-500">Versions</div>
                {selectedVersions.map((v) => (
                  <div key={v.id} className="mb-1 flex items-center justify-between text-xs">
                    <span>
                      v{v.version} · {v.comment}
                    </span>
                    <button className="font-semibold text-cyan-700" onClick={async () => { await restoreDocumentVersion(selected.id, v.id); setMsg("Version restored"); }}>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1 text-xs font-bold uppercase text-slate-500">Comments</div>
                <div className="max-h-28 space-y-1 overflow-auto">
                  {selectedComments.map((c) => (
                    <div key={c.id} className="rounded-lg bg-slate-50 px-2 py-1 text-xs">
                      <strong>{c.by || "User"}:</strong> {c.text}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-sm" placeholder="Comment… @mention" value={comment} onChange={(e) => setComment(e.target.value)} />
                  <button
                    className="rounded-lg bg-cyan-500 px-2 text-xs font-semibold text-white"
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
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="text-xl font-black">{value}</div>
    </div>
  );
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
