import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import ArticleImageUploader from "@/components/admin/ArticleImageUploader";
import { slugifyHu } from "@/lib/slugifyHu";
import GenerateArticleCoverButton from "@/components/admin/GenerateArticleCoverButton";
import HtmlEditor from "@/components/admin/HtmlEditor";

type Props = {
    params: Promise<{ slug: string }>;
    searchParams?: Promise<{ delete?: string | string[] }>;
};

function safeJsonParseSlugs(text: string): string[] {
    try {
        const obj = JSON.parse(text);
        if (Array.isArray(obj?.slugs)) {
            return obj.slugs.map((s: any) => String(s)).filter(Boolean);
        }
        return [];
    } catch {
        return [];
    }
}

function stripProductMarkers(html: string) {
    // eltávolít minden korábbi beágyazott termék jelölőt
    return String(html || "").replace(/<!--\s*PRODUCT:[a-z0-9-]+\s*-->/gi, "");
}

function safeJsonParsePlacements(text: string): Array<{ slug: string; afterParagraph: number }> {
    try {
        const obj = JSON.parse(text);
        const arr = Array.isArray(obj?.placements) ? obj.placements : [];
        return arr
            .map((p: any) => ({
                slug: String(p?.slug || "").toLowerCase().trim(),
                afterParagraph: Number(p?.afterParagraph),
            }))
            .filter((p) => p.slug && Number.isFinite(p.afterParagraph));
    } catch {
        return [];
    }
}

function getInsertPoints(html: string): number[] {
    const s = String(html || "");

    // 1) Preferált: </p> utáni pontok
    const closeP = "</p>";
    const pointsP: number[] = [];
    let from = 0;
    while (true) {
        const idx = s.indexOf(closeP, from);
        if (idx === -1) break;
        pointsP.push(idx + closeP.length);
        from = idx + closeP.length;
    }
    if (pointsP.length) return pointsP;

    // 2) Alternatív: alcímek / felsorolás / sortörések
    const patterns = ["</h2>", "</h3>", "</li>", "<br>", "<br/>", "<br />"];
    const pointsAlt: number[] = [];
    for (const pat of patterns) {
        let f = 0;
        while (true) {
            const idx = s.indexOf(pat, f);
            if (idx === -1) break;
            pointsAlt.push(idx + pat.length);
            f = idx + pat.length;
        }
    }
    pointsAlt.sort((a, b) => a - b);

    // dedupe közeli pontok
    const dedup: number[] = [];
    for (const p of pointsAlt) {
        if (!dedup.length || p - dedup[dedup.length - 1] > 30) dedup.push(p);
    }
    if (dedup.length) return dedup;

    // 3) Utolsó mentsvár: szintetikus pontok a szövegben (25/55/80%)
    const L = s.length;
    if (L < 200) return [];
    return [Math.floor(L * 0.25), Math.floor(L * 0.55), Math.floor(L * 0.8)];
}

function insertMarkerAfterParagraph(html: string, afterParagraphIndex: number, marker: string) {
    // afterParagraphIndex: 0 = első beszúrási pont után, 1 = második után, stb.
    const s = String(html || "");
    const points = getInsertPoints(s);

    if (!points.length) {
        return s + "\n" + marker;
    }

    const idx = points[Math.min(Math.max(0, afterParagraphIndex), points.length - 1)];
    return s.slice(0, idx) + "\n" + marker + "\n" + s.slice(idx);
}

export default async function AdminArticleEditPage({ params, searchParams }: Props) {
    const cookieStore = await cookies();
    const ok = cookieStore.get("admin_ok")?.value === "1";
    if (!ok) redirect("/admin");

    const { slug } = await params;
    const sp = searchParams ? await searchParams : undefined;
    const delParam = sp?.delete;
    const pendingDelete = Array.isArray(delParam) ? delParam[0] : delParam;
    const showDeleteConfirm = pendingDelete === "1" || pendingDelete === "true";

    const { data: article, error } = await supabaseServer
        .from("articles")
        .select("*")
        .eq("slug", slug)
        .single();

    if (error || !article) {
        return (
            <main className="max-w-3xl mx-auto px-4 py-10 space-y-2">
                <div className="text-red-600 font-semibold">Nem találom a cikket: {slug}</div>
                {error ? (
                    <pre className="text-xs bg-gray-50 border rounded-xl p-3 overflow-auto">
          {JSON.stringify(error, null, 2)}
        </pre>
                ) : null}
            </main>
        );
    }

    const { data: categories } = await supabaseServer
        .from("categories")
        .select("slug, name, sort_order")
        .order("sort_order", { ascending: true });

    // NOTE: we no longer need the products list for manual related-product slugs.
    // (AI placements uses its own query later.)
    await supabaseServer
        .from("products")
        .select("slug")
        .limit(1);

    return (
        <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">Cikk szerkesztése</h1>
                <a
                    className="underline text-sm"
                    href={`/cikkek/${article.slug}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    Megnézem
                </a>
            </div>

            <ArticleImageUploader
                articleId={article.id}
                currentUrl={article.cover_image_url}
            />
            <div className="mt-3">
                <GenerateArticleCoverButton articleId={article.id} />
            </div>
            <form
                className="space-y-4"
                action={async (formData) => {
                    "use server";
                    const id = String(formData.get("id") || "");
                    const title = String(formData.get("title") || "");
                    const excerpt = String(formData.get("excerpt") || "");
                    const content_html = String(formData.get("content_html") || "");
                    const status = String(formData.get("status") || "draft");
                    const category_slug = String(formData.get("category_slug") || "").trim() || null;

                    // 1) slug alap: kézi slug vagy cím alapján
                    const rawSlug = String(formData.get("new_slug") || "").trim();
                    const baseSlug = slugifyHu(rawSlug || title);

                    // ha minden üres, marad a régi
                    let nextSlug = baseSlug || slug;

                    // 2) ütközés kezelése (-2, -3…)
                    if (nextSlug !== slug) {
                        let candidate = nextSlug;
                        let i = 2;

                        while (true) {
                            const { data: existing, error: existsErr } = await supabaseServer
                                .from("articles")
                                .select("id")
                                .eq("slug", candidate)
                                .neq("id", id)
                                .maybeSingle();

                            if (existsErr) {
                                redirect(`/admin/articles/${slug}?err=${encodeURIComponent(existsErr.message)}`);
                            }

                            if (!existing) {
                                nextSlug = candidate;
                                break;
                            }

                            candidate = `${nextSlug}-${i}`;
                            i += 1;
                        }
                    }

                    // published_at logika
                    let published_at = article.published_at;
                    if (status === "published" && !published_at) {
                        published_at = new Date().toISOString();
                    }
                    if (status !== "published") {
                        published_at = null;
                    }

                    await supabaseServer
                        .from("articles")
                        .update({
                            slug: nextSlug,
                            title,
                            excerpt,
                            content_html,
                            status,
                            category_slug,
                            published_at,
                        })
                        .eq("id", id);

                    redirect(`/admin/articles/${nextSlug}`);
                }}
            >
                <input type="hidden" name="id" defaultValue={article.id} />

                <div>
                    <label className="text-sm font-semibold">Slug (URL)</label>
                    <input
                        name="new_slug"
                        defaultValue={article.slug ?? ""}
                        className="w-full border rounded-xl px-3 py-2"
                        placeholder="pl. eros-immunrendszer-lepesrol-lepesre"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Ha üresen hagyod, a Cím alapján automatikusan generáljuk. Magyar ékezetek támogatva.
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        Publikus link: <span className="font-mono">/cikkek/{article.slug}</span>
                    </p>
                </div>

                <div>
                    <label className="text-sm font-semibold">Cím</label>
                    <input
                        name="title"
                        defaultValue={article.title ?? ""}
                        className="w-full border rounded-xl px-3 py-2"
                    />
                </div>

                <div>
                    <label className="text-sm font-semibold">Kategória</label>
                    <select
                        name="category_slug"
                        defaultValue={article.category_slug ?? ""}
                        className="w-full border rounded-xl px-3 py-2"
                    >
                        <option value="">— nincs —</option>
                        {categories?.map((c) => (
                            <option key={c.slug} value={c.slug}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="text-sm font-semibold">Állapot</label>
                    <select
                        name="status"
                        defaultValue={article.status ?? "draft"}
                        className="w-full border rounded-xl px-3 py-2"
                    >
                        <option value="draft">draft</option>
                        <option value="published">published</option>
                    </select>
                </div>

                <div>
                    <label className="text-sm font-semibold">Kivonat / Intro</label>
                    <textarea
                        name="excerpt"
                        defaultValue={article.excerpt ?? ""}
                        className="w-full border rounded-xl px-3 py-2 h-24"
                    />
                </div>

                <div>
                    <label className="text-sm font-semibold">Tartalom</label>
                    <div className="text-xs text-gray-500 mt-1">
                        Itt szerkesztheted a cikket formázva. Mentéskor automatikusan HTML-ként kerül elmentésre.
                    </div>
                    <div className="mt-2">
                        <HtmlEditor name="content_html" initialHtml={article.content_html ?? ""} />
                    </div>
                </div>


                <button className="btn" type="submit">
                    Mentés
                </button>
            </form>

            <div className="border rounded-2xl p-4">
                {!showDeleteConfirm ? (
                    <a className="text-red-700 underline text-sm" href={`/admin/articles/${article.slug}?delete=1`}>
                        Cikk törlése
                    </a>
                ) : (
                    <div className="space-y-3">
                        <div className="font-semibold text-red-700">Biztosan törlöd ezt a cikket?</div>
                        <div className="text-sm text-gray-600">Ez végleges, és a cikk eltűnik a weboldalról is.</div>
                        <div className="flex items-center gap-3 flex-wrap">
                            <form
                                action={async () => {
                                    "use server";
                                    await supabaseServer.from("articles").delete().eq("id", article.id);
                                    redirect("/admin/articles");
                                }}
                            >
                                <button className="bg-red-600 text-white rounded-xl px-4 py-2 text-sm">
                                    Igen, törlés
                                </button>
                            </form>
                            <a className="text-sm underline" href={`/admin/articles/${article.slug}`}>
                                Mégse
                            </a>
                        </div>
                    </div>
                )}
            </div>
            <form
                action={async () => {
                    "use server";

                    const apiKey = process.env.OPENAI_API_KEY;
                    if (!apiKey) {
                        redirect(
                            `/admin/articles/${article.slug}?err=${encodeURIComponent(
                                "Hiányzik az OPENAI_API_KEY (.env.local)"
                            )}`
                        );
                    }

                    // friss adatok
                    const { data: a, error: aErr } = await supabaseServer
                        .from("articles")
                        .select("id, slug, title, excerpt, content_html, related_product_slugs")
                        .eq("id", article.id)
                        .single();

                    if (aErr || !a) {
                        redirect(
                            `/admin/articles/${article.slug}?err=${encodeURIComponent(
                                "Nem találom a cikket AI elhelyezéshez"
                            )}`
                        );
                    }

                    const html0 = String(a.content_html || "");
                    const html = stripProductMarkers(html0);
                    const paragraphCount = getInsertPoints(html).length;

                    const { data: products, error: pErr } = await supabaseServer
                        .from("products")
                        .select("slug, name")
                        .order("name", { ascending: true });

                    if (pErr || !products) {
                        redirect(
                            `/admin/articles/${a.slug}?err=${encodeURIComponent(
                                "Nem találom a termékeket AI elhelyezéshez"
                            )}`
                        );
                    }

                    const allowed = new Set(products.map((p) => p.slug));

                    // alap: a related_product_slugs-ból dolgozunk (ha üres, az AI így is javasolhat a teljes listából)
                    const related = Array.isArray(a.related_product_slugs) ? a.related_product_slugs : [];
                    const relatedFiltered = related.filter((s: any) => allowed.has(String(s)));

                    const productList = products.map((p) => `${p.slug} — ${p.name}`).join("\n");
                    const preferred = relatedFiltered.length ? relatedFiltered.join(", ") : "(nincs megadva)";

                    const prompt = `
A feladatod: helyezd el 0-5 termék ajánlót a cikk HTML tartalmában LOGIKUS pontokra.

A megjelenítés jelölője: <!--PRODUCT:slug-->

Bemenet:
- Cikk címe: ${a.title || ""}
- Kivonat: ${a.excerpt || ""}
- HTML: ${html}
- Bekezdések száma (</p>): ${paragraphCount}

Termékek (csak ebből választhatsz):
${productList}

Preferált slugok (ha releváns): ${preferred}

Kimenet: CSAK egy JSON objektum legyen:
{"placements":[{"slug":"duolife-aloes","afterParagraph":1}]}

Szabályok:
- afterParagraph 0 = első </p> után, 1 = második </p> után, stb.
- 1–3 placement az ideális (csak akkor adj 4-et, ha nagyon hosszú a cikk)
- NE tedd mindet a végére: a cél az elosztás (korai / közép / késői)
- Ne rakj két ajánlót egymás után: legalább 2 bekezdés távolság legyen köztük
- Lehetőleg ne az utolsó bekezdés után legyen (kerüld a zárást)
- csak létező slugok
- ha nincs jó hely: {"placements":[]}
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
                        redirect(
                            `/admin/articles/${a.slug}?err=${encodeURIComponent(
                                "OpenAI hiba (elhelyezés): " + t
                            )}`
                        );
                    }

                    const data = await r.json();
                    const text =
                        data?.output_text ||
                        data?.output
                            ?.map((o: any) =>
                                o?.content?.map((c: any) => c?.text).join("") || ""
                            )
                            .join("") ||
                        "";

                    let placements = safeJsonParsePlacements(text)
                        .filter((p) => allowed.has(p.slug))
                        .slice(0, 5);

                    // Ha túl rövid a cikk, nincs értelme elhelyezni
                    if (paragraphCount < 3) {
                        await supabaseServer
                            .from("articles")
                            .update({ content_html: html })
                            .eq("id", a.id);

                        redirect(`/admin/articles/${a.slug}`);
                    }

                    // 1) clamp + duplikációk kiszűrése
                    const maxInsert = Math.max(0, paragraphCount - 2); // kerüljük a legvégét
                    const bySlug = new Map<string, number>();
                    for (const p of placements) {
                        const idx = Math.max(0, Math.min(maxInsert, Math.floor(p.afterParagraph)));
                        bySlug.set(p.slug, idx);
                    }
                    let cleaned = Array.from(bySlug.entries()).map(([slug, afterParagraph]) => ({
                        slug,
                        afterParagraph,
                    }));

                    // 2) ideális mennyiség: 1–3 (nagyon hosszú cikknél max 4)
                    const idealMax = paragraphCount >= 12 ? 4 : 3;
                    cleaned = cleaned.slice(0, idealMax);

                    // 3) ha a végére pakolja vagy összecsomósítja, elosztjuk determinisztikusan
                    const tooEndHeavy = cleaned.length > 0 && cleaned.every((p) => p.afterParagraph >= maxInsert - 1);
                    const asc = [...cleaned].sort((a, b) => a.afterParagraph - b.afterParagraph);
                    let tooClustered = false;
                    for (let i = 1; i < asc.length; i++) {
                        if (asc[i].afterParagraph - asc[i - 1].afterParagraph < 2) {
                            tooClustered = true;
                            break;
                        }
                    }

                    if (tooEndHeavy || tooClustered) {
                        const n = cleaned.length;
                        const targets: number[] = [];

                        // célpontok a cikkben: (i+1)/(n+1) arány szerint (kb. 25/50/75)
                        for (let i = 0; i < n; i++) {
                            const frac = (i + 1) / (n + 1);
                            targets.push(Math.max(0, Math.min(maxInsert, Math.floor(frac * maxInsert))));
                        }

                        // spacing biztosítása (min 2 bekezdés)
                        for (let i = 1; i < targets.length; i++) {
                            if (targets[i] - targets[i - 1] < 2) targets[i] = Math.min(maxInsert, targets[i - 1] + 2);
                        }

                        // ha túlfutna a végén, visszatoljuk balra
                        for (let i = targets.length - 1; i >= 1; i--) {
                            if (targets[i] > maxInsert) targets[i] = maxInsert;
                            if (targets[i] - targets[i - 1] < 2) targets[i - 1] = Math.max(0, targets[i] - 2);
                        }

                        cleaned = cleaned.map((p, i) => ({
                            slug: p.slug,
                            afterParagraph: targets[i] ?? p.afterParagraph,
                        }));
                    }

                    // stabil beszúrás: hátulról előre, hogy a bekezdés indexek ne csússzanak
                    cleaned = cleaned.sort((a, b) => b.afterParagraph - a.afterParagraph);

                    let nextHtml = html;
                    for (const p of cleaned) {
                        const marker = `<!--PRODUCT:${p.slug}-->`;
                        nextHtml = insertMarkerAfterParagraph(nextHtml, p.afterParagraph, marker);
                    }

                    await supabaseServer
                        .from("articles")
                        .update({ content_html: nextHtml })
                        .eq("id", a.id);

                    redirect(`/admin/articles/${a.slug}`);
                }}
            >
                <div className="flex items-center justify-between gap-3 flex-wrap border rounded-2xl p-4 bg-gray-50">
                    <div className="space-y-1">
                        <div className="font-semibold">AI termék elhelyezés</div>
                        <div className="text-sm text-gray-600">
                            A cikk HTML-jébe beszúrja a jelölőket ({"<!--PRODUCT:slug-->"}) logikus helyekre.
                        </div>
                    </div>
                    <button className="bg-black text-white rounded-xl px-4 py-2 text-sm">
                        AI: termékek elhelyezése a szövegben
                    </button>
                </div>
            </form>

        </main>
    );
}