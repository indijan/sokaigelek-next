import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";
import { uploadR2, r2PublicUrl } from "@/lib/r2Storage";

export async function POST(req: Request) {
    const cookieStore = await cookies();
    const ok = cookieStore.get("admin_ok")?.value === "1";
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const articleId = String(formData.get("article_id") || "");

    if (!file || !articleId) {
        return NextResponse.json({ error: "Missing file or article_id" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `articles/${articleId}/${crypto.randomUUID()}.${safeExt}`;

    const arrayBuffer = await file.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    const contentType = file.type || "image/jpeg";
    const url = r2PublicUrl(path);
    try {
        await uploadR2(path, body, contentType);
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "R2 upload failed" }, { status: 500 });
    }

    const { error: dbErr } = await supabaseServer
        .from("articles")
        .update({ cover_image_url: url, cover_image_path: path })
        .eq("id", articleId);

    if (dbErr) {
        return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({ url, path });
}
