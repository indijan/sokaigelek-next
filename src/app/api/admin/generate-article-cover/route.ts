import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabaseServer";
import { uploadVercelBlob } from "@/lib/blobStorage";

export const runtime = "nodejs";

type Body = {
    articleId: string;
    title?: string;
    excerpt?: string;
    contentHtml?: string;
    categorySlug?: string;
    slug?: string;
};

type OpenAiImageResponse = {
    data?: Array<{
        b64_json?: string;
    }>;
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

function stableHash(input: string): number {
    let h = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        h ^= input.charCodeAt(i);
        h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return Math.abs(h >>> 0);
}

function detectVisualTheme(input: {
    title: string;
    category: string;
    headings: string[];
    keySentences: string[];
}): "nutrition" | "movement" | "sleep" | "heart" | "brain" | "hydration" | "swimming" | "generic" {
    const hay = [
        input.title,
        input.category,
        input.headings.join(" "),
        input.keySentences.join(" "),
    ].join(" ").toLowerCase();

    const has = (arr: string[]) => arr.some((k) => hay.includes(k));
    if (has(["uszas", "úszás", "uszni", "úszni", "uszod", "uszoda", "medence", "swim", "swimmer"])) return "swimming";
    if (has(["hidrat", "elektrolit", "folyadek", "folyadék", "dehidr"])) return "hydration";
    if (has(["taplalkoz", "táplálkoz", "etrend", "étrend", "zoldseg", "zöldség", "gyumolcs", "gyümölcs", "feherje", "fehérje"])) return "nutrition";
    if (has(["seta", "séta", "mozgas", "mozgás", "edzes", "edzés", "sport", "lepesszam", "lépésszám"])) return "movement";
    if (has(["alvas", "alvás", "inszomnia", "cirkadian"])) return "sleep";
    if (has(["sziv", "szív", "er", "érrendszer", "vernyomas", "vérnyomás", "koleszterin"])) return "heart";
    if (has(["agy", "memoria", "memória", "kognitiv", "kognitív", "koncentracio", "koncentráció"])) return "brain";
    return "generic";
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

    const title = String(body.title || article.title || "").trim();
    const intro = String(body.excerpt || article.excerpt || "").trim().slice(0, 260);
    const category = String(body.categorySlug || article.category_slug || "").trim();
    const bodyHtml = String(body.contentHtml || article.content_html || "");
    const headings = extractHeadings(bodyHtml);
    const bodyText = stripHtml(bodyHtml);
    const keySentences = pickKeySentences(bodyText, 3);

    const imageSize = process.env.ARTICLE_COVER_IMAGE_SIZE || "1536x1024";
    const styleHint = process.env.ARTICLE_COVER_STYLE_HINT || "";
    const theme = detectVisualTheme({ title, category, headings, keySentences });
    const creativeVariantsByTheme: Record<string, readonly string[]> = {
        nutrition: [
            "Visual direction: premium nutrition still-life with relevant whole foods from the article context, no random props.",
            "Visual direction: close-up hands preparing a healthy meal, natural kitchen light, no face.",
        ],
        movement: [
            "Visual direction: dynamic walking/running scene outdoors, clear movement cues, optimistic energy.",
            "Visual direction: athletic shoes and walking path composition, strong forward motion, no food objects.",
        ],
        swimming: [
            "Visual direction: swimming-focused scene in or beside a pool, unmistakable water context, no running cues.",
            "Visual direction: swimmer in motion with lane lines or rippling pool water, editorial health cover style.",
        ],
        sleep: [
            "Visual direction: calm bedroom atmosphere, evening light, restful composition, no food/water props.",
            "Visual direction: abstract moon/circadian concept with soft gradients, minimal scene.",
        ],
        heart: [
            "Visual direction: heart-health concept with subtle cardio motifs and active lifestyle context.",
            "Visual direction: abstract red/blue vascular-inspired forms, modern medical editorial style.",
        ],
        brain: [
            "Visual direction: brain-health concept, walking + cognition visual metaphor, focus and clarity.",
            "Visual direction: abstract neural/cognitive motif, clean high-contrast editorial composition.",
        ],
        hydration: [
            "Visual direction: hydration-focused scene with clean water, electrolytes context, active lifestyle cues.",
            "Visual direction: glass/water droplet macro with athletic context, crisp fresh palette.",
        ],
        generic: [
            "Visual direction: conceptual health illustration with soft geometric forms, vibrant but elegant palette.",
            "Visual direction: home wellness environment, calm tidy interior, warm daylight, no stress cues.",
        ],
    };
    const creativeVariants = creativeVariantsByTheme[theme] || creativeVariantsByTheme.generic;
    const variantIdx = stableHash(`${title}|${category}`) % creativeVariants.length;
    const chosenVariant = creativeVariants[variantIdx];
    const negativeByTheme: Record<string, string> = {
        movement: "Hard negative: do not show vegetables, meal prep, fruit bowls, or glasses of water as main subject.",
        swimming: "Hard negative: do not show running, jogging, walking trails, bicycles, or gym equipment. Water or pool context must be visible.",
        brain: "Hard negative: avoid generic kitchen still-life, random vegetables, and unrelated hydration props.",
        sleep: "Hard negative: avoid food imagery and fitness action shots.",
        heart: "Hard negative: avoid unrelated kitchen still-life and random pantry objects.",
        generic: "",
        nutrition: "",
        hydration: "",
    };

    // 2) prompt (FB engagement friendly, still clean)
    const prompt = [
        "Create a clean, modern blog cover image optimized for Facebook feed engagement.",
        "Base the image on the CURRENT article version only. Ignore any earlier drafts or alternative topic directions.",
        "Composition: clear subject, bold focal point, high contrast, inviting mood.",
        "Style: premium, soft lighting, subtle gradients, no clutter.",
        "Theme: health & wellbeing education (Hungarian audience).",
        "Avoid repetition: vary color palettes, subjects, and composition across images.",
        "Do NOT always use portraits. Prefer diverse compositions and often avoid faces.",
        "If a person appears: varied ages and genders, friendly neutral expression, never worried/stressed look.",
        "People are optional. Use objects, hands, silhouettes, or abstract/still-life scenes when fitting.",
        "If the topic is anatomy (heart, blood vessels, organs), use stylized or abstract visuals, not realistic organs.",
        "Do not include any text, letters, or typography on the image.",
        `Primary theme: ${theme}. The image must match the title meaning directly.`,
        chosenVariant,
        negativeByTheme[theme] || "",
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
    const payload = JSON.stringify({
        model: "gpt-image-1",
        prompt,
        size: imageSize,
    });

    let imgRes: Response | null = null;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        imgRes = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: payload,
        });
        if (imgRes.ok) break;
        if (attempt < maxAttempts) {
            const delayMs = 500 * Math.pow(2, attempt - 1);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    if (!imgRes || !imgRes.ok) {
        const t = imgRes ? await imgRes.text() : "no_response";
        return NextResponse.json({ error: `OpenAI image error: ${t}` }, { status: 500 });
    }

    const imgJson = (await imgRes.json()) as OpenAiImageResponse;
    const b64 = imgJson?.data?.[0]?.b64_json;
    if (!b64) {
        return NextResponse.json({ error: "No image returned" }, { status: 500 });
    }

    const buffer = Buffer.from(b64, "base64");

    // 4) feltöltés Supabase Storage vagy Vercel Blob
    const bucket = process.env.ARTICLE_IMAGES_BUCKET || "article-images";
    const safeSlug = String(body.slug || article.slug || "article")
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "article";
    const path = `covers/${safeSlug}-${Date.now()}.png`;

    const blobUrl = await uploadVercelBlob(path, buffer, "image/png");
    let publicUrl = "";
    let coverImagePath: string | null = null;

    if (blobUrl) {
        publicUrl = blobUrl;
    } else {
        const { error: upErr } = await supabase.storage
            .from(bucket)
            .upload(path, buffer, { contentType: "image/png", upsert: true });

        if (upErr) {
            return NextResponse.json({ error: `Upload error: ${upErr.message}` }, { status: 500 });
        }

        const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
        publicUrl = pub.publicUrl;
        coverImagePath = path;
    }

    // 5) DB update
    const { error: uErr } = await supabase
        .from("articles")
        .update({ cover_image_url: publicUrl, cover_image_path: coverImagePath })
        .eq("id", article.id);

    if (uErr) {
        return NextResponse.json({ error: `DB update error: ${uErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, cover_image_url: publicUrl });
}
