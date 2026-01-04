import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";
import { uploadVercelBlob } from "@/lib/blobStorage";

export async function POST(req: Request) {
    const cookieStore = await cookies();
    const ok = cookieStore.get("admin_ok")?.value === "1";
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const articleId = String(formData.get("article_id") || "");

    if (!file || !articleId) {
        return NextResponse.json(
            { error: "Missing file or article_id" },
            { status: 400 }
        );
    }

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `articles/${articleId}/${crypto.randomUUID()}.${safeExt}`;

    // IMPORTANT: Buffer, ne Uint8Array (különben jöhet a “string did not match pattern”)
    const arrayBuffer = await file.arrayBuffer();
    const body = Buffer.from(arrayBuffer);

    const contentType = file.type || "image/jpeg";
    const blobUrl = await uploadVercelBlob(path, body, contentType);

    let url = "";
    let coverImagePath: string | null = null;

    if (blobUrl) {
        url = blobUrl;
    } else {
        const { error: uploadErr } = await supabaseServer.storage
            .from("article-images")
            .upload(path, body, {
                contentType,
                upsert: true,
            });

        if (uploadErr) {
            return NextResponse.json({ error: uploadErr.message }, { status: 500 });
        }

        const { data: pub } = supabaseServer.storage
            .from("article-images")
            .getPublicUrl(path);

        url = pub.publicUrl;
        coverImagePath = path;
    }

    const { error: dbErr } = await supabaseServer
        .from("articles")
        .update({ cover_image_url: url, cover_image_path: coverImagePath })
        .eq("id", articleId);

    if (dbErr) {
        return NextResponse.json({ error: dbErr.message }, { status: 500 });
    }

    return NextResponse.json({ url, path: coverImagePath });
}
