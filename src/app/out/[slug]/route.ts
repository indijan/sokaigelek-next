import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
    const { slug } = await ctx.params;

    const url = new URL(req.url);
    const which = Number(url.searchParams.get("to") ?? "1");

    // opcionális tracking adatok (később továbbítjuk automatikusan)
    const pageUrl = url.searchParams.get("from") ?? null;
    const visitorHash = url.searchParams.get("vh") ?? null;
    const conversationId = url.searchParams.get("cid") ?? null;

    const { data: product, error } = await supabaseServer
        .from("products")
        .select("slug, affiliate_url_1, affiliate_url_2")
        .eq("slug", slug)
        .single();

    if (error || !product) return NextResponse.redirect(new URL("/", url.origin));

    const target = which === 2 ? product.affiliate_url_2 : product.affiliate_url_1;

    if (!target) return NextResponse.redirect(new URL(`/termek/${slug}`, url.origin));

    // Kattintás log (ha már létrehoztad az outbound_clicks táblát)
    try {
        await supabaseServer.from("outbound_clicks").insert({
            product_slug: slug,
            which: which === 2 ? 2 : 1,
            target_url: target,
            page_url: pageUrl,
            visitor_hash: visitorHash,
            conversation_id: conversationId,
        });
    } catch {}

    return NextResponse.redirect(target, { status: 302 });
}