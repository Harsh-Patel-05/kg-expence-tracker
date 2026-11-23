import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "@/lib/firebase";
import { ALLOWED_MIME, MAX_FILE_BYTES } from "@/features/calendar/types";

export function validateUploadFile(file: File) {
  if (file.size > MAX_FILE_BYTES) throw new Error("File too large (max 12MB)");
  const ok =
    ALLOWED_MIME.includes(file.type) ||
    /\.(pdf|jpe?g|png|webp|docx?|xlsx?|csv|txt|zip)$/i.test(file.name);
  if (!ok) throw new Error("Unsupported file type");
}

export async function uploadToStorage(path: string, file: File): Promise<{ url: string; path: string }> {
  validateUploadFile(file);
  const uid = auth.currentUser?.uid || "anon";
  const fullPath = `${path}/${uid}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
  const storageRef = ref(storage, fullPath);
  await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(storageRef);
  return { url, path: fullPath };
}

/** Fallback for environments where Storage rules block — compress small files to data URL */
export async function fileToDataUrl(file: File, maxBytes = 400_000): Promise<string> {
  validateUploadFile(file);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
  if (dataUrl.length <= maxBytes || !file.type.startsWith("image/")) {
    if (dataUrl.length > maxBytes * 3) throw new Error("File too large for inline storage; enable Firebase Storage");
    return dataUrl;
  }
  const img = await createImageBitmap(file);
  const scale = Math.min(1, Math.sqrt(maxBytes / dataUrl.length));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(img.width * scale));
  canvas.height = Math.max(1, Math.floor(img.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl.slice(0, maxBytes);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

export async function uploadDocumentFile(file: File): Promise<{ url: string; path?: string }> {
  try {
    const res = await uploadToStorage("documents", file);
    return { url: res.url, path: res.path };
  } catch (e: any) {
    // Storage may be blocked — fall back to data URL for smaller docs
    if (file.size > 500_000) throw e;
    const url = await fileToDataUrl(file);
    return { url };
  }
}
