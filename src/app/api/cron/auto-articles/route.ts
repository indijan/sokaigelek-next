import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { slugifyHu } from "@/lib/slugifyHu";

export const runtime = "nodejs";

function getBudapestParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const map = new Map(parts.map((p) => [p.type, p.value]));
  return {
    year: map.get("year") || "",
    month: map.get("month") || "",
    day: map.get("day") || "",
    hour: map.get("hour") || "",
    minute: map.get("minute") || "",
  };
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

async function generateCoverImage(article: any) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const title = article.title || "";
  const intro = (article.excerpt || "").slice(0, 260);
  const category = article.category_slug || "";
  const bodyHtml = String(article.content_html || "");
  const headings = extractHeadings(bodyHtml);
  const bodyText = stripHtml(bodyHtml);
  const keySentences = pickKeySentences(bodyText, 3);

  const imageSize = process.env.ARTICLE_COVER_IMAGE_SIZE || "1536x1024";
  const styleHint = process.env.ARTICLE_COVER_STYLE_HINT || "";

  const prompt = [
    "Create a clean, modern blog cover image optimized for Facebook feed engagement.",
    "Composition: clear subject, bold focal point, high contrast, inviting mood.",
    "Style: premium, soft lighting, subtle gradients, no clutter.",
    "Theme: health & wellbeing education (Hungarian audience).",
    "Avoid repetition: vary color palettes, subjects, and composition across images.",
    "Do NOT always use female figures; mix genders and ages or omit people entirely.",
    "People are optional. Use objects, hands, silhouettes, or abstract/still-life scenes when fitting.",
    "If the topic is anatomy (heart, blood vessels, organs), use stylized or abstract visuals, not realistic organs.",
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
  ]
    .filter(Boolean)
    .join("\n");

  const imgRes = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
    throw new Error(`OpenAI image error: ${t}`);
  }

  const imgJson = (await imgRes.json()) as any;
  const b64 = imgJson?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned");

  const buffer = Buffer.from(b64, "base64");
  const bucket = process.env.ARTICLE_IMAGES_BUCKET || "article-images";
  const safeSlug = (article.slug || "article").toString();
  const path = `covers/${safeSlug}-${Date.now()}.png`;

  const { error: upErr } = await supabaseServer.storage
    .from(bucket)
    .upload(path, buffer, { contentType: "image/png", upsert: true });

  if (upErr) throw new Error(`Upload error: ${upErr.message}`);

  const { data: pub } = supabaseServer.storage.from(bucket).getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const { error: uErr } = await supabaseServer
    .from("articles")
    .update({ cover_image_url: publicUrl })
    .eq("id", article.id);

  if (uErr) throw new Error(`DB update error: ${uErr.message}`);

  return publicUrl;
}

async function suggestRelatedProducts(article: any) {
  const { data: products, error: pErr } = await supabaseServer
    .from("products")
    .select("slug, name")
    .order("name", { ascending: true });

  if (pErr || !products) throw new Error("products_not_found");

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

  const parsed = await openaiJson(prompt);
  let slugs: string[] = Array.isArray(parsed?.slugs) ? parsed.slugs : [];

  const allowed = new Set(products.map((p) => p.slug));
  slugs = slugs.filter((s) => allowed.has(s)).slice(0, 5);

  await supabaseServer
    .from("articles")
    .update({ related_product_slugs: slugs })
    .eq("id", article.id);

  return slugs;
}

async function postToFacebook(article: any) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !accessToken) return { skipped: true, reason: "missing_env" };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sokaigelek.hu";
  const link = `${siteUrl.replace(/\/$/, "")}/cikkek/${article.slug}`;
  const messageParts = [article.title, article.excerpt].filter(Boolean);
  const message = messageParts.join("\n\n");

  const url = `https://graph.facebook.com/v19.0/${pageId}/feed`;
  const body = new URLSearchParams({
    message,
    link,
    access_token: accessToken,
  });

  const r = await fetch(url, { method: "POST", body });
  const data = await r.json();
  if (!r.ok || data?.error) {
    throw new Error(data?.error?.message || "facebook_error");
  }

  return { ok: true, post_id: data?.id || null };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") || "";
  const force = searchParams.get("force") === "1";
  const expected = process.env.CRON_SECRET || "";
  const isVercelCron = req.headers.get("x-vercel-cron") === "1";
  if (!isVercelCron && (!expected || secret !== expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { year, month, day, hour } = getBudapestParts(now);
  const runDate = `${year}-${month}-${day}`;

  if (hour !== "08" && !force) {
    return NextResponse.json({ ok: true, skipped: "not_8am" });
  }

  const { data: existingRun } = await supabaseServer
    .from("article_automation_runs")
    .select("id, status")
    .eq("run_date", runDate)
    .maybeSingle();

  if (existingRun && !force) {
    return NextResponse.json({ ok: true, skipped: "already_ran" });
  }

  if (existingRun && force && existingRun.status === "ok") {
    return NextResponse.json({ ok: true, skipped: "already_ran_ok" });
  }

  const { data: nextItem } = await supabaseServer
    .from("article_automation_queue")
    .select("*")
    .eq("status", "pending")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextItem) {
    await supabaseServer.from("article_automation_runs").insert({
      run_date: runDate,
      status: "skipped_empty",
      details: "No pending items in queue.",
    });
    return NextResponse.json({ ok: true, skipped: "empty_queue" });
  }

  const { data: lockRow, error: lockErr } = await supabaseServer
    .from("article_automation_queue")
    .update({ status: "processing" })
    .eq("id", nextItem.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (lockErr || !lockRow) {
    return NextResponse.json({ ok: true, skipped: "locked" });
  }

  let article: any = null;
  let runStatus = "ok";
  let details = "";

  try {
    const prompt = `
Te egy magyar egészség/életmód magazin szerzője vagy.
Készíts egy cikket a következő témára/prompt alapján.

KATEGÓRIA: ${nextItem.category_slug || ""}
PROMPT: ${nextItem.prompt}

Követelmények:
- Magyar nyelv.
- HTML tartalom, bekezdések, alcímek (h2/h3), felsorolás ha indokolt.
- Kíméletes, hiteles tone of voice; ne ígérj gyógyulást.
- 900-1400 szó.
- A bekezdések legyenek rövidek és könnyen olvashatók.

Adj vissza egyetlen JSON objektumot:
{
  "title": "...",
  "excerpt": "...",
  "content_html": "<p>...</p>..."
}
`.trim();

    const generated = await openaiJson(prompt);
    const title = String(generated?.title || "").trim();
    const excerpt = String(generated?.excerpt || "").trim();
    let content_html = String(generated?.content_html || "").trim();
    const disclaimer =
      "Megjegyzés: A cikkben szereplő információk tájékoztató jellegűek, nem helyettesítik az orvosi tanácsadást. Egészségügyi problémák esetén kérjük, fordulj szakorvoshoz vagy egészségügyi szakemberhez.";

    if (content_html && !content_html.includes("Megjegyzés: A cikkben szereplő információk")) {
      content_html = `${content_html}\n<p><em>${disclaimer}</em></p>`;
    }

    if (!title || !content_html) {
      throw new Error("empty_article");
    }

    const baseSlug = slugifyHu(title);
    let nextSlug = baseSlug || `cikk-${Date.now()}`;

    if (nextSlug) {
      let candidate = nextSlug;
      let i = 2;
      while (true) {
        const { data: existing } = await supabaseServer
          .from("articles")
          .select("id")
          .eq("slug", candidate)
          .maybeSingle();
        if (!existing) {
          nextSlug = candidate;
          break;
        }
        candidate = `${nextSlug}-${i}`;
        i += 1;
      }
    }

    const { data: inserted, error: insertErr } = await supabaseServer
      .from("articles")
      .insert({
        slug: nextSlug,
        title,
        excerpt,
        content_html,
        status: "published",
        category_slug: nextItem.category_slug || null,
        published_at: new Date().toISOString(),
      })
      .select("*")
      .single();

    if (insertErr || !inserted) {
      throw new Error(insertErr?.message || "insert_failed");
    }

    article = inserted;

    await generateCoverImage(article);
    await suggestRelatedProducts(article);
    await postToFacebook(article);

    await supabaseServer
      .from("article_automation_queue")
      .update({
        status: "done",
        used_at: new Date().toISOString(),
        article_id: article.id,
      })
      .eq("id", nextItem.id);
  } catch (err: any) {
    runStatus = "error";
    details = String(err?.message || err);

    await supabaseServer
      .from("article_automation_queue")
      .update({
        status: "error",
        last_error: details,
      })
      .eq("id", nextItem.id);
  }

  await supabaseServer.from("article_automation_runs").insert({
    run_date: runDate,
    status: runStatus,
    details,
    queue_id: nextItem.id,
    article_id: article?.id || null,
  });

  return NextResponse.json({ ok: true, status: runStatus });
}
