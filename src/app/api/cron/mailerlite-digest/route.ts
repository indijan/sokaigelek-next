import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { createCampaign, getOrCreateGroupId, scheduleCampaignNow } from "@/lib/mailerlite";

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

function withAz(label: string) {
  const trimmed = label.trim();
  const first = trimmed[0]?.toLowerCase() || "";
  const vowels = new Set(["a", "á", "e", "é", "i", "í", "o", "ó", "ö", "ő", "u", "ú", "ü", "ű"]);
  return `${vowels.has(first) ? "az" : "a"} ${trimmed}`;
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
  const greetingLine = params.greetingTag ? `Kedves ${params.greetingTag},` : "Kedves Olvasó,";

  const items = params.articles
    .map(
      (a) => `
        <tr>
          <td style="padding:22px 0;border-bottom:1px solid #eee;">
            <div style="font-size:20px;font-weight:700;margin-bottom:10px;">${escapeHtml(a.title)}</div>
            <div style="color:#222;line-height:1.7;margin-bottom:12px;">${escapeHtml(a.excerpt)}</div>
            <div style="margin-top:10px;">
              <a href="${a.url}" style="color:#c2410c;text-decoration:none;font-weight:600;">Elolvasom →</a>
              <span style="color:#9ca3af;margin:0 8px;">•</span>
              <a href="${a.url}#audio-summary" style="color:#c2410c;text-decoration:none;font-weight:600;">Meghallgatom →</a>
            </div>
          </td>
        </tr>
      `
    )
    .join("");

  const productBlock = params.product
    ? `
      <div style="margin-top:28px;padding:14px;border:1px solid #f2e7e1;border-radius:10px;background:#fffaf7;">
        <div style="font-weight:700;letter-spacing:0.1px;margin-bottom:6px;">Ajánlott étrend-kiegészítő</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:8px;">${escapeHtml(params.product.name)}</div>
        <a href="${params.product.url}" style="color:#c2410c;text-decoration:none;font-weight:600;">Megnézem →</a>
      </div>
    `
    : "";

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
      <div style="font-size:16px;font-weight:600;margin-bottom:14px;">${greetingLine}</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
        ${items}
      </table>
      ${productBlock}
      <div style="margin-top:24px;color:#4b5563;font-weight:500;font-size:14px;">
        Hosszú és egészséges életet kíván a Sokáig élek csapata.
      </div>
      ${
        params.preferencesUrl
          ? `
        <div style="margin-top:30px;padding-top:16px;border-top:1px solid #eee;color:#6b7280;font-size:13px;line-height:1.5;">
          Szeretnél más kategóriákról is értesülni vagy változtatni az adataidon?
          <a href="${params.preferencesUrl}" style="color:#c2410c;text-decoration:none;font-weight:600;">Itt tudod beállítani</a>.
        </div>
      `
          : ""
      }
    </div>
  `;
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

  const hours = Math.max(1, Math.min(72, Number(searchParams.get("hours") || "24")));
  const end = new Date();
  const start = new Date(Date.now() - hours * 60 * 60 * 1000);

  const fromEmail = process.env.MAILERLITE_FROM_EMAIL || "";
  const fromName = process.env.MAILERLITE_FROM_NAME || "";
  const replyTo = process.env.MAILERLITE_REPLY_TO || "";
  const preferencesTag = process.env.MAILERLITE_PREFERENCES_TAG || "{$preferences}";
  const firstNameTag = process.env.MAILERLITE_FIRST_NAME_TAG || "{$name}";
  if (!fromEmail || !fromName) {
    return NextResponse.json({ error: "Missing MAILERLITE_FROM_EMAIL or MAILERLITE_FROM_NAME" }, { status: 500 });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.sokaigelek.hu").replace(/\/$/, "");

  const { data: articles, error } = await supabaseServer
    .from("articles")
    .select("id, title, slug, excerpt, category_slug, published_at, related_product_slugs, status")
    .eq("status", "published")
    .gte("published_at", start.toISOString())
    .lt("published_at", end.toISOString())
    .order("published_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byCategory = new Map<string, typeof articles>();
  for (const a of articles || []) {
    const cat = String(a.category_slug || "").trim();
    if (!cat) continue;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(a);
  }

  const results: Array<{ category: string; campaignId?: string; count: number; ok: boolean; error?: string }> = [];
  for (const [category, items] of byCategory.entries()) {
    try {
      const groupId = await getOrCreateGroupId(category);
      const label = slugToLabel(category);
      const articleCards = items.map((a) => ({
        title: String(a.title || "").trim(),
        excerpt: String(a.excerpt || "").trim(),
        url: `${siteUrl}/cikkek/${a.slug}`,
      }));

      let featuredProduct: { name: string; url: string } | undefined;
      const firstWithProduct = items.find(
        (a: any) => Array.isArray(a.related_product_slugs) && a.related_product_slugs.length > 0
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

      const html = buildEmailHtml({
        category: label,
        articles: articleCards,
        product: featuredProduct,
        preferencesUrl: preferencesTag || null,
        greetingTag: firstNameTag || null,
      });

      const campaign = await createCampaign({
        name: `digest-${category}-${end.toISOString().slice(0, 10)}`,
        subject: `Sokáig élek értesítés: új cikk ${withAz(label)} kategóriában`,
        fromName,
        fromEmail,
        replyTo: replyTo || undefined,
        html,
        groupId,
      });

      await scheduleCampaignNow(campaign.data.id);

      await supabaseServer.from("email_logs").insert({
        category_slug: category,
        article_ids: items.map((a: any) => a.id),
        campaign_id: campaign.data.id,
        sent_at: new Date().toISOString(),
      });

      results.push({ category, campaignId: campaign.data.id, count: items.length, ok: true });
    } catch (err: any) {
      results.push({ category, count: items.length, ok: false, error: err?.message || "error" });
    }
  }

  return NextResponse.json({
    ok: true,
    start: start.toISOString(),
    end: end.toISOString(),
    categories: results,
  });
}
