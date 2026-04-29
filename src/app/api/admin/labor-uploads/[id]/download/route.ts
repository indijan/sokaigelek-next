import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const ok = cookieStore.get("admin_ok")?.value === "1";
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await supabaseServer
    .from("lab_upload_requests")
    .select("storage_bucket, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (error || !data?.storage_bucket || !data?.storage_path) {
    return NextResponse.json({ error: "Nem található a feltöltött fájl." }, { status: 404 });
  }

  const { data: signed, error: signedError } = await supabaseServer.storage
    .from(String(data.storage_bucket))
    .createSignedUrl(String(data.storage_path), 60);

  if (signedError || !signed?.signedUrl) {
    return NextResponse.json({ error: "Nem sikerült aláírt letöltési linket létrehozni." }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl, { status: 302 });
}
