"use client";

import { upload } from "@vercel/blob/client";
import { formatBytes, maxBytesFor, type UploadedFile } from "./upload-rules";

/** Reduz a foto no aparelho antes de enviar (lado maior 2000 px, JPEG 82%). */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || /heic|heif|gif|svg/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "foto";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function safeName(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .slice(-80) || "arquivo"
  );
}

/** Nome amigável para fotos tiradas pela câmera (que vêm como image.jpg). */
export function friendlyName(file: File) {
  if (/^(image|photo|img)[-_ ]?\d*\.(jpe?g|png|heic)$/i.test(file.name) || !file.name) {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `Foto ${p(d.getDate())}-${p(d.getMonth() + 1)} ${p(d.getHours())}h${p(d.getMinutes())}.jpg`;
  }
  return file.name;
}

/**
 * Envia os arquivos direto do aparelho para o armazenamento.
 * `onProgress` recebe (arquivo atual, total, % do arquivo atual).
 */
export async function uploadFiles(files: File[], onProgress?: (i: number, total: number, pct: number) => void): Promise<UploadedFile[]> {
  const out: UploadedFile[] = [];
  for (const [i, original] of files.entries()) {
    const displayName = friendlyName(original);
    const file = await compressImage(original);
    const limit = maxBytesFor(file.type);
    if (file.size > limit) throw new Error(`“${displayName}” tem ${formatBytes(file.size)}. O limite é ${formatBytes(limit)} por arquivo.`);
    const contentType = file.type || "application/octet-stream";
    const blob = await upload(`anexos/${Date.now()}-${safeName(displayName)}`, file, {
      access: "public",
      handleUploadUrl: "/api/upload",
      contentType,
      multipart: file.size > 5 * 1024 * 1024,
      onUploadProgress: (p) => onProgress?.(i + 1, files.length, Math.round(p.percentage)),
    });
    out.push({ url: blob.url, pathname: blob.pathname, mimeType: contentType, size: file.size, name: displayName.slice(0, 200) });
  }
  return out;
}
