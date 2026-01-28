import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import ArticleImageUploader from "@/components/admin/ArticleImageUploader";
import { slugifyHu } from "@/lib/slugifyHu";
import GenerateArticleCoverButton from "@/components/admin/GenerateArticleCoverButton";
import HtmlEditor from "@/components/admin/HtmlEditor";
import FactCheckActions from "@/components/admin/FactCheckActions";

type Props = {
    params: Promise<{ slug: string }>;
    searchParams?: Promise<{ delete?: string | string[]; err?: string | string[]; ok?: string | string[] }>;
};

function safeJsonParseSlugs(text: string): string[] | null {
    try {
        const obj = extractJsonObject(text);
        if (!obj) return null;
        if (Array.isArray(obj?.slugs)) {
            return obj.slugs.map((s: any) => String(s)).filter(Boolean);
        }
        return [];
    } catch {
        return null;
    }
}

function stripProductMarkers(html: string) {
    // eltávolít minden korábbi beágyazott termék jelölőt
    return String(html || "").replace(/<!--\s*PRODUCT:[a-z0-9-]+\s*-->/gi, "");
}

function safeJsonParsePlacements(text: string): Array<{ slug: string; afterParagraph: number }> | null {
    try {
        const obj = extractJsonObject(text);
        if (!obj) return null;
        const arr = Array.isArray(obj?.placements)
            ? (obj.placements as Array<{ slug?: unknown; afterParagraph?: unknown }>)
            : [];
        return arr
            .map((p) => ({
                slug: String(p.slug || "").toLowerCase().trim(),
                afterParagraph: Number(p.afterParagraph),
            }))
            .filter(
                (p): p is { slug: string; afterParagraph: number } =>
                    Boolean(p.slug) && Number.isFinite(p.afterParagraph)
            );
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

function extractJsonObject(text: string): any | null {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const slice = text.slice(start, end + 1);
    try {
        return JSON.parse(slice);
    } catch {
        return null;
    }
}

async function openaiJson(prompt: string) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

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
        throw new Error(`OpenAI error: ${t}`);
    }

    const data = await r.json();
    const text =
        data?.output_text ||
        data?.output?.map((o: any) => o?.content?.map((c: any) => c?.text).join("")).join("") ||
        "";

    const parsed = extractJsonObject(text);
    if (!parsed) throw new Error("OpenAI did not return JSON");
    return parsed;
}

function formatIssuesListText(issues: Array<{ claim: string; correction: string; reason?: string; severity?: string }>) {
    if (!issues.length) return "";
    return issues
        .map((i, idx) => {
            const parts = [
                `#${idx + 1}`,
                i.severity ? `(${i.severity})` : "",
                `Állítás: ${i.claim}`,
                `Javítás: ${i.correction}`,
                i.reason ? `Indoklás: ${i.reason}` : "",
            ]
                .filter(Boolean)
                .join(" ");
            return `- ${parts}`;
        })
        .join("\n");
}

function parseIssuesFromLastError(text: string) {
    const raw = String(text || "");
    const idx = raw.toLowerCase().indexOf("fact_check_failed:");
    if (idx === -1) return [];
    const payload = raw.slice(idx + "fact_check_failed:".length).trim();
    const lines = payload.split("\n").map((l) => l.trim()).filter(Boolean);
    const issues: Array<{ claim: string; correction: string; reason?: string; severity?: string }> = [];
    for (const line of lines) {
        if (!line.startsWith("-")) continue;
        const chunk = line.replace(/^-+\s*/, "");
        const claimMatch = chunk.match(/Állítás:\s*([^]+?)\s+Javítás:/i);
        const correctionMatch = chunk.match(/Javítás:\s*([^]+?)(\s+Indoklás:|$)/i);
        const reasonMatch = chunk.match(/Indoklás:\s*([^]+)$/i);
        const severityMatch = chunk.match(/\((low|medium|high)\)/i);
        issues.push({
            claim: claimMatch?.[1]?.trim() || chunk,
            correction: correctionMatch?.[1]?.trim() || "",
            reason: reasonMatch?.[1]?.trim() || "",
            severity: severityMatch?.[1]?.toLowerCase() || "",
        });
    }
    return issues;
}

async function factCheckArticle(article: { title?: string; excerpt?: string; content_html?: string }) {
    const prompt = `
Ellenőrizd a cikkben szereplő TÁRGYI állításokat. Csak akkor jelölj, ha nagy valószínűséggel hibás, félrevezető vagy pontatlan.

Add vissza EGYETLEN JSON objektumban:
{
  "hasIssues": boolean,
  "issues": [
    {
      "claim": "rövid idézet vagy összefoglalás az állításról",
      "correction": "helyes állítás",
      "reason": "rövid indoklás miért hibás",
      "severity": "low|medium|high"
    }
  ]
}
Ha nincs hiba: {"hasIssues": false, "issues": []}

Cikk:
Cím: ${article.title || ""}
Kivonat: ${article.excerpt || ""}
Tartalom (HTML): ${article.content_html || ""}
`.trim();

    const parsed = await openaiJson(prompt);
    const issues = Array.isArray(parsed?.issues) ? parsed.issues : [];
    const cleaned = issues
        .map((i: any) => ({
            claim: String(i?.claim || "").trim(),
            correction: String(i?.correction || "").trim(),
            reason: String(i?.reason || "").trim(),
            severity: String(i?.severity || "").trim(),
        }))
        .filter((i: any) => i.claim && i.correction);

    const hasIssues = Boolean(parsed?.hasIssues) && cleaned.length > 0;
    return { hasIssues, issues: cleaned };
}

async function reviseArticleWithIssues(
    article: { title?: string; excerpt?: string; content_html?: string },
    issues: Array<{ claim: string; correction: string; reason?: string }>
) {
    const issueList = formatIssuesListText(issues);
    const prompt = `
Javítsd a cikket a felsorolt tárgyi hibák alapján. Csak a hibákat javítsd, a stílust, hangnemet, szerkezetet tartsd meg.
Adj vissza EGYETLEN JSON objektumot:
{
  "title": "...",
  "excerpt": "...",
  "content_html": "<p>...</p>..."
}

HIBÁK:
${issueList || "(nincs megadva)"}

EREDTI CIKK:
Cím: ${article.title || ""}
Kivonat: ${article.excerpt || ""}
Tartalom (HTML): ${article.content_html || ""}
`.trim();

    const parsed = await openaiJson(prompt);
    return {
        title: String(parsed?.title || "").trim(),
        excerpt: String(parsed?.excerpt || "").trim(),
        content_html: String(parsed?.content_html || "").trim(),
    };
}

export default async function AdminArticleEditPage({ params, searchParams }: Props) {
    const cookieStore = await cookies();
    const ok = cookieStore.get("admin_ok")?.value === "1";
    if (!ok) redirect("/admin");

    const { slug } = await params;
    const sp = searchParams ? await searchParams : undefined;
    const delParam = sp?.delete;
    const errParam = sp?.err;
    const okParam = sp?.ok;
    const pendingDelete = Array.isArray(delParam) ? delParam[0] : delParam;
    const showDeleteConfirm = pendingDelete === "1" || pendingDelete === "true";
    const errMessage = Array.isArray(errParam) ? errParam[0] : errParam;
    const okMessage = Array.isArray(okParam) ? okParam[0] : okParam;

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

    const { data: lastAutomation } = await supabaseServer
        .from("article_automation_queue")
        .select("last_error, status, used_at, created_at")
        .eq("article_id", article.id)
        .order("used_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    const { data: lastFactCheck } = await supabaseServer
        .from("article_automation_queue")
        .select("last_error, status, used_at, created_at, prompt")
        .eq("article_id", article.id)
        .in("prompt", ["manual fact-check", "manual fact-fix"])
        .order("used_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    const lastFactCheckErrorText = String(lastFactCheck?.last_error || "");
    const factCheckFlag =
        lastFactCheckErrorText.toLowerCase().includes("fact_check_failed") ||
        lastFactCheckErrorText.toLowerCase().includes("fact check");
    const factCheckOk =
        lastFactCheckErrorText.toLowerCase().includes("fact_check_ok") || (!factCheckFlag && Boolean(lastFactCheck));
    const factCheckIssues = parseIssuesFromLastError(lastFactCheck?.last_error || "");
    const lastAutomationAt = lastFactCheck?.used_at || lastFactCheck?.created_at || null;
    const lastAutomationStatus = String(lastFactCheck?.status || "").trim();

    async function runFactCheckAction(
        _prevState: { ok: boolean; message: string },
        formData: FormData
    ): Promise<{ ok: boolean; message: string }> {
        "use server";
        const articleId = String(formData.get("article_id") || "");
        const articleSlug = String(formData.get("article_slug") || "");
        if (!articleId) return { ok: false, message: "Missing article id" };

        const { data: articleForCheck, error: fetchErr } = await supabaseServer
            .from("articles")
            .select("id, slug, title, excerpt, content_html, status, published_at, category_slug")
            .eq("id", articleId)
            .maybeSingle();
        if (fetchErr || !articleForCheck) return { ok: false, message: "Article not found" };

        try {
            const check = await factCheckArticle(articleForCheck);
            const issuesText = formatIssuesListText(check.issues);
            const nowIso = new Date().toISOString();
            const { error: insertErr } = await supabaseServer.from("article_automation_queue").insert({
                article_id: articleForCheck.id,
                prompt: "manual fact-check",
                status: check.hasIssues ? "error" : "done",
                used_at: nowIso,
                last_error: check.hasIssues
                    ? `fact_check_failed: ${issuesText || "- (nincs részletezett hiba)"}`
                    : "fact_check_ok",
                category_slug: (articleForCheck as any).category_slug || null,
                post_to_facebook: false,
                post_to_pinterest: false,
                post_to_x: false,
            });
            if (insertErr) {
                return { ok: false, message: `DB insert error: ${insertErr.message}` };
            }

            if (check.hasIssues) {
                await supabaseServer
                    .from("articles")
                    .update({ status: "draft" })
                    .eq("id", articleForCheck.id);
                revalidatePath(`/admin/articles/${articleForCheck.slug}`);
                return { ok: true, message: "Fact-check hibákat talált, a cikk draft lett." };
            }

            await supabaseServer
                .from("articles")
                .update({
                    status: "published",
                })
                .eq("id", articleForCheck.id);

            revalidatePath(`/admin/articles/${articleForCheck.slug}`);
            return { ok: true, message: "Fact-check rendben, nem talált hibát. A cikk publikálva." };
        } catch (err: any) {
            const nowIso = new Date().toISOString();
            await supabaseServer.from("article_automation_queue").insert({
                article_id: articleId,
                prompt: "manual fact-check",
                status: "error",
                used_at: nowIso,
                last_error: `fact_check_error: ${String(err?.message || "Fact-check error")}`,
                post_to_facebook: false,
                post_to_pinterest: false,
                post_to_x: false,
            });
            revalidatePath(`/admin/articles/${articleSlug || slug}`);
            return { ok: false, message: String(err?.message || "Fact-check error") };
        }
    }

    async function runFactFixAction(
        _prevState: { ok: boolean; message: string },
        formData: FormData
    ): Promise<{ ok: boolean; message: string }> {
        "use server";
        const articleId = String(formData.get("article_id") || "");
        const articleSlug = String(formData.get("article_slug") || "");
        if (!articleId) return { ok: false, message: "Missing article id" };

        const { data: articleForCheck, error: fetchErr } = await supabaseServer
            .from("articles")
            .select("id, slug, title, excerpt, content_html, status, published_at, category_slug")
            .eq("id", articleId)
            .maybeSingle();
        if (fetchErr || !articleForCheck) return { ok: false, message: "Article not found" };

        const issuesFromLast = parseIssuesFromLastError(lastAutomation?.last_error || "");
        let issues = issuesFromLast;
        if (!issues.length) {
            const check = await factCheckArticle(articleForCheck);
            issues = check.issues;
        }

        if (!issues.length) {
            revalidatePath(`/admin/articles/${articleForCheck.slug}`);
            return { ok: true, message: "Nem találtam javítandó hibát." };
        }

        const revised = await reviseArticleWithIssues(articleForCheck, issues);
        if (!revised?.content_html) return { ok: false, message: "Javítás sikertelen (üres tartalom)." };

        const resolvedTitle = revised.title || articleForCheck.title;
        const resolvedExcerpt = revised.excerpt || articleForCheck.excerpt;
        const resolvedHtml = revised.content_html || articleForCheck.content_html;

        await supabaseServer
            .from("articles")
            .update({
                title: resolvedTitle,
                excerpt: resolvedExcerpt,
                content_html: resolvedHtml,
                status: "draft",
            })
            .eq("id", articleForCheck.id);

        const recheck = await factCheckArticle({
            title: resolvedTitle,
            excerpt: resolvedExcerpt,
            content_html: resolvedHtml,
        });
        const issuesText = formatIssuesListText(recheck.issues);
        const nowIso = new Date().toISOString();
        const { error: insertErr } = await supabaseServer.from("article_automation_queue").insert({
            article_id: articleForCheck.id,
            prompt: "manual fact-fix",
            status: recheck.hasIssues ? "error" : "done",
            used_at: nowIso,
            last_error: recheck.hasIssues
                ? `fact_check_failed: ${issuesText || "- (nincs részletezett hiba)"}`
                : "fact_check_ok",
            category_slug: (articleForCheck as any).category_slug || null,
            post_to_facebook: false,
            post_to_pinterest: false,
            post_to_x: false,
        });
        if (insertErr) {
            return { ok: false, message: `DB insert error: ${insertErr.message}` };
        }

        if (recheck.hasIssues) {
            revalidatePath(`/admin/articles/${articleForCheck.slug}`);
            return { ok: true, message: "Javítás lefutott, de maradt gyanús állítás." };
        }

        await supabaseServer
            .from("articles")
            .update({
                status: "published",
            })
            .eq("id", articleForCheck.id);

        revalidatePath(`/admin/articles/${articleForCheck.slug}`);
        return { ok: true, message: "Javítás kész, a fact-check tiszta. A cikk publikálva." };
    }

    return (
        <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold">Cikk szerkesztése</h1>
                    <span className="text-xs font-semibold rounded-full px-3 py-1 bg-slate-100 text-slate-700 border border-slate-200">
                        {String(article.status || "draft")}
                    </span>
                    {factCheckFlag ? (
                        <span
                            className="text-xs font-semibold rounded-full px-3 py-1 bg-amber-100 text-amber-800 border border-amber-200"
                            title={
                                factCheckIssues.length
                                    ? factCheckIssues
                                          .map((i, idx) => `#${idx + 1} Állítás: ${i.claim} | Javítás: ${i.correction}`)
                                          .join("\n")
                                    : "Fact-check figyelmeztetés"
                            }
                        >
                            Fact-check figyelmeztetés
                        </span>
                    ) : null}
                </div>
                <a
                    className="underline text-sm"
                    href={`/cikkek/${article.slug}`}
                    target="_blank"
                    rel="noreferrer"
                >
                    Megnézem
                </a>
            </div>
            <FactCheckActions
                articleId={article.id}
                articleSlug={article.slug}
                onFactCheck={runFactCheckAction}
                onFactFix={runFactFixAction}
            />
            <div className="border border-slate-200 bg-slate-50 text-slate-700 text-sm rounded-xl px-4 py-3">
                <div className="font-semibold mb-1">Legutóbbi fact-check</div>
                <div>
                    <strong>Eredmény:</strong>{" "}
                    {factCheckFlag ? "Hibát talált" : factCheckOk ? "Rendben" : "Nincs adat"}
                </div>
                <div>
                    <strong>Időpont:</strong> {lastAutomationAt ? new Date(lastAutomationAt).toLocaleString("hu-HU") : "n/a"}
                </div>
                {lastFactCheck?.last_error ? (
                    <div className="mt-2 whitespace-pre-wrap">
                        <strong>Részletek:</strong> {String(lastFactCheck.last_error)}
                    </div>
                ) : null}
                {!lastFactCheck ? (
                    <div className="mt-2 text-slate-600">
                        Még nincs manuális fact-check futás rögzítve ehhez a cikkhez.
                    </div>
                ) : null}
            </div>
            {factCheckFlag && factCheckIssues.length ? (
                <div className="border border-amber-200 bg-amber-50 text-amber-900 text-sm rounded-xl px-4 py-3">
                    <div className="font-semibold mb-2">Gyanús/hibás állítások</div>
                    <ul className="list-disc ml-5 space-y-1">
                        {factCheckIssues.map((issue, idx) => (
                            <li key={`${issue.claim}-${idx}`}>
                                <div><strong>Állítás:</strong> {issue.claim}</div>
                                <div><strong>Javítás:</strong> {issue.correction}</div>
                                {issue.reason ? <div><strong>Indoklás:</strong> {issue.reason}</div> : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {errMessage ? (
                <div className="border border-red-200 bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">
                    {errMessage}
                </div>
            ) : null}
            {okMessage ? (
                <div className="border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm rounded-xl px-4 py-3">
                    {okMessage}
                </div>
            ) : null}

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


                <AdminActionButton className="btn" pendingText="Mentés...">
                    Mentés
                </AdminActionButton>
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
                                <AdminActionButton
                                    className="bg-red-600 text-white rounded-xl px-4 py-2 text-sm"
                                    pendingText="Törlés..."
                                >
                                    Igen, törlés
                                </AdminActionButton>
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

                    const parsedPlacements = safeJsonParsePlacements(text);
                    if (!parsedPlacements) {
                        redirect(
                            `/admin/articles/${a.slug}?err=${encodeURIComponent(
                                "AI válasz nem JSON (elhelyezés)."
                            )}`
                        );
                    }

                    let placements = parsedPlacements
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

                    redirect(`/admin/articles/${a.slug}?ok=${encodeURIComponent("Termékek elhelyezve.")}`);
                }}
            >
                <div className="flex items-center justify-between gap-3 flex-wrap border rounded-2xl p-4 bg-gray-50">
                    <div className="space-y-1">
                        <div className="font-semibold">AI termék elhelyezés</div>
                        <div className="text-sm text-gray-600">
                            A cikk HTML-jébe beszúrja a jelölőket ({"<!--PRODUCT:slug-->"}) logikus helyekre.
                        </div>
                    </div>
                    <AdminActionButton
                        className="bg-black text-white rounded-xl px-4 py-2 text-sm"
                        pendingText="Elhelyezés..."
                    >
                        AI: termékek elhelyezése a szövegben
                    </AdminActionButton>
                </div>
            </form>

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

                    const { data: a, error: aErr } = await supabaseServer
                        .from("articles")
                        .select("id, title, excerpt, content_html")
                        .eq("id", article.id)
                        .single();

                    if (aErr || !a) {
                        redirect(
                            `/admin/articles/${article.slug}?err=${encodeURIComponent(
                                "Nem találom a cikket AI termékekhez"
                            )}`
                        );
                    }

                    const { data: products, error: pErr } = await supabaseServer
                        .from("products")
                        .select("slug, name")
                        .order("name", { ascending: true });

                    if (pErr || !products) {
                        redirect(
                            `/admin/articles/${article.slug}?err=${encodeURIComponent(
                                "Nem találom a termékeket AI termékekhez"
                            )}`
                        );
                    }

                    const productList = products.map((p) => `${p.slug} — ${p.name}`).join("\n");

                    const prompt = `
Válaszd ki a legjobb 0-5 kapcsolódó terméket a cikkhez.
Csak az alábbi listából választhatsz, és csak a slugokat add vissza.

TERMÉKEK:
${productList}

CIKK:
Cím: ${a.title || ""}
Kivonat: ${a.excerpt || ""}
Tartalom (HTML): ${a.content_html || ""}

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
                        redirect(
                            `/admin/articles/${article.slug}?err=${encodeURIComponent(
                                "OpenAI hiba (kapcsolódó termékek): " + t
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

                    const parsedSlugs = safeJsonParseSlugs(text);
                    if (!parsedSlugs) {
                        redirect(
                            `/admin/articles/${article.slug}?err=${encodeURIComponent(
                                "AI válasz nem JSON (kapcsolódó termékek)."
                            )}`
                        );
                    }

                    const allowed = new Set(products.map((p) => p.slug));
                    const slugs = parsedSlugs.filter((s) => allowed.has(s)).slice(0, 5);

                    await supabaseServer
                        .from("articles")
                        .update({ related_product_slugs: slugs })
                        .eq("id", a.id);

                    redirect(`/admin/articles/${article.slug}?ok=${encodeURIComponent("Kapcsolódó termékek frissítve.")}`);
                }}
            >
                <div className="flex items-center justify-between gap-3 flex-wrap border rounded-2xl p-4 bg-gray-50">
                    <div className="space-y-1">
                        <div className="font-semibold">AI kapcsolódó termékek</div>
                        <div className="text-sm text-gray-600">
                            Frissíti a cikkhez tartozó ajánlott termékeket.
                        </div>
                    </div>
                    <AdminActionButton
                        className="bg-black text-white rounded-xl px-4 py-2 text-sm"
                        pendingText="Javaslat..."
                    >
                        AI: kapcsolódó termékek javaslata
                    </AdminActionButton>
                </div>
            </form>

        </main>
    );
}
