import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { auth } from "@/auth";

// Recebe a foto (já reduzida no aparelho) e guarda no Vercel Blob.
const MAX = 8 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

export async function POST(req: Request) {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Armazenamento de fotos não configurado (BLOB_READ_WRITE_TOKEN)." }, { status: 503 });
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Arquivo acima de 8 MB." }, { status: 413 });
  if (!TYPES.includes(file.type)) return NextResponse.json({ error: "Envie uma foto (JPG, PNG, WEBP) ou PDF." }, { status: 415 });

  const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
  const blob = await put(`evidencias/${ownerId}/${Date.now()}.${ext}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: file.type,
  });
  return NextResponse.json({ url: blob.url, pathname: blob.pathname, mimeType: file.type, size: file.size });
}
