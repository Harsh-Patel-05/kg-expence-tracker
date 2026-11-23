import { collection, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isoDate, num } from "@/lib/utils";
import { auditCreate, auditUpdate, logActivity } from "@/features/pos/services/posFirestore";
import { emitNotification } from "@/features/notifications/services/notificationEngine";
import { uploadDocumentFile, validateUploadFile } from "@/features/calendar/services/storageUpload";
import type {
  DocumentCommentDoc,
  DocumentFolderDoc,
  DocumentVersionDoc,
  ManagedDocumentDoc
} from "@/features/calendar/types";

export async function upsertFolder(input: { name: string; parentId?: string | null; id?: string }) {
  const name = input.name.trim();
  if (!name) throw new Error("Folder name required");
  const id = input.id || doc(collection(db, "documentFolders")).id;
  let path = name;
  if (input.parentId) {
    const parent = await getDoc(doc(db, "documentFolders", input.parentId));
    path = `${parent.data()?.path || parent.data()?.name || "Root"}/${name}`;
  }
  const payload: DocumentFolderDoc = {
    name,
    parentId: input.parentId ?? null,
    path,
    syncStatus: "synced",
    ...auditCreate({ status: "active" })
  };
  await setDoc(doc(db, "documentFolders", id), payload, { merge: true });
  return id;
}

export async function softDeleteFolder(id: string) {
  await setDoc(doc(db, "documentFolders", id), { isDeleted: true, ...auditUpdate({ status: "deleted" }) }, { merge: true });
}

export async function uploadDocument(input: {
  title: string;
  category: string;
  file: File;
  folderId?: string | null;
  folderPath?: string;
  tags?: string[];
  description?: string;
  branch?: string;
  department?: string;
  expiryDate?: string | null;
  issueDate?: string | null;
  notes?: string;
  uploadedByName?: string;
  id?: string;
}) {
  validateUploadFile(input.file);
  const uploaded = await uploadDocumentFile(input.file);
  const id = input.id || doc(collection(db, "documents")).id;
  const prev = input.id ? await getDoc(doc(db, "documents", id)) : null;
  const version = prev?.exists() ? num(prev.data()?.version) + 1 : 1;

  const payload: ManagedDocumentDoc = {
    title: input.title.trim() || input.file.name,
    description: input.description || "",
    category: input.category,
    folderId: input.folderId ?? null,
    folderPath: input.folderPath || "",
    tags: input.tags || [],
    fileName: input.file.name,
    fileSize: input.file.size,
    fileType: input.file.type || "application/octet-stream",
    storagePath: uploaded.path,
    downloadUrl: uploaded.url,
    uploadedByName: input.uploadedByName || "",
    branch: input.branch || "Main",
    department: input.department || "",
    ownerName: input.uploadedByName || "",
    issueDate: input.issueDate ?? null,
    expiryDate: input.expiryDate ?? null,
    renewalDate: input.expiryDate ?? null,
    notes: input.notes || "",
    version,
    archived: false,
    syncStatus: "synced",
    isDeleted: false,
    ...(prev?.exists() ? auditUpdate({ status: "active" }) : auditCreate({ status: "active" }))
  };

  await setDoc(doc(db, "documents", id), payload, { merge: true });

  await setDoc(doc(collection(db, "documentVersions")), {
    documentId: id,
    version,
    fileName: input.file.name,
    downloadUrl: uploaded.url,
    storagePath: uploaded.path,
    fileSize: input.file.size,
    comment: version === 1 ? "Initial upload" : `Version ${version}`,
    syncStatus: "synced",
    ...auditCreate({ status: "active" })
  } satisfies DocumentVersionDoc);

  if (input.expiryDate) {
    await setDoc(doc(collection(db, "documentExpiry")), {
      documentId: id,
      title: payload.title,
      category: payload.category,
      expiryDate: input.expiryDate,
      syncStatus: "synced",
      ...auditCreate({ status: "tracked" })
    });
  }

  await logActivity({
    action: version === 1 ? "document_uploaded" : "document_versioned",
    entityType: "documents",
    entityId: id,
    message: payload.title
  });

  await emitNotification({
    title: version === 1 ? "Document uploaded" : "Document updated",
    body: payload.title,
    kind: "custom",
    priority: "medium",
    link: "/documents",
    entityType: "documents",
    entityId: id
  });

  return id;
}

export async function softDeleteDocument(id: string) {
  await setDoc(doc(db, "documents", id), { isDeleted: true, ...auditUpdate({ status: "deleted" }) }, { merge: true });
}

export async function archiveDocument(id: string, archived = true) {
  await setDoc(doc(db, "documents", id), { archived, ...auditUpdate({ status: archived ? "archived" : "active" }) }, { merge: true });
}

export async function restoreDocumentVersion(documentId: string, versionId: string) {
  const v = await getDoc(doc(db, "documentVersions", versionId));
  if (!v.exists()) throw new Error("Version not found");
  const data = v.data() as DocumentVersionDoc;
  const docSnap = await getDoc(doc(db, "documents", documentId));
  const nextVersion = num(docSnap.data()?.version) + 1;
  await setDoc(
    doc(db, "documents", documentId),
    {
      downloadUrl: data.downloadUrl,
      storagePath: data.storagePath,
      fileName: data.fileName,
      fileSize: data.fileSize,
      version: nextVersion,
      ...auditUpdate()
    },
    { merge: true }
  );
  await setDoc(doc(collection(db, "documentVersions")), {
    documentId,
    version: nextVersion,
    fileName: data.fileName,
    downloadUrl: data.downloadUrl,
    storagePath: data.storagePath,
    fileSize: data.fileSize,
    comment: `Restored from v${data.version}`,
    syncStatus: "synced",
    ...auditCreate({ status: "active" })
  });
  await logActivity({
    action: "document_version_restored",
    entityType: "documents",
    entityId: documentId,
    message: `v${data.version}`
  });
}

export async function addDocumentComment(documentId: string, text: string, by?: string) {
  const ref = doc(collection(db, "documentComments"));
  const payload: DocumentCommentDoc = {
    documentId,
    text,
    by,
    mentions: Array.from(text.matchAll(/@(\w+)/g)).map((m) => m[1]),
    syncStatus: "synced",
    ...auditCreate({ status: "active" })
  };
  await setDoc(ref, payload);
  return ref.id;
}

export async function scanDocumentExpiry(docs: Array<ManagedDocumentDoc & { id: string }>) {
  const today = isoDate();
  for (const d of docs) {
    if (!d.expiryDate || d.isDeleted || d.archived) continue;
    const days = Math.round((Date.parse(d.expiryDate) - Date.parse(today)) / 86400000);
    if (days <= 30 && days >= 0) {
      await emitNotification({
        title: days <= 7 ? "Document expiry soon" : "Document renewal due",
        body: `${d.title} · expires ${d.expiryDate}`,
        kind: "license_renewal",
        priority: days <= 7 ? "critical" : "high",
        link: "/documents",
        entityType: "documents",
        entityId: d.id,
        dedupeKey: `doc-exp-${d.id}-${d.expiryDate}`
      });
    }
  }
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
