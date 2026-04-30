import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const maxDuration = 60;

const bucket = process.env.LAB_UPLOADS_BUCKET || "lab-uploads";
const maxBytes = 12 * 1024 * 1024;
const allowedMimeTypes = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
const allowedExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];

function sanitizeFilename(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const file = formData.get("file");

    if (!name) return NextResponse.json({ error: "A név megadása kötelező." }, { status: 400 });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Adj meg egy érvényes e-mail címet." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Tölts fel egy PDF vagy képfájlt." }, { status: 400 });
    }
    if (file.size <= 0) return NextResponse.json({ error: "A feltöltött fájl üres." }, { status: 400 });
    if (file.size > maxBytes) {
      return NextResponse.json({ error: "A fájl túl nagy. Maximum 12 MB tölthető fel." }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    const allowedByExtension = allowedExtensions.some((ext) => lowerName.endsWith(ext));
    const allowedByMime = allowedMimeTypes.has(file.type);
    if (!allowedByExtension && !allowedByMime) {
      return NextResponse.json({ error: "Csak PDF, JPG, PNG vagy WEBP fájl tölthető fel." }, { status: 400 });
    }

    const id = randomUUID();
    const ext = allowedExtensions.find((item) => lowerName.endsWith(item)) || ".bin";
    const safeBase = sanitizeFilename(lowerName.replace(/\.[^.]+$/, "")) || "labor";
    const filePath = `${new Date().toISOString().slice(0, 10)}/${id}-${safeBase}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabaseServer.storage.from(bucket).upload(filePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (uploadErr) {
      return NextResponse.json(
        { error: "A fájlt nem sikerült feltölteni. Ellenőrizd, hogy a privát labor bucket létezik-e." },
        { status: 500 }
      );
    }

    const payload = {
      id,
      uploader_name: name,
      uploader_email: email,
      original_filename: file.name,
      mime_type: file.type || "application/octet-stream",
      file_size: file.size,
      storage_bucket: bucket,
      storage_path: filePath,
      status: "new",
    };

    const { error: insertErr } = await supabaseServer.from("lab_upload_requests").insert(payload);
    if (insertErr) {
      await supabaseServer.storage.from(bucket).remove([filePath]);
      return NextResponse.json(
        { error: "A beküldést nem sikerült elmenteni. Valószínűleg hiányzik a lab_upload_requests tábla." },
        { status: 500 }
      );
    }

    try {
      await supabaseServer.from("miniapp_events").insert({
        source: "labor_upload",
        event_name: "lab_upload_received",
        mode: "landing",
        payload: {
          uploaderEmail: email,
          originalFilename: file.name,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream",
        },
      });
    } catch {
      // Stat logging must not block the upload flow.
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("labor upload error", error);
    return NextResponse.json({ error: "Váratlan hiba történt a feltöltés közben." }, { status: 500 });
  }
}
