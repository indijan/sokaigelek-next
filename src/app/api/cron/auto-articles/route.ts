import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";
import { uploadVercelBlob } from "@/lib/blobStorage";
import { slugifyHu } from "@/lib/slugifyHu";
import { createCampaign, getOrCreateGroupId, scheduleCampaignNow, upsertSubscriber } from "@/lib/brevo";
import { bestSimilarityHit, normalizeContentText } from "@/lib/contentSimilarity";

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

  const callOnce = async (input: string) => {
    const controller = new AbortController();
    const timeoutMs = Number(process.env.FACT_CHECK_TIMEOUT_MS || "120000");
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!r.ok) {
      const t = await r.text();
      throw new Error(`OpenAI error: ${t}`);
    }

    const data = await r.json();
    const text =
      data?.output_text ||
      data?.output?.map((o: any) => o?.content?.map((c: any) => c?.text).join("")).join("") ||
      "";
    return text;
  };

  const text1 = await callOnce(prompt);
  const parsed1 = extractJsonObject(text1);
  if (parsed1) return parsed1;

  const retryPrompt = `FONTOS: CSAK érvényes JSON-t adj vissza, semmi mást.\n\n${prompt}`;
  const text2 = await callOnce(retryPrompt);
  const parsed2 = extractJsonObject(text2);
  if (!parsed2) {
    const snippet = text2.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(`OpenAI did not return JSON. Snippet: ${snippet}`);
  }
  return parsed2;
}

function formatIssuesMarkdown(issues: Array<{ claim: string; correction: string; reason?: string; severity?: string }>) {
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

async function sendEditorAlert(input: {
  subject: string;
  html: string;
  editorEmail: string;
}) {
  const fromEmail = process.env.BREVO_FROM_EMAIL || process.env.MAILERLITE_FROM_EMAIL || "";
  const fromName = process.env.BREVO_FROM_NAME || process.env.MAILERLITE_FROM_NAME || "";
  if (!fromEmail || !fromName) {
    return { skipped: true, reason: "missing_brevo_from" };
  }

  const groupId = await getOrCreateGroupId("editor-alerts");
  await upsertSubscriber(input.editorEmail, groupId);
  const campaign = await createCampaign({
    name: `editor-alert-${Date.now()}`,
    subject: input.subject,
    fromName,
    fromEmail,
    html: input.html,
    groupId,
  });
  await scheduleCampaignNow(campaign.data.id);
  return { ok: true, campaignId: campaign.data.id };
}

async function factCheckArticle(article: { title?: string; excerpt?: string; content_html?: string }) {
  const prompt = `
Ellenőrizd a cikkben szereplő TÁRGYI állításokat. Csak akkor jelölj, ha nagy valószínűséggel hibás, félrevezető vagy pontatlan.
Ne jelölj stílusbeli, óvatossági vagy hangsúlybeli kérdést hibának.
Ne követelj ismételt "kisebb vizsgálat", "nem bizonyított", "további kutatás kell" típusú fordulatokat, ha ez már egyszer szerepel vagy a szöveg eleve óvatos.
Csak olyan pontot jelölj, ami ténylegesen félrevezetheti az olvasót egészségügyi döntésben.

Add vissza EGYETLEN JSON objektumban:
{
  "hasIssues": boolean,
  "issues": [
    {
      "claim": "rövid idézet vagy összefoglalás az állításról",
      "correction": "a cikkbe illeszthető, természetes hangú, közérthető javított megfogalmazás (kerüld a szakzsargont)",
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

async function reviseArticleWithIssues(article: { title?: string; excerpt?: string; content_html?: string }, issues: Array<{ claim: string; correction: string; reason?: string }>) {
  const issueList = formatIssuesMarkdown(issues);
  const prompt = `
Javítsd a cikket a felsorolt tárgyi hibák alapján. Csak a hibákat javítsd, a stílust, hangnemet, szerkezetet tartsd meg.
FONTOS: A "Javítás" mező iránymutatás, nem feltétlenül beillesztendő szöveg. Úgy írd át a releváns részt, hogy természetesen illeszkedjen a szövegkörnyezetbe, közérthetően, szakzsargon nélkül. Ha az állítás javíthatatlan vagy félrevezető, töröld a hibás részt (ne hagyj benne magyarázó/oktató mondatot).
Ne adj hozzá új, ismétlődő orvosi figyelmeztetéseket (pl. "beszéld meg orvosoddal"). Ha szükséges, legfeljebb egyszer szerepelhet a cikk teljes szövegében. Ha a cikk végén már van figyelmeztetés, ne tegyél közbe újat. Kerüld a pontosvessző használatát.
Ne tedd túlzottan védekezővé vagy ijesztővé a szöveget. Kerüld a mantraszerű bizonytalansági fordulatok ismétlését.
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

function stripProductMarkers(html: string) {
  return String(html || "").replace(/<!--\s*PRODUCT:[a-z0-9-]+\s*-->/gi, "");
}

function safeJsonParsePlacements(text: string): Array<{ slug: string; afterParagraph: number }> | null {
  const parsed = extractJsonObject(text);
  if (!parsed) return null;
  const arr = Array.isArray(parsed?.placements)
    ? (parsed.placements as Array<{ slug?: unknown; afterParagraph?: unknown }>)
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
}

function getInsertPoints(html: string): number[] {
  const s = String(html || "");
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

  const dedup: number[] = [];
  for (const p of pointsAlt) {
    if (!dedup.length || p - dedup[dedup.length - 1] > 30) dedup.push(p);
  }
  if (dedup.length) return dedup;

  const L = s.length;
  if (L < 200) return [];
  return [Math.floor(L * 0.25), Math.floor(L * 0.55), Math.floor(L * 0.8)];
}

function insertMarkerAfterParagraph(html: string, afterParagraphIndex: number, marker: string) {
  const s = String(html || "");
  const points = getInsertPoints(s);

  if (!points.length) {
    return s + "\n" + marker;
  }

  const idx = points[Math.min(Math.max(0, afterParagraphIndex), points.length - 1)];
  return s.slice(0, idx) + "\n" + marker + "\n" + s.slice(idx);
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
    "Do not include any text, letters, or typography on the image.",
    styleHint ? `Style hint: ${styleHint}` : "",
    `Title concept: ${title}`,
    category ? `Category: ${category}` : "",
    intro ? `Intro: ${intro}` : "",
    headings.length ? `Outline: ${headings.join(" | ")}` : "",
    keySentences.length ? `Key points: ${keySentences.join(" / ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

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
        Authorization: `Bearer ${apiKey}`,
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
    throw new Error(`OpenAI image error: ${t}`);
  }

  const imgJson = (await imgRes.json()) as any;
  const b64 = imgJson?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned");

  const buffer = Buffer.from(b64, "base64");
  const bucket = process.env.ARTICLE_IMAGES_BUCKET || "article-images";
  const safeSlug =
    String(article.slug || "article")
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
    const { error: upErr } = await supabaseServer.storage
      .from(bucket)
      .upload(path, buffer, { contentType: "image/png", upsert: true });

    if (upErr) throw new Error(`Upload error: ${upErr.message}`);

    const { data: pub } = supabaseServer.storage.from(bucket).getPublicUrl(path);
    publicUrl = pub.publicUrl;
    coverImagePath = path;
  }

  const { error: uErr } = await supabaseServer
    .from("articles")
    .update({ cover_image_url: publicUrl, cover_image_path: coverImagePath })
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

async function placeInlineProductEmbeds(article: any, preferredSlugs: string[]) {
  const { data: products, error: pErr } = await supabaseServer
    .from("products")
    .select("slug, name")
    .order("name", { ascending: true });

  if (pErr || !products) throw new Error("products_not_found");

  const allowed = new Set(products.map((p) => p.slug));
  const preferred = preferredSlugs.filter((s) => allowed.has(s));

  const html0 = String(article.content_html || "");
  const html = stripProductMarkers(html0);
  const paragraphCount = getInsertPoints(html).length;
  if (paragraphCount < 3) return [];

  const productList = products.map((p) => `${p.slug} — ${p.name}`).join("\n");
  const preferredLine = preferred.length ? preferred.join(", ") : "(nincs megadva)";

  const prompt = `
A feladatod: helyezd el 0-5 termék ajánlót a cikk HTML tartalmában LOGIKUS pontokra.

A megjelenítés jelölője: <!--PRODUCT:slug-->

Bemenet:
- Cikk címe: ${article.title || ""}
- Kivonat: ${article.excerpt || ""}
- HTML: ${html}
- Bekezdések száma (</p>): ${paragraphCount}

Termékek (csak ebből választhatsz):
${productList}

Preferált slugok (ha releváns): ${preferredLine}

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

  const data = await openaiJson(prompt);
  const parsedPlacements = safeJsonParsePlacements(JSON.stringify(data));
  if (!parsedPlacements) return [];

  let placements = parsedPlacements
    .filter((p) => allowed.has(p.slug))
    .slice(0, 5);

  if (!placements.length) {
    return [];
  }

  const maxInsert = Math.max(0, paragraphCount - 2);
  const bySlug = new Map<string, number>();
  for (const p of placements) {
    const idx = Math.max(0, Math.min(maxInsert, Math.floor(p.afterParagraph)));
    bySlug.set(p.slug, idx);
  }
  let cleaned = Array.from(bySlug.entries()).map(([slug, afterParagraph]) => ({
    slug,
    afterParagraph,
  }));

  const idealMax = paragraphCount >= 12 ? 4 : 3;
  cleaned = cleaned.slice(0, idealMax);

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
    for (let i = 0; i < n; i++) {
      const frac = (i + 1) / (n + 1);
      targets.push(Math.max(0, Math.min(maxInsert, Math.floor(frac * maxInsert))));
    }
    for (let i = 1; i < targets.length; i++) {
      if (targets[i] - targets[i - 1] < 2) targets[i] = Math.min(maxInsert, targets[i - 1] + 2);
    }
    for (let i = targets.length - 1; i >= 1; i--) {
      if (targets[i] > maxInsert) targets[i] = maxInsert;
      if (targets[i] - targets[i - 1] < 2) targets[i - 1] = Math.max(0, targets[i] - 2);
    }
    cleaned = cleaned.map((p, i) => ({
      slug: p.slug,
      afterParagraph: targets[i] ?? p.afterParagraph,
    }));
  }

  cleaned = cleaned.sort((a, b) => b.afterParagraph - a.afterParagraph);

  let nextHtml = html;
  for (const p of cleaned) {
    const marker = `<!--PRODUCT:${p.slug}-->`;
    nextHtml = insertMarkerAfterParagraph(nextHtml, p.afterParagraph, marker);
  }

  await supabaseServer
    .from("articles")
    .update({ content_html: nextHtml })
    .eq("id", article.id);

  return cleaned.map((p) => p.slug);
}

async function postToFacebook(article: any) {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!pageId || !accessToken) return { skipped: true, reason: "missing_env" };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sokaigelek.hu";
  const link = `${siteUrl.replace(/\/$/, "")}/cikkek/${article.slug}`;
  const messageParts = [article.title, article.excerpt].filter(Boolean);
  const message = `${messageParts.join("\n\n")} @követő`;

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

async function postToPinterest(article: any, imageUrl: string) {
  const accessToken = process.env.PINTEREST_ACCESS_TOKEN;
  const boardId = process.env.PINTEREST_BOARD_ID;
  if (!accessToken || !boardId) return { skipped: true, reason: "missing_env" };
  if (!imageUrl) return { skipped: true, reason: "missing_image" };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sokaigelek.hu";
  const link = `${siteUrl.replace(/\/$/, "")}/cikkek/${article.slug}`;
  const title = String(article.title || "").slice(0, 100);
  const description = [article.title, article.excerpt].filter(Boolean).join(" — ").slice(0, 500);

  const r = await fetch("https://api.pinterest.com/v5/pins", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      board_id: boardId,
      title,
      description,
      link,
      media_source: {
        source_type: "image_url",
        url: imageUrl,
      },
    }),
  });

  const data = await r.json();
  if (!r.ok || data?.error) {
    throw new Error(data?.message || data?.error?.message || "pinterest_error");
  }

  return { ok: true, pin_id: data?.id || null };
}

async function postToX(article: any) {
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;
  const consumerKey = process.env.X_CONSUMER_KEY;
  const consumerSecret = process.env.X_CONSUMER_SECRET;
  if (!accessToken || !accessTokenSecret || !consumerKey || !consumerSecret) {
    return { skipped: true, reason: "missing_env" };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sokaigelek.hu";
  const link = `${siteUrl.replace(/\/$/, "")}/cikkek/${article.slug}`;
  const title = String(article.title || "").trim();
  const excerpt = String(article.excerpt || "").trim();
  const body = [title, excerpt].filter(Boolean).join("\n\n");
  const maxLen = 280;
  const suffix = body ? `\n\n${link}` : link;
  const allowedBodyLen = Math.max(0, maxLen - suffix.length);
  const trimmedBody =
    allowedBodyLen > 0 && body.length > allowedBodyLen
      ? body.slice(0, allowedBodyLen).replace(/\s+\S*$/, "").trim()
      : body;
  const text = trimmedBody ? `${trimmedBody}\n\n${link}` : link;

  const url = "https://api.x.com/2/tweets";
  const oauthHeader = buildOAuthHeader({
    method: "POST",
    url,
    consumerKey,
    consumerSecret,
    token: accessToken,
    tokenSecret: accessTokenSecret,
  });

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: oauthHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  const data = await r.json();
  if (!r.ok || data?.errors) {
    const errorMessage =
      data?.errors?.[0]?.message ||
      data?.error?.message ||
      (typeof data?.detail === "string" ? data.detail : null) ||
      (typeof data?.title === "string" ? data.title : null) ||
      null;
    const extra =
      typeof data === "string"
        ? data
        : JSON.stringify(data).slice(0, 600);
    throw new Error(errorMessage ? `${errorMessage} | ${extra}` : `x_error | ${extra}`);
  }

  return { ok: true, tweet_id: data?.data?.id || null };
}

function buildOAuthHeader({
  method,
  url,
  consumerKey,
  consumerSecret,
  token,
  tokenSecret,
}: {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
}) {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: "1.0",
  };

  const baseUrl = url.split("?")[0];
  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${encodeOauth(k)}=${encodeOauth(oauthParams[k])}`)
    .join("&");
  const baseString = [method.toUpperCase(), encodeOauth(baseUrl), encodeOauth(paramString)].join("&");
  const signingKey = `${encodeOauth(consumerSecret)}&${encodeOauth(tokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");
  oauthParams.oauth_signature = signature;

  const headerParams = Object.keys(oauthParams)
    .sort()
    .map((k) => `${encodeOauth(k)}="${encodeOauth(oauthParams[k])}"`)
    .join(", ");
  return `OAuth ${headerParams}`;
}

function encodeOauth(input: string) {
  return encodeURIComponent(input).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function normalizeSeverity(value?: string): "low" | "medium" | "high" {
  const v = String(value || "").toLowerCase().trim();
  if (v === "low" || v === "medium" || v === "high") return v;
  return "medium";
}

type DuplicateCheckContext = {
  recentTexts: string[];
  pendingPrompts: string[];
};

async function buildDuplicateCheckContext(
  categorySlug?: string | null,
  excludeQueueId?: string | null
): Promise<DuplicateCheckContext> {
  let articlesQuery = supabaseServer
    .from("articles")
    .select("title, excerpt, content_html, category_slug, created_at")
    .order("created_at", { ascending: false })
    .limit(120);
  if (categorySlug) {
    articlesQuery = articlesQuery.eq("category_slug", categorySlug);
  }
  const { data: recentArticles } = await articlesQuery;

  let queueQuery = supabaseServer
    .from("article_automation_queue")
    .select("id, prompt, category_slug, status, created_at")
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(120);
  if (categorySlug) {
    queueQuery = queueQuery.eq("category_slug", categorySlug);
  }
  const { data: queueRows } = await queueQuery;

  const recentTexts = (recentArticles || [])
    .map((a: any) =>
      [
        String(a?.title || "").trim(),
        String(a?.excerpt || "").trim(),
        stripHtml(String(a?.content_html || "")).slice(0, 4000).trim(),
      ]
        .filter(Boolean)
        .join(" — ")
    )
    .filter(Boolean);
  const pendingPrompts = (queueRows || [])
    .filter((q: any) => !excludeQueueId || String(q?.id || "") !== String(excludeQueueId))
    .map((q: any) => String(q?.prompt || "").trim())
    .filter(Boolean);

  return { recentTexts, pendingPrompts };
}

function assertNotDuplicateText(candidate: string, context: DuplicateCheckContext, threshold = 0.74) {
  const cleaned = normalizeContentText(candidate);
  if (!cleaned) return;

  const fromArticles = bestSimilarityHit(cleaned, context.recentTexts);
  if (fromArticles && fromArticles.score >= threshold) {
    throw new Error(`duplicate_content_detected(score=${fromArticles.score.toFixed(2)})`);
  }
  const fromQueue = bestSimilarityHit(cleaned, context.pendingPrompts);
  if (fromQueue && fromQueue.score >= threshold) {
    throw new Error(`duplicate_queue_topic_detected(score=${fromQueue.score.toFixed(2)})`);
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") || "";
  const force = searchParams.get("force") === "1";
  const expected = process.env.CRON_SECRET || "";
  const cronHeader = req.headers.get("x-vercel-cron");
  const isVercelCron = cronHeader === "1" || cronHeader === "true";
  const ua = req.headers.get("user-agent") || "";
  const isVercelCronUa = ua.toLowerCase().includes("vercel-cron/");
  if (!(isVercelCron || isVercelCronUa) && (!expected || secret !== expected)) {
    console.warn("cron_unauthorized", {
      hasCronHeader: Boolean(cronHeader),
      cronHeader,
      hasCronUa: isVercelCronUa,
      hasExpected: Boolean(expected),
      hasSecret: Boolean(secret),
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const { year, month, day } = getBudapestParts(now);
  const runDate = `${year}-${month}-${day}`;
  const nowIso = now.toISOString();

  const { data: nextItem } = await supabaseServer
    .from("article_automation_queue")
    .select(
      "id, prompt, article_id, category_slug, post_to_facebook, post_to_pinterest, post_to_x"
    )
    .eq("status", "pending")
    .or(`publish_at.lte.${nowIso},publish_at.is.null`)
    .order("publish_at", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextItem) {
    const { count: pendingCount } = await supabaseServer
      .from("article_automation_queue")
      .select("id", { count: "exact" })
      .eq("status", "pending");
    if ((pendingCount || 0) > 0) {
      await supabaseServer.from("article_automation_runs").insert({
        run_date: runDate,
        status: "skipped_not_due",
        details: "Pending items exist but none are due yet.",
      });
      return NextResponse.json({ ok: true, skipped: "not_due" });
    }
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
  let isNewArticle = false;
  let runStatus = "ok";
  let details = "";

  try {
    if (String(nextItem.prompt || "").toLowerCase().includes("manual reprocess") && !nextItem.article_id) {
      throw new Error("manual_reprocess_missing_article_id");
    }
    if (nextItem.article_id) {
      const { data: existingArticle, error: existingErr } = await supabaseServer
        .from("articles")
        .select(
          "id, slug, title, excerpt, content_html, category_slug, cover_image_url, related_product_slugs, status, published_at"
        )
        .eq("id", nextItem.article_id)
        .maybeSingle();
      if (existingErr || !existingArticle) {
        throw new Error("article_not_found");
      }
      article = existingArticle;
    } else {
      const duplicateContext = await buildDuplicateCheckContext(nextItem.category_slug || null, nextItem.id);
      assertNotDuplicateText(String(nextItem.prompt || ""), duplicateContext, 0.8);

      const prompt = `
Te egy magyar egészség/életmód magazin szerzője vagy.
Készíts egy cikket a következő témára/prompt alapján.

KATEGÓRIA: ${nextItem.category_slug || ""}
PROMPT: ${nextItem.prompt}

Követelmények:
- Magyar nyelv.
- HTML tartalom, bekezdések, alcímek (h2/h3), felsorolás ha indokolt.
- Kíméletes, empatikus és hiteles hangvétel; ne ígérj gyógyulást.
- Mindig tegezés, ne váltogasd a megszólítást.
- 900-1400 szó.
- A bekezdések legyenek rövidek és könnyen olvashatók.
- Rövid, tömör cím: max 60 karakter, lehetőleg 6-9 szó.
- Ne írj meta-szöveget a stílusról (pl. "a cikk barátságos hangvételben...").
- Ne írj önreflexív vagy kommentáló mondatot a cikkről (pl. "Ez a cikk ... elmagyarázza", "ebben a cikkben bemutatjuk", "az alábbiakban áttekintjük").
- Ne kezdeményezz párbeszédet, ne tegyél "ha szeretnéd..." típusú záró felhívást.
- Írj természetes, szakértői hangon, mintha egy tapasztalt egészségügyi szakíró fogalmazna.
- Kerüld a sablonos, AI-szerű fordulatokat és az ismétlődő mondatszerkezeteket.
- Legyen változatos a mondathossz és a ritmus; ne legyen “tankönyvszagú”.

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

      const generatedForDedup = `${title}\n${excerpt}\n${stripHtml(content_html).slice(0, 4000)}`;
      assertNotDuplicateText(generatedForDedup, duplicateContext, 0.72);

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
          status: "draft",
          category_slug: nextItem.category_slug || null,
          published_at: null,
        })
        .select(
          "id, slug, title, excerpt, content_html, category_slug, cover_image_url, related_product_slugs, status, published_at"
        )
        .single();

      if (insertErr || !inserted) {
        throw new Error(insertErr?.message || "insert_failed");
      }

      article = inserted;
      isNewArticle = true;
      await supabaseServer
        .from("article_automation_queue")
        .update({ article_id: article.id })
        .eq("id", nextItem.id);
    }

    let factCheckIssues: Array<{ claim: string; correction: string; reason?: string; severity?: string }> = [];
    let factCheckHadIssues = false;
    const maxFactFixLoops = Math.max(1, Math.min(8, Number(process.env.FACT_CHECK_MAX_FIX_LOOPS || "5")));
    let factFixAttempts = 0;

    for (let attempt = 1; attempt <= maxFactFixLoops; attempt += 1) {
      factFixAttempts = attempt;
      try {
        const check = await factCheckArticle(article);
        factCheckHadIssues = check.hasIssues;
        factCheckIssues = check.issues;
      } catch (err) {
        factCheckHadIssues = true;
        factCheckIssues = [
          {
            claim: "fact_check_failed",
            correction: "A fact-check futtatása sikertelen, manuális ellenőrzés szükséges.",
            reason: String((err as Error)?.message || err),
            severity: "high",
          },
        ];
      }

      if (!factCheckHadIssues) break;
      if (attempt >= maxFactFixLoops) break;

      try {
        const revised = await reviseArticleWithIssues(article, factCheckIssues);
        if (!revised?.content_html) {
          throw new Error("fact_check_revision_empty");
        }
        article = {
          ...article,
          title: revised.title || article.title,
          excerpt: revised.excerpt || article.excerpt,
          content_html: revised.content_html || article.content_html,
        };
        await supabaseServer
          .from("articles")
          .update({
            title: article.title,
            excerpt: article.excerpt,
            content_html: article.content_html,
          })
          .eq("id", article.id);
      } catch (err) {
        factCheckHadIssues = true;
        factCheckIssues = [
          {
            claim: "fact_check_revision_failed",
            correction: "A javító kör futtatása sikertelen, manuális ellenőrzés szükséges.",
            reason: String((err as Error)?.message || err),
            severity: "high",
          },
        ];
        break;
      }
    }

    if (factCheckHadIssues) {
      const issuesText = formatIssuesMarkdown(factCheckIssues) || "- (nincs részletezett hiba)";
      const allLowSeverity =
        factCheckIssues.length > 0 && factCheckIssues.every((i) => normalizeSeverity(i.severity) === "low");
      const warningType = allLowSeverity ? "soft_warning" : "hard_warning_but_publish";
      const warningMsg = `fact_check_${warningType}_after_${factFixAttempts}_attempts: ${issuesText}`;
      details = details ? `${details} | ${warningMsg}` : warningMsg;

      const editorEmail = process.env.FACT_CHECK_ALERT_EMAIL || "indijanmac@gmail.com";
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sokaigelek.hu";
      const articleUrl = `${siteUrl.replace(/\/$/, "")}/admin/articles/${article.slug}`;
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#111827;">
          <div style="font-size:16px;font-weight:600;margin-bottom:10px;">Fact-check figyelmeztetés (publikálva)</div>
          <div style="margin-bottom:12px;">A cikk publikálva lett, de a fact-check után maradtak nyitott pontok.</div>
          <div style="margin-bottom:10px;"><strong>Cím:</strong> ${article.title || "(nincs cím)"}</div>
          <div style="margin-bottom:12px;"><a href="${articleUrl}">Szerkesztés megnyitása</a></div>
          <pre style="white-space:pre-wrap;font-size:13px;background:#f9fafb;border:1px solid #e5e7eb;padding:12px;border-radius:8px;">${issuesText}</pre>
        </div>
      `;
      try {
        await sendEditorAlert({
          subject: `Fact-check warning: ${article.title || article.slug || "cikk"}`,
          html,
          editorEmail,
        });
      } catch (err) {
        console.warn("fact_check_email_failed", String((err as Error)?.message || err));
      }
    }

    const shouldPublish = isNewArticle || article.status === "published";
    if (shouldPublish) {
      await supabaseServer
        .from("articles")
        .update({
          status: "published",
          published_at: article.published_at || new Date().toISOString(),
        })
        .eq("id", article.id);
    }

    let coverImageUrl = article?.cover_image_url || "";
    if (!coverImageUrl) {
      try {
        coverImageUrl = await generateCoverImage(article);
      } catch (err) {
        console.warn("cover_image_failed", String((err as Error)?.message || err));
      }
    }
    const relatedSlugs = await suggestRelatedProducts(article);
    await placeInlineProductEmbeds(article, relatedSlugs);
    const shouldPostToFacebook = shouldPublish && (nextItem?.post_to_facebook ?? true);
    const shouldPostToPinterest = shouldPublish && Boolean(nextItem?.post_to_pinterest);
    const shouldPostToX = shouldPublish && Boolean(nextItem?.post_to_x);
    const imageUrl = coverImageUrl || article.cover_image_url || "";

    const socialResults: Record<
      string,
      { status: "ok" | "skipped" | "error"; reason?: string; id?: string }
    > = {};

    if (shouldPostToFacebook) {
      try {
        const fbRes = await postToFacebook(article);
        if (fbRes?.skipped) {
          socialResults.facebook = { status: "skipped", reason: fbRes.reason };
        } else {
          socialResults.facebook = { status: "ok", id: fbRes?.post_id || undefined };
        }
      } catch (err: any) {
        socialResults.facebook = { status: "error", reason: String(err?.message || err) };
      }
    }
    if (shouldPostToPinterest) {
      try {
        const pinRes = await postToPinterest(article, imageUrl);
        if (pinRes?.skipped) {
          socialResults.pinterest = { status: "skipped", reason: pinRes.reason };
        } else {
          socialResults.pinterest = { status: "ok", id: pinRes?.pin_id || undefined };
        }
      } catch (err: any) {
        socialResults.pinterest = { status: "error", reason: String(err?.message || err) };
      }
    }
    if (shouldPostToX) {
      try {
        const xRes = await postToX(article);
        if (xRes?.skipped) {
          socialResults.x = { status: "skipped", reason: xRes.reason };
        } else {
          socialResults.x = { status: "ok", id: xRes?.tweet_id || undefined };
        }
      } catch (err: any) {
        socialResults.x = { status: "error", reason: String(err?.message || err) };
      }
    }

    const socialSummary = Object.entries(socialResults)
      .map(([key, value]) => `${key}:${value.status}${value.reason ? `(${value.reason})` : ""}`)
      .join(", ");
    if (socialSummary) {
      details = details ? `${details} | social=${socialSummary}` : `social=${socialSummary}`;
    }

    await supabaseServer
      .from("article_automation_queue")
      .update({
        status: "done",
        used_at: new Date().toISOString(),
        article_id: article?.id || nextItem.article_id,
        last_error: details ? details.slice(0, 1000) : null,
      })
      .eq("id", nextItem.id);
  } catch (err: any) {
    runStatus = "error";
    details = String(err?.message || err);

    const articleIdForQueue = article?.id || nextItem.article_id || null;
    await supabaseServer
      .from("article_automation_queue")
      .update({
        status: "error",
        last_error: details,
        article_id: articleIdForQueue,
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
