import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import ShareButtons from "@/components/Article/ShareButtons";
import { cdnImageUrl } from "@/lib/cdn";

type Props = {
  params: Promise<{ slug: string }>;
};

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildDescription(article: any): string {
  const fromExcerpt = String(article?.excerpt || "").trim();
  if (fromExcerpt) return fromExcerpt.slice(0, 180);

  const html = String(article?.content_html || article?.html || "");
  const text = stripHtml(html);
  return text ? text.slice(0, 180) : "";
}

function safeHtml(article: any): string {
  // Normalize newlines so SSR and client hydration see identical HTML text.
  return String(article?.content_html || article?.html || "").replace(/\r\n/g, "\n");
}

function rewriteImageSrcInHtml(html: string): string {
  if (!html) return html;
  return html.replace(/<img\b[^>]*\bsrc=(["'])(.*?)\1/gi, (match, quote, src) => {
    const updated = cdnImageUrl(String(src));
    if (!updated || updated === src) return match;
    return match.replace(src, updated);
  });
}

function extractProductSlugsFromHtml(html: string): string[] {
  const slugs = new Set<string>();
  const re = /<!--\s*PRODUCT:([\w-]+)\s*-->/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) slugs.add(String(m[1]).trim().toLowerCase());
  }
  return Array.from(slugs);
}

function buildRecommendationLine(product: any, slug: string): string {
  const rawTags = Array.isArray(product?.tags) ? product.tags : [];
  const tag = String(rawTags[0] || "").trim();
  const name = String(product?.name || product?.title || slug).trim();
  const fallback = name ? `${name} ehhez a részhez különösen jól passzol.` : "Ehhez a részhez ezt ajánlom neked.";

  if (!tag) return fallback;

  const tagKey = tag
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const templates: Record<string, string> = {
    antioxidans: "Ha antioxidánst keresel, ezt ajánlom neked.",
    antioxidansok: "Ha antioxidánsokat keresel, ezt ajánlom neked.",
    kollagen: "Kollagénhiány esetén ezt nézd meg.",
    kollagenhiany: "Kollagénhiány esetén ezt nézd meg.",
    immun: "Ha az immunrendszeredet támogatnád, ezt nézd meg.",
    immunrendszer: "Ha az immunrendszeredet támogatnád, ezt nézd meg.",
    emesztes: "Ha az emésztésedet szeretnéd támogatni, ezt ajánlom neked.",
    emesztesi: "Ha emésztési támogatást keresel, ezt ajánlom neked.",
    energia: "Ha több energiára vágysz, ezt nézd meg.",
    stressz: "Ha stresszcsökkentésre keresel megoldást, ezt ajánlom.",
    alvas: "Ha jobb alvást szeretnél, ezt ajánlom neked.",
    bor: "Ha a bőrödet szeretnéd támogatni, ezt nézd meg.",
    bortaplalas: "Ha bőrtáplálásra keresel megoldást, ezt ajánlom.",
    hidratacio: "Ha a hidratáció a fókusz, ezt nézd meg.",
    izulet: "Ha ízületi támogatásra van szükséged, ezt nézd meg.",
    izuleti: "Ha ízületi támogatásra van szükséged, ezt nézd meg.",
    gyulladas: "Ha gyulladáscsökkentésen dolgozol, ezt ajánlom.",
    gyulladascsokkentes: "Ha gyulladáscsökkentésen dolgozol, ezt ajánlom.",
    emlekezet: "Ha az emlékezettel kapcsolatos támogatást keresel, ezt nézd meg.",
    fokusz: "Ha fókuszra és koncentrációra van szükséged, ezt ajánlom.",
  };

  return templates[tagKey] || `Ha a(z) ${tag} témában keresel megoldást, ezt ajánlom neked.`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildInlineProductHtml(product: any, slug: string, sideClass: string): string {
  const title = String(product?.name || product?.title || slug);
  const safeTitle = escapeHtml(title);
  const safeSlug = encodeURIComponent(slug);
  const url = `/termek/${safeSlug}`;
  const img = product?.image_url || product?.cover_image_url || product?.image || null;
  const imgTag = img
    ? `<img src="${escapeHtml(cdnImageUrl(String(img)))}" alt="${safeTitle}" style="width:100%;height:100%;object-fit:cover;" />`
    : "";
  const excerptHtml = String(product?.excerpt || product?.short_description || "").trim();
  const excerptBlock = excerptHtml
    ? `<div class="article-product-excerpt" style="font-size:14px;line-height:1.5;opacity:0.85;margin-bottom:10px;">${excerptHtml}</div>`
    : "";
  const recommendation = escapeHtml(buildRecommendationLine(product, slug));

  return `
    <div class="article-embed${sideClass}">
      <div class="article-product-card card-hover" style="border:1px solid rgba(0,0,0,0.08);border-radius:18px;padding:14px;background:rgba(255,255,255,0.75);box-shadow:0 10px 28px rgba(0,0,0,0.05);">
        <div style="font-size:12px;opacity:0.75;font-weight:700;margin-bottom:10px;">${recommendation}</div>
        <a href="${url}" style="display:grid;grid-template-columns:84px minmax(0, 1fr);gap:12px;align-items:center;text-decoration:none;">
          <div style="width:84px;height:84px;border-radius:16px;overflow:hidden;background:rgba(0,0,0,0.04);border:1px solid rgba(0,0,0,0.06);">
            ${imgTag}
          </div>
          <div style="min-width:0;">
            <div style="font-weight:900;line-height:1.2;font-size:18px;margin-bottom:6px;">${safeTitle}</div>
            ${excerptBlock}
            <span class="btn btn-sm" style="display:inline-flex;align-items:center;gap:8px;padding:10px 12px;border-radius:999px;border:1px solid rgba(0,0,0,0.10);background:rgba(255,255,255,0.9);font-weight:800;font-size:14px;width:fit-content;">
              Megnézem <span aria-hidden="true">→</span>
            </span>
          </div>
        </a>
      </div>
    </div>
  `;
}

function injectProductEmbedsIntoHtml(html: string, productsBySlug: Record<string, any>): string {
  const re = /<!--\s*PRODUCT:([\w-]+)\s*-->/g;
  let embedIndex = 0;
  return html.replace(re, (_match, slugRaw) => {
    const slug = String(slugRaw || "").trim().toLowerCase();
    if (!slug) return "";
    const sideClass = embedIndex % 2 === 0 ? "" : " left";
    embedIndex += 1;
    return buildInlineProductHtml(productsBySlug[slug], slug, sideClass);
  });
}

function formatDate(input?: string | null): string {
  if (!input) return "";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("hu-HU", { year: "numeric", month: "long", day: "numeric" });
}

function IconArrowLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  const { data: article } = await supabaseServer
    .from("articles")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!article) {
    return {
      title: "Cikk nem található",
      robots: { index: false, follow: false },
    };
  }

  const siteName = "Sokaigelek";
  const title = article.title ? `${article.title} | ${siteName}` : siteName;
  const description = buildDescription(article);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const metadataBase = new URL(siteUrl);
  const canonicalPath = `/cikkek/${slug}`;
  const canonical = new URL(canonicalPath, metadataBase).toString();

  const ogImage = article.cover_image_url ? [article.cover_image_url] : undefined;

  return {
    metadataBase,
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      siteName,
      images: ogImage,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImage,
    },
  };
}

export default async function ArticlePageRoute({ params }: Props) {
  const { slug } = await params;

  const { data: article, error } = await supabaseServer
    .from("articles")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (error || !article) notFound();

  // --- Prev / Next (by published_at -> created_at fallback) ---
  const sortField = article?.published_at ? "published_at" : article?.created_at ? "created_at" : null;
  const sortValue = sortField ? (article as any)[sortField] : null;

  let prevArticle: any = null;
  let nextArticle: any = null;

  if (sortField && sortValue) {
    const [prevRes, nextRes] = await Promise.all([
      supabaseServer
        .from("articles")
        .select("id, title, slug, cover_image_url, excerpt, published_at, created_at")
        .eq("status", "published")
        .lt(sortField, sortValue)
        .order(sortField, { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseServer
        .from("articles")
        .select("id, title, slug, cover_image_url, excerpt, published_at, created_at")
        .eq("status", "published")
        .gt(sortField, sortValue)
        .order(sortField, { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    prevArticle = prevRes.data || null;
    nextArticle = nextRes.data || null;
  }

  const relatedProductSlugs = Array.isArray((article as any).related_product_slugs)
    ? (article as any).related_product_slugs.filter(Boolean)
    : [];

  // --- Inline product placeholders ---
  const contentHtml = safeHtml(article);
  const inlineProductSlugs = extractProductSlugsFromHtml(contentHtml);

  const inlineProductsMap: Record<string, any> = {};
  if (inlineProductSlugs.length) {
    const { data: inlineProducts } = await supabaseServer
      .from("products")
      .select("*")
      .in("slug", inlineProductSlugs);

    (inlineProducts || []).forEach((p: any) => {
      if (p?.slug) inlineProductsMap[String(p.slug).toLowerCase()] = p;
    });
  }

  const contentWithEmbeds = injectProductEmbedsIntoHtml(contentHtml, inlineProductsMap);
  const contentWithImages = rewriteImageSrcInHtml(contentWithEmbeds);

  const coverRaw = (article as any).cover_image_url || (article as any).image_url || null;
  const coverUrl = coverRaw ? cdnImageUrl(String(coverRaw)) : null;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://sokaigelek.hu";
  const shareUrl = `${siteUrl.replace(/\/$/, "")}/cikkek/${article.slug}`;
  const dateLabel = formatDate((article as any).published_at || (article as any).created_at || null);

  return (
    <main className="container page">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .article-prose h2{margin:1.25rem 0 .5rem;font-size:1.6rem;line-height:1.2;font-weight:900;}
        .article-prose h3{margin:1rem 0 .4rem;font-size:1.25rem;line-height:1.25;font-weight:800;}
        .article-prose p{margin:.85rem 0;}
        .article-prose a{color:inherit;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px;}
        .article-prose ul{list-style:disc;list-style-position:outside;padding-left:1.9rem;margin:1rem 0;}
        .article-prose ol{list-style:decimal;list-style-position:outside;padding-left:2.0rem;margin:1rem 0;}
        .article-prose li{margin:.4rem 0;padding-left:.15rem;}
        .article-prose blockquote{margin:1rem 0;padding:.8rem 1rem;border-left:4px solid rgba(194,65,11,.55);background:rgba(194,65,11,.06);border-radius:14px;}
        .article-prose hr{border:none;border-top:1px solid rgba(0,0,0,.10);margin:1.25rem 0;}
        .article-prose img{max-width:100%;height:auto;border-radius:16px;display:block;object-fit:cover;}
        .article-prose table{width:100%;border-collapse:collapse;margin:1rem 0;}
        .article-prose th,.article-prose td{border:1px solid rgba(0,0,0,.10);padding:.6rem .7rem;}
        .article-prose strong{font-weight:900;}
        .article-prose .article-product-card{border-color:rgba(194,65,11,0.18) !important;}
                /* Text-wrap helpers for images (WP-style classes) */
        .article-prose img.alignleft,
        .article-prose figure.alignleft,
        .article-prose .alignleft img{
          float:left;
          width:min(320px, 33%);
          margin:.35rem 1.1rem .9rem 0;
        }
        .article-prose img.alignright,
        .article-prose figure.alignright,
        .article-prose .alignright img{
          float:right;
          width:min(320px, 33%);
          margin:.35rem 0 .9rem 1.1rem;
        }
        .article-prose img.aligncenter,
        .article-prose figure.aligncenter,
        .article-prose .aligncenter img{
          display:block;
          margin:1rem auto;
          float:none;
          width:min(760px, 100%);
        }

        /* Embedded blocks (products, callouts) that should allow text wrap */
        .article-prose .article-embed{
          float:right;
          width:min(360px, 33%);
          margin:.4rem 0 1rem 1.1rem;
        }
        .article-prose .article-embed.left{
          float:left;
          margin:.4rem 1.1rem 1rem 0;
        }
        .article-prose .article-embed .article-product-card{
          width:100%;
          margin:0 !important;
        }
        .article-prose .related-products-cta{
          display:inline-flex;
          align-items:center;
          gap:10px;
          padding:12px 18px;
          border-radius:999px;
          border:1px solid rgba(0,0,0,0.12);
          background:linear-gradient(180deg, rgba(255,255,255,0.95), rgba(248,250,252,0.95));
          font-weight:800;
          text-decoration:none;
          box-shadow:0 10px 24px rgba(0,0,0,0.08);
          transition:transform .18s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease;
        }
        .article-prose .related-products-cta:hover{
          transform:translateY(-1px);
          border-color:rgba(194,65,11,0.4);
          box-shadow:0 14px 28px rgba(194,65,11,0.18);
          background:linear-gradient(180deg, rgba(255,255,255,1), rgba(255,247,242,0.98));
        }

        /* Clear floats at the end of the main content so next sections don't slide up */
        .article-prose::after{
          content:"";
          display:block;
          clear:both;
        }

        @media (max-width: 860px){
          .article-prose{padding:22px 16px !important;}
          .article-intro{padding:14px 16px !important;}
          .article-prose .related-products-cta{font-size:14px;padding:10px 14px;}
          .article-prose img.alignleft,
          .article-prose figure.alignleft,
          .article-prose .alignleft img,
          .article-prose img.alignright,
          .article-prose figure.alignright,
          .article-prose .alignright img,
          .article-prose .article-embed,
          .article-prose .article-embed.left{
            float:none;
            width:100%;
            margin:1rem 0;
          }
        }
      `,
        }}
      />
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 14, opacity: 0.9 }}>
        <Link href="/" style={{ textDecoration: "none" }}>Főoldal</Link>
        <span aria-hidden="true">/</span>
        <Link href="/cikkek" style={{ textDecoration: "none" }}>Jóllét Kalauz</Link>
        <span aria-hidden="true">/</span>
        <span style={{ opacity: 0.8 }}>{article.title}</span>
      </nav>

      {/* Hero */}
      <header style={{ marginTop: 16, marginBottom: 18 }}>
        <h1 className="article-title" style={{ fontSize: 40, lineHeight: 1.15, margin: "10px 0 8px", letterSpacing: "-0.02em" }}>
          {article.title}
        </h1>
        {dateLabel ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>Közzétéve: {dateLabel}</div>
        ) : null}

        {coverUrl ? (
          <div
            className="article-cover"
            style={{
              marginTop: 16,
              borderRadius: 18,
              overflow: "hidden",
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coverUrl}
              alt={article.title}
              style={{ width: "100%", height: "auto", display: "block", aspectRatio: "16/9", objectFit: "cover" }}
            />
          </div>
        ) : null}

        {String(article.excerpt || "").trim() ? (
          <div
            className="article-intro"
            style={{
              marginTop: 16,
              width: "100%",
              background: "rgba(194,65,11,0.06)",
              border: "1px solid rgba(194,65,11,0.18)",
              borderRadius: 18,
              padding: "16px 28px",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", opacity: 0.85, marginBottom: 6 }}>
              Röviden
            </div>
            <p style={{ margin: 0, fontSize: 18, lineHeight: 1.65, opacity: 0.92 }}>{article.excerpt}</p>
          </div>
        ) : null}
      </header>

      {/* Content + Sidebar */}
      <section
        className="article-layout"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 24,
          alignItems: "start",
        }}
      >
        <article
          className="article-prose"
          style={{
            background: "rgba(255,255,255,0.75)",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 18,
            padding: "30px 28px",
            boxShadow: "0 10px 28px rgba(0,0,0,0.05)",
            fontSize: 17,
            lineHeight: 1.75,
          }}
        >
          <div
            className="article-html-block"
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: contentWithImages }}
          />
          {relatedProductSlugs.length ? (
            <div style={{ marginTop: 24, display: "flex", justifyContent: "center" }}>
              <Link
                href={`/termek?slugs=${encodeURIComponent(relatedProductSlugs.join(","))}`}
                className="related-products-cta"
              >
                A témához kapcsolódó Étrend-kiegészítők megtekintése
                <span aria-hidden>→</span>
              </Link>
            </div>
          ) : null}
          <ShareButtons url={shareUrl} title={article.title || ""} />
        </article>
      </section>

      {/* Prev / Next */}
      {(prevArticle || nextArticle) ? (
        <section style={{ marginTop: 26, display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {prevArticle ? (
            <Link
              href={`/cikkek/${prevArticle.slug}`}
              style={{
                textDecoration: "none",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 16,
                padding: 14,
                display: "flex",
                gap: 12,
                alignItems: "center",
                background: "rgba(255,255,255,0.7)",
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 999, border: "1px solid rgba(0,0,0,0.12)" }}>
                <IconArrowLeft />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 2 }}>Előző cikk</div>
                <div style={{ fontWeight: 800, lineHeight: 1.25, overflowWrap: "anywhere" }}>
                  {prevArticle.title}
                </div>
              </div>
            </Link>
          ) : null}

          {nextArticle ? (
            <Link
              href={`/cikkek/${nextArticle.slug}`}
              style={{
                textDecoration: "none",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 16,
                padding: 14,
                display: "flex",
                gap: 12,
                alignItems: "center",
                justifyContent: "space-between",
                background: "rgba(255,255,255,0.7)",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 2 }}>Következő cikk</div>
                <div style={{ fontWeight: 800, lineHeight: 1.25, overflowWrap: "anywhere" }}>
                  {nextArticle.title}
                </div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 999, border: "1px solid rgba(0,0,0,0.12)" }}>
                <IconArrowRight />
              </span>
            </Link>
          ) : null}
        </section>
      ) : null}

    </main>
  );
}
