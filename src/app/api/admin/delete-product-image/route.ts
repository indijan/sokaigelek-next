import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";
import { deleteVercelBlob, isVercelBlobUrl } from "@/lib/blobStorage";

export async function POST(req: Request) {
    const cookieStore = await cookies();
    const ok = cookieStore.get("admin_ok")?.value === "1";
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const formData = await req.formData();
    let productId = String(formData.get("product_id") || "");
    const slug = String(formData.get("slug") || "");
    if (!productId && slug) {
        const { data: p } = await supabaseServer
            .from("products")
            .select("id")
            .eq("slug", slug)
            .single();
        if (p?.id) productId = String(p.id);
    }
    if (!productId) return NextResponse.json({ error: "Missing product_id" }, { status: 400 });

    const { data: product, error: readErr } = await supabaseServer
        .from("products")
        .select("image_url")
        .eq("id", productId)
        .single();

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

    const imageUrl = (product as any)?.image_url as string | null;
    let path: string | null = null;
    if (imageUrl) {
        if (isVercelBlobUrl(imageUrl)) {
            await deleteVercelBlob(imageUrl);
        } else {
            const marker = "/images/";
            const idx = imageUrl.indexOf(marker);
            if (idx !== -1) {
                path = imageUrl.slice(idx + marker.length);
            }
        }
    }

    if (path) {
        const { error: delErr } = await supabaseServer.storage
            .from("images")
            .remove([path]);

        if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    const { error: updErr } = await supabaseServer
        .from("products")
        .update({ image_url: null })
        .eq("id", productId);

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
}
