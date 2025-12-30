import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Body = {
    articleId: string;
};

function stripHtml(input: string): string {
    return input
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function extractHeadings(html: string): string[] {
    const headings: string[] = [];
    const re = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
        const text = stripHtml(String(m[1] || "")).trim();
        if (text) headings.push(text);
        if (headings.length >= 6) break;
    }
    return Array.from(new Set(headings));
}

function pickKeySentences(text: string, count: number): string[] {
    const sentences = text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 40);
    if (!sentences.length) return [];
    if (sentences.length <= count) return sentences;
    const picks: string[] = [];
    const positions = [0, Math.floor(sentences.length / 2), sentences.length - 1];
    for (const idx of positions) {
        if (picks.length >= count) break;
        const s = sentences[idx];
        if (s && !picks.includes(s)) picks.push(s);
    }
    return picks.slice(0, count);
}

export async function POST(req: Request) {
    // admin védelem (ugyanaz a logika, mint máshol)
    const cookieStore = await cookies();
    const ok = cookieStore.get("admin_ok")?.value === "1";
    if (!ok) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as Body;
    if (!body?.articleId) {
        return NextResponse.json({ error: "Missing articleId" }, { status: 400 });
    }

    const supabase = supabaseServer;

    // 1) cikk betöltése
    const { data: article, error: aErr } = await supabase
        .from("articles")
        .select("id, slug, title, excerpt, category_slug, content_html")
        .eq("id", body.articleId)
        .single();

    if (aErr || !article) {
        return NextResponse.json({ error: aErr?.message || "Article not found" }, { status: 404 });
    }

    const title = article.title || "";
    const intro = (article.excerpt || "").slice(0, 260);
    const category = article.category_slug || "";
    const bodyHtml = String(article.content_html || "");
    const headings = extractHeadings(bodyHtml);
    const bodyText = stripHtml(bodyHtml);
    const keySentences = pickKeySentences(bodyText, 3);

    const imageSize = process.env.ARTICLE_COVER_IMAGE_SIZE || "1536x1024";
    const styleHint = process.env.ARTICLE_COVER_STYLE_HINT || "";

    // 2) prompt (FB engagement friendly, still clean)
    const prompt = [
        "Create a clean, modern blog cover image optimized for Facebook feed engagement.",
        "Composition: clear subject, bold focal point, high contrast, inviting mood.",
        "Style: premium, soft lighting, subtle gradients, no clutter.",
        "Theme: health & wellbeing education (Hungarian audience).",
        "Add the article title as visible overlay text on the image.",
        "Use the exact title text as provided. Do not change, shorten, correct, or paraphrase it. No typos.",
        "If you cannot render the title exactly as provided without errors, omit the title entirely.",
        "Typography: clean, modern sans-serif, high contrast, readable at small sizes.",
        "Place the title in a safe area (not covering the main subject).",
        styleHint ? `Style hint: ${styleHint}` : "",
        `Title concept: ${title}`,
        category ? `Category: ${category}` : "",
        intro ? `Intro: ${intro}` : "",
        headings.length ? `Outline: ${headings.join(" | ")}` : "",
        keySentences.length ? `Key points: ${keySentences.join(" / ")}` : "",
    ].filter(Boolean).join("\n");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }

    // 3) OpenAI image generálás
    // Megjegyzés: ha nálad más image model név van, itt kell átírni.
    const imgRes = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "gpt-image-1",
            prompt,
            size: imageSize,
        }),
    });

    if (!imgRes.ok) {
        const t = await imgRes.text();
        return NextResponse.json({ error: `OpenAI image error: ${t}` }, { status: 500 });
    }

    const imgJson = await imgRes.json() as any;
    const b64 = imgJson?.data?.[0]?.b64_json;
    if (!b64) {
        return NextResponse.json({ error: "No image returned" }, { status: 500 });
    }

    const buffer = Buffer.from(b64, "base64");

    // 4) feltöltés Supabase Storage
    const bucket = process.env.ARTICLE_IMAGES_BUCKET || "article-images";
    const safeSlug = (article.slug || "article").toString();
    const path = `covers/${safeSlug}-${Date.now()}.png`;

    const { error: upErr } = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: "image/png", upsert: true });

    if (upErr) {
        return NextResponse.json({ error: `Upload error: ${upErr.message}` }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    // 5) DB update
    const { error: uErr } = await supabase
        .from("articles")
        .update({ cover_image_url: publicUrl })
        .eq("id", article.id);

    if (uErr) {
        return NextResponse.json({ error: `DB update error: ${uErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, cover_image_url: publicUrl });
}
