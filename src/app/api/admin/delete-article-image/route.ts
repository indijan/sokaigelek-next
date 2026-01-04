import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";
import { deleteVercelBlob, isVercelBlobUrl } from "@/lib/blobStorage";

export async function POST(req: Request) {
    const cookieStore = await cookies();
    const ok = cookieStore.get("admin_ok")?.value === "1";
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    const articleId = String(formData.get("article_id") || "");
    if (!articleId) {
        return NextResponse.json({ error: "Missing article_id" }, { status: 400 });
    }

    // lekérjük, mi van most beállítva
    const { data: article, error: readErr } = await supabaseServer
        .from("articles")
        .select("cover_image_path, cover_image_url")
        .eq("id", articleId)
        .single();

    if (readErr) {
        return NextResponse.json({ error: readErr.message }, { status: 500 });
    }

    const path = article?.cover_image_path as string | null;
    const url = article?.cover_image_url as string | null;

    if (url && isVercelBlobUrl(url)) {
        await deleteVercelBlob(url);
    } else if (path) {
        const { error: delErr } = await supabaseServer.storage
            .from("article-images")
            .remove([path]);

        if (delErr) {
            return NextResponse.json({ error: delErr.message }, { status: 500 });
        }
    }

    // DB mezők nullázása
    const { error: updErr } = await supabaseServer
        .from("articles")
        .update({ cover_image_url: null, cover_image_path: null })
        .eq("id", articleId);

    if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
