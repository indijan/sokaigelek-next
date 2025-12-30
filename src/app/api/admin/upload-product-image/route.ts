import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
    const cookieStore = await cookies();
    const ok = cookieStore.get("admin_ok")?.value === "1";
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const slug = String(formData.get("slug") || "");
    const file = formData.get("file") as File | null;

    if (!slug) return NextResponse.json({ error: "Missing slug" }, { status: 400 });
    if (!file) return NextResponse.json({ error: "Missing file" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `products/${slug}.${ext}`;

    const { error: upErr } = await supabaseServer.storage
        .from("images")
        .upload(path, bytes, {
            contentType: file.type || "image/jpeg",
            upsert: true,
        });

    if (upErr) {
        return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { data } = supabaseServer.storage.from("images").getPublicUrl(path);
    const publicUrl = data.publicUrl;

    const { error: dbErr } = await supabaseServer
        .from("products")
        .update({ image_url: publicUrl })
        .eq("slug", slug);

    if (dbErr) {
        return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({ publicUrl });
}