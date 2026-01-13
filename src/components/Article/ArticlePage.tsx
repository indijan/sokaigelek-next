import ArticleSection from "./ArticleSection";
import ProductSlot from "./ProductSlot";

import Link from "next/link";
import { cdnImageUrl } from "@/lib/cdn";

function splitHtmlByProductMarkers(html: string) {
  const re = /<!--\s*PRODUCT:([a-z0-9-]+)\s*-->/gi;
  const parts: Array<{ type: "html"; value: string } | { type: "product"; slug: string }> = [];

  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(html)) !== null) {
    const slug = (m[1] || "").toLowerCase();
    const start = m.index;
    const end = re.lastIndex;

    const before = html.slice(lastIndex, start);
    if (before) parts.push({ type: "html", value: before });

    if (slug) parts.push({ type: "product", slug });

    lastIndex = end;
  }

  const tail = html.slice(lastIndex);
  if (tail) parts.push({ type: "html", value: tail });

  return parts;
}

// DB-ből jövő (Supabase) forma – lazán tipizálva, hogy a régi mock is működjön
export type DbArticle = {
  id?: string;
  slug?: string;
  title?: string;
  category?: string | null; // régi mock
  category_slug?: string | null; // új DB
  excerpt?: string | null;
  intro?: string | null; // régi mock
  content_html?: string | null;
  related_product_slugs?: string[] | null;
  cover_image_url?: string | null;
  // régi mock struktúra
  sections?: any[];
  productSlots?: any[];
};

export default function ArticlePage({ article }: { article: DbArticle }) {
  const categoryLabel =
    (article.category ?? null) ||
    (article.category_slug ?? null) ||
    "";

  const introText = (article.intro ?? null) || (article.excerpt ?? null) || "";

  // Ha van strukturált section, használjuk a régi layoutot
  const hasSections = Array.isArray(article.sections) && article.sections.length > 0;

  return (
    <article className="max-w-3xl mx-auto px-4 py-10 space-y-10">
      {article.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
              src={cdnImageUrl(article.cover_image_url)}
              alt={article.title || "Borítókép"}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="w-full rounded-2xl border"
          />
      ) : null}
      <header className="space-y-4">
        {categoryLabel ? (
          <p className="text-sm uppercase tracking-wide text-gray-500">
            {categoryLabel}
          </p>
        ) : null}

        <h1 className="text-3xl md:text-4xl font-bold">{article.title}</h1>

        {introText ? (
          <p className="text-lg text-gray-700">{introText}</p>
        ) : null}
      </header>

      {hasSections ? (
        (article.sections as any[]).map((section, index) => (
          <div key={index} className="space-y-8">
            <ArticleSection section={section} />

            {Array.isArray(article.productSlots)
              ? (article.productSlots as any[])
                  .filter((s) => s.afterSection === index)
                  .map((slot, i) => <ProductSlot key={i} slot={slot} />)
              : null}
          </div>
        ))
      ) : (
        <div className="prose max-w-none">
          {/* DB-ből HTML-ként jön */}
          {splitHtmlByProductMarkers(article.content_html || "").map((part, idx) => {
            if (part.type === "html") {
              return (
                <div
                  key={idx}
                  suppressHydrationWarning
                  dangerouslySetInnerHTML={{ __html: part.value }}
                />
              );
            }

            // termék beágyazás a cikk közepén (affiliate mérésen keresztül)
            return (
              <div
                key={`${part.slug}-${idx}`}
                className="not-prose border rounded-2xl p-5 my-6 card-hover"
              >
                <Link
                  href={`/termek/${part.slug}`}
                  className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-black/30"
                >
                  <div className="font-semibold text-lg">{part.slug.replace(/-/g, " ")}</div>
                  <div className="text-sm text-gray-600 mt-1">Ajánlott a cikk ezen pontján</div>
                </Link>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/termek/${part.slug}`}
                    className="inline-flex justify-center rounded-lg border px-4 py-2 text-sm"
                  >
                    Részletek
                  </Link>

                  <a
                    href={`/out/${part.slug}?to=1`}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex justify-center rounded-lg bg-black text-white px-4 py-2 text-sm"
                  >
                    Megnézem (1)
                  </a>
                  <a
                    href={`/out/${part.slug}?to=2`}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex justify-center rounded-lg border px-4 py-2 text-sm"
                  >
                    Megnézem (2)
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
