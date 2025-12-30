import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(req: Request) {
    const ok = (await req.headers.get("cookie") || "").includes("admin_ok=1");
    if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const { articleId } = await req.json();

    const { data: article, error: aErr } = await supabaseServer
        .from("articles")
        .select("id, title, excerpt, content_html")
        .eq("id", articleId)
        .single();

    if (aErr || !article) return NextResponse.json({ error: "article_not_found" }, { status: 404 });

    const { data: products, error: pErr } = await supabaseServer
        .from("products")
        .select("slug, name")
        .order("name", { ascending: true });

    if (pErr || !products) return NextResponse.json({ error: "products_not_found" }, { status: 500 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "missing_OPENAI_API_KEY" }, { status: 500 });

    const productList = products.map((p) => `${p.slug} — ${p.name}`).join("\n");

    const prompt = `
Válaszd ki a legjobb 0-5 kapcsolódó terméket a cikkhez.
Csak az alábbi listából választhatsz, és csak a slugokat add vissza.

TERMÉKEK:
${productList}

CIKK:
Cím: ${article.title || ""}
Kivonat: ${article.excerpt || ""}
Tartalom (HTML): ${article.content_html || ""}

Válasz formátum: egyetlen JSON objektum, pl:
{"slugs":["duolife-aloes","masik-termek"]}
Ha semmi nem releváns: {"slugs":[]}
`.trim();

    const r = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: "gpt-5-mini",
            input: prompt,
        }),
    });

    if (!r.ok) {
        const t = await r.text();
        return NextResponse.json({ error: "openai_error", detail: t }, { status: 500 });
    }

    const data = await r.json();

    // Responses API: text kinyerés (robosztusabb)
    const text =
        data?.output_text ||
        data?.output?.map((o: any) => o?.content?.map((c: any) => c?.text).join("")).join("") ||
        "";

    let slugs: string[] = [];
    try {
        const parsed = JSON.parse(text);
        slugs = Array.isArray(parsed?.slugs) ? parsed.slugs : [];
    } catch {
        slugs = [];
    }

    // csak olyan slug maradjon, ami létező termék
    const allowed = new Set(products.map((p) => p.slug));
    slugs = slugs.filter((s) => allowed.has(s)).slice(0, 5);

    await supabaseServer
        .from("articles")
        .update({ related_product_slugs: slugs })
        .eq("id", articleId);

    return NextResponse.json({ slugs });
}