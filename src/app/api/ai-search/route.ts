import { NextResponse } from "next/server";
export const runtime = "nodejs";

function normalizeHu(s: string) {
    return (s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ß/g, "ss")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function stripHtml(html: string) {
    return (html || "")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function queryTokens(q: string) {
    const base = normalizeHu(q);
    const tokens = base.split(" ").filter(Boolean);

    const stop = new Set([
        "a","az","es","és","de","hogy","nem","van","vagy","ami","mint","ha","is","egy","egyik","mert","csak",
        "vagyok","vagyunk","leszek","lesz","szeretnek","szeretnem","kell","kene","kellene",
        "nagyon","picit","kicsit","most","mar",
    ]);

    return tokens.filter((t) => t.length >= 3 && !stop.has(t));
}

// Bővíthető később
const SYNONYMS: Record<string, string[]> = {
    torokfajas: ["torok", "mandula", "mandulagyulladas", "garat", "kohoges"],
    fejfajas: ["migren", "homlok"],
    immunrendszer: ["immun", "vedekezokepesseg", "megfazas", "influenza"],
    gyulladas: ["gyulladasok", "gyulladascsokkentes", "izuletek"],
};

function stemVariants(token: string) {
    const t = normalizeHu(token);
    const out = new Set<string>();
    if (!t) return [];

    out.add(t);

    const suffixes = [
        "ok","ek","ak","k",
        "edet","odat","adat","emet","omat","amat","ed","od","ad","em","om","am","unk","etek","otok","atok",
        "ban","ben","nak","nek","val","vel","rol","tol","hoz","hez","hoz","ra","re","ba","be","on","en","n",
        "heted","het","hato","heto",
        "t","ot","et","at","al","el","ul","ig","s","os","es","as",
    ];

    for (const suf of suffixes) {
        if (t.endsWith(suf) && t.length > suf.length + 2) out.add(t.slice(0, -suf.length));
    }

    if (t.endsWith("es") && t.length > 5) out.add(t.slice(0, -2));
    if (t.endsWith("os") && t.length > 5) out.add(t.slice(0, -2));
    if (t.endsWith("s") && t.length > 5) out.add(t.slice(0, -1));

    for (const v of Array.from(out)) {
        if (v.endsWith("e") && v.length > 4) out.add(v.slice(0, -1));
        if (v.endsWith("a") && v.length > 4) out.add(v.slice(0, -1));
    }

    for (const v of Array.from(out)) {
        if (v.length >= 6) out.add(v.slice(0, v.length - 1));
    }

    return Array.from(out).filter((x) => x.length >= 3);
}

function expandTokens(tokens: string[]) {
    const out = new Set<string>();

    for (const raw of tokens) {
        for (const v of stemVariants(raw)) out.add(v);

        const key = normalizeHu(raw);
        const syns = SYNONYMS[key];
        if (syns) syns.forEach((x) => stemVariants(x).forEach((v) => out.add(v)));

        for (const stem of stemVariants(raw)) {
            const syns2 = SYNONYMS[stem];
            if (syns2) syns2.forEach((x) => stemVariants(x).forEach((v) => out.add(v)));
        }
    }

    return Array.from(out);
}

function tokenMatch(haystackRaw: string, tokenVariant: string) {
    const h = normalizeHu(haystackRaw);
    const v = normalizeHu(tokenVariant);
    if (!v) return false;

    if (h.includes(v)) return true;

    const hayTokens = h.split(" ").filter(Boolean);

    // prefix match (energiaszint -> energiaszintedet)
    if (hayTokens.some((ht) => ht.startsWith(v) || (v.length >= 6 && v.startsWith(ht)))) return true;

    // közös prefix match (növelése -> növelheted)
    const min = 5;
    for (const ht of hayTokens) {
        let i = 0;
        const max = Math.min(ht.length, v.length);
        while (i < max && ht[i] === v[i]) i++;
        if (i >= min) return true;
    }

    if (fuzzyTokenMatch(v, hayTokens)) return true;

    return false;
}

function fuzzyTokenMatch(token: string, hayTokens: string[]) {
    if (token.length < 4) return false;

    const maxDist = token.length <= 6 ? 1 : 2;
    for (const ht of hayTokens) {
        if (Math.abs(ht.length - token.length) > maxDist) continue;
        if (levenshteinWithin(token, ht, maxDist)) return true;
    }
    return false;
}

function levenshteinWithin(a: string, b: string, max: number) {
    const alen = a.length;
    const blen = b.length;
    if (Math.abs(alen - blen) > max) return false;

    const prev = new Array(blen + 1).fill(0);
    const curr = new Array(blen + 1).fill(0);

    for (let j = 0; j <= blen; j++) prev[j] = j;

    for (let i = 1; i <= alen; i++) {
        curr[0] = i;
        let rowMin = curr[0];
        const ai = a.charCodeAt(i - 1);

        for (let j = 1; j <= blen; j++) {
            const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
            const val = Math.min(
                prev[j] + 1,
                curr[j - 1] + 1,
                prev[j - 1] + cost
            );
            curr[j] = val;
            if (val < rowMin) rowMin = val;
        }

        if (rowMin > max) return false;
        for (let j = 0; j <= blen; j++) prev[j] = curr[j];
    }

    return prev[blen] <= max;
}

function matchesQuery(haystackRaw: string, qRaw: string) {
    const h = normalizeHu(haystackRaw);
    const baseTokens = queryTokens(qRaw);

    if (baseTokens.length === 0) return h.includes(normalizeHu(qRaw));

    let matched = 0;
    for (const base of baseTokens) {
        const variants = expandTokens([base]);
        if (variants.some((v) => tokenMatch(haystackRaw, v))) matched++;
    }

    return matched >= Math.min(2, baseTokens.length);
}

function scoreMatch(haystackRaw: string, qRaw: string) {
    const h = normalizeHu(haystackRaw);
    const baseTokens = queryTokens(qRaw);
    if (baseTokens.length === 0) return h.includes(normalizeHu(qRaw)) ? 1 : 0;

    let score = 0;
    for (const base of baseTokens) {
        const variants = expandTokens([base]);

        if (tokenMatch(haystackRaw, base)) {
            score += 3;
            continue;
        }
        if (variants.some((v) => tokenMatch(haystackRaw, v))) {
            score += 2;
            continue;
        }
    }

    if (h.includes(normalizeHu(qRaw))) score += 2;
    return score;
}

function pickTitle(row: any) {
    return (
        row?.title ||
        row?.name ||
        row?.post_title ||
        row?.product_title ||
        ""
    );
}

function productHaystack(p: any) {
    const parts = [
        p?.name, p?.title, p?.post_title, p?.product_title,
        p?.short_description, p?.excerpt, p?.post_excerpt,
        p?.description, p?.content, p?.post_content,
    ];
    return parts.filter((x) => typeof x === "string" && x.trim()).join("\n");
}

function articleHaystack(a: any) {
    const parts = [
        a?.title, a?.post_title,
        a?.intro, a?.excerpt, a?.post_excerpt,
        a?.content, a?.post_content,
    ];
    return parts.filter((x) => typeof x === "string" && x.trim()).join("\n");
}

function excerptFrom(htmlOrText: string, max = 220) {
    const txt = stripHtml(htmlOrText || "");
    if (txt.length <= max) return txt;
    return txt.slice(0, max).replace(/\s+\S*$/, "").trim() + "…";
}

function snippetFrom(htmlOrText: string, max = 1400) {
    const txt = stripHtml(htmlOrText || "");
    if (txt.length <= max) return txt;
    return txt.slice(0, max).replace(/\s+\S*$/, "").trim() + "…";
}

function candidateQueries(q: string) {
    const qLower = normalizeHu(q);

    const includesAny = (needles: string[]) => needles.some((n) => qLower.includes(normalizeHu(n)));

    if (
        includesAny([
            "éhség", "ehseg", "éhes", "ehe", "étvágy", "etvagy",
            "nassol", "falás", "falas", "cukoréhs", "cukorehs",
        ])
    ) {
        return ["éhség", "étvágy", "nassolás", "cukoréhség", "fogyás", "testsúly"];
    }

    if (
        includesAny([
            "fogy", "fogyn", "súly", "suly", "diét", "diet", "kalória", "kaloria",
        ])
    ) {
        return ["fogyás", "testsúly", "diéta", "anyagcsere"];
    }

    if (includesAny(["stressz", "stress", "stresszes"])) {
        return ["stressz", "stress", "feszültség", "szorongás", "kimerültség", "kortizol"];
    }

    if (includesAny(["fejf", "migr", "fejem"])) {
        return ["fejfájás", "migrén"];
    }

    if (includesAny(["alv", "nem alszom", "rosszul alszom"])) {
        return ["alvás", "alvászavar", "pihenés"];
    }

    if (includesAny(["fárad", "farad", "kimer", "energia"])) {
        return ["fáradtság", "energia", "kimerültség", "vitalitás"];
    }

    const parts = q.trim().split(/\s+/).filter(Boolean);
    if (parts.length > 8) {
        return [q, "stressz", "alvás", "fáradtság", "fejfájás", "fogyás", "éhség"];
    }

    return [q];
}

export async function GET(req: Request) {
    const url = new URL(req.url);
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://sokaigelek.hu").replace(/\/$/, "");

    function fixMojibake(s: string) {
        // Sometimes an upstream client sends UTF-8 bytes interpreted as latin1 (e.g. "alvÃ¡szavar").
        // Heuristic: if it contains typical mojibake markers, attempt a latin1->utf8 recovery.
        if (!s) return s;
        if (!/[ÃÂâ€]/.test(s)) return s;
        try {
            // Node runtime is available in Next route handlers.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { Buffer } = require("buffer");
            return Buffer.from(s, "latin1").toString("utf8");
        } catch {
            return s;
        }
    }

    function absUrl(path: string | null) {
        if (!path) return null;
        if (path.startsWith("http://") || path.startsWith("https://")) return path;
        return `${siteUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    }

    const qRaw = fixMojibake((url.searchParams.get("q") || "").trim());
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.min(10, Math.max(1, Number(limitRaw || "5") || 5));

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!qRaw) {
        return NextResponse.json(
            { ok: true, query: "", limit, results: { articles: [], products: [] } },
            { status: 200 }
        );
    }

    if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json(
            { ok: false, error: "Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)." },
            { status: 500 }
        );
    }

    try {
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

        const [pRes, aRes] = await Promise.all([
            supabase.from("products").select("*").order("id", { ascending: false }).limit(2000),
            supabase
                .from("articles")
                .select("*")
                .eq("status", "published")
                .order("id", { ascending: false })
                .limit(2000),
        ]);

        if (pRes.error) throw pRes.error;
        if (aRes.error) throw aRes.error;

        const productsRaw = (pRes.data || []) as any[];
        const articlesRaw = (aRes.data || []) as any[];

        const runSearch = (query: string) => {
            const scoredArticles = articlesRaw
                .map((a) => {
                    const hay = articleHaystack(a);
                    const score = scoreMatch(hay, query);
                    const title = pickTitle(a);
                    const titleBonus = normalizeHu(title).includes(normalizeHu(query)) ? 5 : 0;
                    return { a, hay, score: score + titleBonus };
                })
                .filter((x) => matchesQuery(x.hay, query) && x.score >= (queryTokens(query).length >= 2 ? 3 : 1))
                .sort((x, y) => y.score - x.score)
                .slice(0, limit)
                .map(({ a, score }) => ({
                    type: "post" as const,
                    id: a.id,
                    title: a.title || a.post_title || "",
                    slug: a.slug,
                    score,
                    path: a.slug ? `/cikkek/${a.slug}` : null,
                    url: a.slug ? absUrl(`/cikkek/${a.slug}`) : null,
                    image_url: a.featured_image_url || a.cover_url || null,
                    excerpt: excerptFrom(a.excerpt || a.intro || a.content || a.post_content || "", 220),
                    snippet: snippetFrom(a.excerpt || a.intro || a.content || a.post_content || "", 1400),
                }));

            const scoredProducts = productsRaw
                .map((p) => {
                    const hay = productHaystack(p);
                    const score = scoreMatch(hay, query);
                    const title = pickTitle(p);
                    const titleBonus = normalizeHu(title).includes(normalizeHu(query)) ? 5 : 0;
                    return { p, hay, score: score + titleBonus };
                })
                .filter((x) => matchesQuery(x.hay, query) && x.score >= (queryTokens(query).length >= 2 ? 3 : 1))
                .sort((x, y) => y.score - x.score)
                .slice(0, limit)
                .map(({ p, score }) => ({
                    type: "product" as const,
                    id: p.id,
                    title: pickTitle(p),
                    slug: p.slug,
                    score,
                    path: p.slug ? `/termek/${p.slug}` : null,
                    url: p.slug ? absUrl(`/termek/${p.slug}`) : null,
                    image_url: p.featured_image_url || p.image_url || null,
                    price: p.price ?? null,
                    regular_price: p.regular_price ?? null,
                    excerpt: excerptFrom(
                        p.excerpt || p.post_excerpt || p.short_description || p.description || p.post_content || "",
                        220
                    ),
                    snippet: snippetFrom(
                        p.post_excerpt || p.short_description || p.excerpt || p.description || p.post_content || "",
                        1400
                    ),
                }));

            return { scoredArticles, scoredProducts };
        };

        let usedQuery = qRaw;
        let { scoredArticles, scoredProducts } = runSearch(qRaw);

        if (scoredArticles.length === 0 && scoredProducts.length === 0) {
            for (const cand of candidateQueries(qRaw)) {
                const trimmed = cand.trim();
                if (!trimmed) continue;
                const res = runSearch(trimmed);
                if (res.scoredArticles.length > 0 || res.scoredProducts.length > 0) {
                    usedQuery = trimmed;
                    scoredArticles = res.scoredArticles;
                    scoredProducts = res.scoredProducts;
                    break;
                }
            }
        }

        const merged = [...scoredProducts, ...scoredArticles].slice(0, limit);

        return NextResponse.json(
            {
                query: usedQuery,
                count: merged.length,
                results: merged.map((item) => ({
                    id: item.id,
                    type: item.type,
                    title: item.title,
                    url: item.url,
                    snippet: item.snippet,
                })),
            },
            { status: 200 }
        );
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: e?.message || "Search failed." },
            { status: 500 }
        );
    }
}
