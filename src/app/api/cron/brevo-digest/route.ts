import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { createCampaign, getOrCreateGroupId, scheduleCampaignNow } from "@/lib/brevo";

const CATEGORY_LABELS: Record<string, string> = {
  "immunrendszer-erositese-es-altalanos-egeszsegmegorzes": "Immunrendszer erősítése és általános egészségmegőrzés",
  "csontok-izuletek-es-izomrendszer": "Csontok, ízületek és izomrendszer",
  "energia-es-mentalis-frissesseg": "Energia és mentális frissesség",
  "hidratacio-es-elektrolit-egyensuly-fenntartasa": "Hidratáció és elektrolit-egyensúly fenntartása",
  "sziv-es-errendszer-egeszsege": "Szív- és érrendszer egészsége",
  "optimalis-megoldas": "Optimális megoldás",
  "meregtelenites": "Méregtelenítés",
};

function slugToLabel(slug: string) {
  const mapped = CATEGORY_LABELS[slug];
  if (mapped) return mapped;
  return slug
    .split("-")
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : ""))
    .join(" ");
}

function stripHtml(input: string) {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildEmailHtml(params: {
  category: string;
  articles: Array<{ title: string; excerpt: string; url: string }>;
  product?: { name: string; url: string };
  preferencesUrl?: string | null;
  greetingTag?: string | null;
}) {
  const greetingTag = String(params.greetingTag || "").trim();
  const greetingLine = greetingTag ? `Kedves ${greetingTag},` : "Kedves Olvasó,";

  const items = params.articles
    .map(
      (a) => `
        <tr>
          <td style="padding:24px 0;border-bottom:1px solid #eee;">
            <div style="font-size:24px;font-weight:800;margin-bottom:12px;">${escapeHtml(a.title)}</div>
            <div style="color:#111827;line-height:1.75;margin-bottom:14px;font-size:17px;">${escapeHtml(a.excerpt)}</div>
            <div style="margin-top:10px;font-size:16px;">
              <a href="${a.url}" style="color:#c2410c;text-decoration:none;font-weight:700;">Elolvasom →</a>
              <span style="color:#9ca3af;margin:0 8px;">•</span>
              <a href="${a.url}#audio-summary" style="color:#c2410c;text-decoration:none;font-weight:700;">Meghallgatom →</a>
            </div>
          </td>
        </tr>
      `
    )
    .join("");

  const productBlock = params.product
    ? `
      <div style="margin-top:24px;padding:12px;border:1px solid #f2e7e1;border-radius:10px;background:#fff;">
        <div style="font-weight:600;letter-spacing:0.1px;margin-bottom:6px;color:#6b7280;">Ajánlott étrend-kiegészítő</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:8px;color:#111827;">${escapeHtml(params.product.name)}</div>
        <a href="${params.product.url}" style="color:#c2410c;text-decoration:none;font-weight:600;">Megnézem →</a>
      </div>
    `
    : "";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
      <div style="font-size:16px;font-weight:600;margin-bottom:16px;">${greetingLine}</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
        ${items}
      </table>
      ${productBlock}
      <div style="margin-top:22px;color:#6b7280;font-weight:500;font-size:13px;">
        Hosszú és egészséges életet kíván a Sokáig élek csapata.
      </div>
      <div style="margin-top:30px;padding-top:16px;border-top:1px solid #eee;color:#6b7280;font-size:13px;line-height:1.6;">
        Ha nem szeretnél több ilyen értesítést kapni,
        <a href="{{ unsubscribe }}" style="color:#c2410c;text-decoration:none;font-weight:600;">itt tudsz leiratkozni</a>.
        <br />
        Ha módosítanád az adataidat vagy preferenciáidat, írj nekünk:
        <a href="mailto:csakazertis@sokaigelek.hu" style="color:#c2410c;text-decoration:none;font-weight:600;">csakazertis@sokaigelek.hu</a>.
      </div>
    </div>
  `;
}

function getBudapestParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Budapest",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const lookup = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    weekday: lookup("weekday"),
    year: Number(lookup("year")),
    month: Number(lookup("month")),
    day: Number(lookup("day")),
    hour: Number(lookup("hour")),
    minute: Number(lookup("minute")),
  };
}

async function generateOpenAiSubject(params: {
  articleTitle: string;
  articleExcerpt: string;
  categoryLabel: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) return "";

  const prompt = `
Feladat: írj 1 darab magyar nyelvű, kattintásra ösztönző, de nem clickbait e-mail tárgyat egészségcikkhez.

Szabályok:
- maximum 55 karakter
- legyen természetes, emberi és kíváncsiságkeltő
- ne legyen benne kategórianév
- ne legyen benne ilyen: "Sokáig élek értesítés", "új cikk", "hírlevél"
- ne használj csupa nagybetűt
- ne legyen túlzó vagy ijesztgető
- lehetőség szerint problémafelvető vagy okkereső legyen
- csak a tárgyat add vissza, idézőjelek és magyarázat nélkül

Cikk címe: ${params.articleTitle}
Kivonat: ${params.articleExcerpt}
Kategória: ${params.categoryLabel}
`.trim();

  const response = await fetch("https://api.openai.com/v1/responses", {
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

  if (!response.ok) return "";
  const data = await response.json();
  const text = String(
    data?.output_text ||
      data?.output?.map((o: { content?: Array<{ text?: string }> }) => (o.content || []).map((c) => c.text || "").join("")).join("") ||
      ""
  )
    .trim()
    .replace(/^["'„”]+|["'„”]+$/g, "")
    .replace(/\s+/g, " ");

  if (!text) return "";
  return text.slice(0, 55).trim();
}

function buildFallbackSubject(articleTitle: string) {
  const clean = stripHtml(articleTitle).replace(/\s+/g, " ").trim();
  if (!clean) return "Ez lehet a háttérben";
  const lowered = clean.charAt(0).toLowerCase() + clean.slice(1);
  if (lowered.startsWith("mi történik")) {
    return lowered.replace(/^mi történik/i, "Ez lehet a háttérben");
  }
  if (lowered.startsWith("mit jelez")) {
    return lowered.replace(/^mit jelez/i, "Ezt jelezheti");
  }
  if (lowered.startsWith("miért")) {
    return clean;
  }
  if (lowered.startsWith("hogyan")) {
    return clean;
  }
  return clean.length > 55 ? `${clean.slice(0, 52).trim()}...` : clean;
}

function resolveDigestHours(rawHours: string | null) {
  if (rawHours) {
    return Math.max(1, Math.min(24 * 14, Number(rawHours || "24")));
  }
  return 24;
}

function resolveArticleWindowDate(article: { published_at?: string | null; updated_at?: string | null; created_at?: string | null }) {
  return article.published_at || article.updated_at || article.created_at || null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") || "";
  const expected = process.env.CRON_SECRET || "";
  const cronHeader = req.headers.get("x-vercel-cron");
  const isVercelCron = cronHeader === "1" || cronHeader === "true";
  const ua = req.headers.get("user-agent") || "";
  const isVercelCronUa = ua.toLowerCase().includes("vercel-cron/");
  if (!(isVercelCron || isVercelCronUa) && (!expected || secret !== expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const budapestNow = getBudapestParts();
  const hours = resolveDigestHours(searchParams.get("hours"));
  const force = searchParams.get("force") === "1" || searchParams.get("force") === "true";
  const onlyCategory = String(searchParams.get("category") || "").trim();
  const allowedWeekdays = new Set(["Tue", "Wed", "Thu"]);
  const withinSendWindow = allowedWeekdays.has(budapestNow.weekday) && budapestNow.hour === 14 && budapestNow.minute === 0;

  if (!force && !withinSendWindow) {
    return NextResponse.json({
      ok: true,
      skipped: "outside_send_window",
      budapest: budapestNow,
      rule: "Newsletter sends Tuesday, Wednesday, and Thursday at 14:00 Europe/Budapest time.",
    });
  }

  const end = new Date();
  const start = new Date(Date.now() - hours * 60 * 60 * 1000);

  const fromEmail = process.env.BREVO_FROM_EMAIL || process.env.MAILERLITE_FROM_EMAIL || "";
  const fromName = process.env.BREVO_FROM_NAME || process.env.MAILERLITE_FROM_NAME || "";
  const replyTo = process.env.BREVO_REPLY_TO || process.env.MAILERLITE_REPLY_TO || "";
  const preferencesTag =
    process.env.BREVO_PREFERENCES_TAG || process.env.MAILERLITE_PREFERENCES_TAG || "{{ update_profile }}";
  const rawNameTag =
    process.env.BREVO_FIRST_NAME_TAG || process.env.MAILERLITE_FIRST_NAME_TAG || "{{ contact.FIRSTNAME }}";
  const firstNameTag = rawNameTag.trim();
  if (!fromEmail || !fromName) {
    return NextResponse.json({ error: "Missing BREVO_FROM_EMAIL or BREVO_FROM_NAME" }, { status: 500 });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.sokaigelek.hu").replace(/\/$/, "");
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const { data: articles, error } = await supabaseServer
    .from("articles")
    .select("id, title, slug, excerpt, category_slug, published_at, updated_at, created_at, related_product_slugs, status")
    .eq("status", "published")
    .or(`published_at.gte.${startIso},updated_at.gte.${startIso},created_at.gte.${startIso}`);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const windowedArticles = (articles || [])
    .filter((article) => {
      const effectiveDate = resolveArticleWindowDate(article);
      if (!effectiveDate) return false;
      return effectiveDate >= startIso && effectiveDate < endIso;
    })
    .sort((a, b) => {
      const aDate = resolveArticleWindowDate(a) || "";
      const bDate = resolveArticleWindowDate(b) || "";
      return bDate.localeCompare(aDate);
    });

  const byCategory = new Map<string, typeof articles>();
  for (const a of windowedArticles) {
    const cat = String(a.category_slug || "").trim();
    if (!cat) continue;
    if (onlyCategory && cat !== onlyCategory) continue;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(a);
  }

  const results: Array<{ category: string; campaignId?: string; count: number; ok: boolean; error?: string; subject?: string }> = [];
  for (const [category, items] of byCategory.entries()) {
    try {
      const dateLabel = `${budapestNow.year}-${String(budapestNow.month).padStart(2, "0")}-${String(budapestNow.day).padStart(2, "0")}`;
      const sentSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentLogs } = await supabaseServer
        .from("email_logs")
        .select("article_ids, sent_at")
        .eq("category_slug", category)
        .gte("sent_at", sentSince)
        .order("sent_at", { ascending: false })
        .limit(100);

      const alreadySentArticleIds = new Set<string>();
      for (const log of recentLogs || []) {
        const ids = Array.isArray((log as { article_ids?: unknown[] }).article_ids)
          ? (log as { article_ids?: unknown[] }).article_ids || []
          : [];
        for (const id of ids) {
          const normalized = String(id || "").trim();
          if (normalized) alreadySentArticleIds.add(normalized);
        }
      }

      const pendingItems = force
        ? items
        : items.filter((a: { id?: string | null }) => !alreadySentArticleIds.has(String(a?.id || "").trim()));
      if (!pendingItems.length) {
        results.push({ category, count: items.length, ok: true });
        continue;
      }

      const groupId = await getOrCreateGroupId(category);
      const label = slugToLabel(category);
      const articleCards = pendingItems.map((a: { title?: string | null; excerpt?: string | null; slug?: string | null }) => ({
        title: String(a.title || "").trim(),
        excerpt: String(a.excerpt || "").trim(),
        url: `${siteUrl}/cikkek/${a.slug}`,
      }));

      let featuredProduct: { name: string; url: string } | undefined;
      const firstWithProduct = pendingItems.find(
        (a: { related_product_slugs?: string[] | null }) => Array.isArray(a.related_product_slugs) && a.related_product_slugs.length > 0
      );
      if (firstWithProduct) {
        const slug = String((firstWithProduct.related_product_slugs || [])[0] || "").trim();
        if (slug) {
          const { data: product } = await supabaseServer
            .from("products")
            .select("slug, name")
            .eq("slug", slug)
            .maybeSingle();
          if (product) {
            const link = `${siteUrl}/termek/${product.slug}`;
            featuredProduct = { name: product.name || product.slug, url: link };
          }
        }
      }

      const heroArticle = pendingItems[0];
      const aiSubject =
        heroArticle && heroArticle.title
          ? await generateOpenAiSubject({
              articleTitle: String(heroArticle.title || "").trim(),
              articleExcerpt: String(heroArticle.excerpt || "").trim(),
              categoryLabel: label,
            })
          : "";
      const finalSubject = aiSubject || buildFallbackSubject(String(heroArticle?.title || ""));

      const html = buildEmailHtml({
        category: label,
        articles: articleCards,
        product: featuredProduct,
        preferencesUrl: preferencesTag || null,
        greetingTag: firstNameTag || null,
      });

      const campaign = await createCampaign({
        name: `digest-${category}-${dateLabel}`,
        subject: finalSubject,
        fromName,
        fromEmail,
        replyTo: replyTo || undefined,
        html,
        groupId,
      });

      await scheduleCampaignNow(campaign.data.id);

      await supabaseServer.from("email_logs").insert({
        category_slug: category,
        article_ids: pendingItems.map((a: { id?: string | null }) => a.id),
        campaign_id: campaign.data.id,
        sent_at: new Date().toISOString(),
      });

      results.push({ category, campaignId: campaign.data.id, count: items.length, ok: true, subject: finalSubject });
    } catch (err: unknown) {
      results.push({
        category,
        count: items.length,
        ok: false,
        error: err instanceof Error ? err.message : "error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    start: start.toISOString(),
    end: end.toISOString(),
    categories: results,
  });
}
