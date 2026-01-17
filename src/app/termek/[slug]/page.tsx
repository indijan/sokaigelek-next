import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabaseServer";
import { formatHuf } from "@/lib/formatHuf";
import { cdnImageUrl } from "@/lib/cdn";
import "../product.css";

export const revalidate = 3600;

type Props = {
    params: Promise<{ slug: string }>;
};

// Helper to sanitize remote image URLs
function safeRemoteImageUrl(url: any): string | null {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;

  // Only allow http(s) URLs
  if (!/^https?:\/\//i.test(raw)) return null;

  // If the URL contains obvious mojibake / control-ish chars, drop it.
  // (This prevents Next image optimizer / browser from choking on broken WP filenames like "¬Æ".)
  if (/[\u0000-\u001F\u007F\u00AC\u00C3\u00C5]/.test(raw)) return null;

  return cdnImageUrl(raw);
}

function buildProductDescription(product: any): string {
  if (product?.short) return String(product.short).slice(0, 180);
  if (product?.description) return String(product.description).slice(0, 180);
  return "";
}

function stripHtml(input: string) {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function productCardImage(url: any): string {
  return safeRemoteImageUrl(url) || "/images/placeholder-product.jpg";
}

function asArray(value: any): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    // vesszővel elválasztott lista támogatás
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function renderHtml(html?: string) {
  const safe = (html || "").trim();
  if (!safe) return null;
  return (
    <div
      className="prose prose-neutral max-w-none"
      // admin felületből jön, ezért itt engedjük (később sanitizálható)
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

function parseNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v > 0 ? v : null;
  if (typeof v === "string") {
    const cleaned = v.replace(/\s/g, "").replace(/,/g, ".");
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  const { data: product } = await supabaseServer
    .from("products")
    .select("name, short, description, image_url, status")
    .eq("slug", slug)
    .single();

  const status = String((product as any)?.status || "").trim();
  const isDraft = status && status !== "published";

  if (!product || isDraft) {
    return {
      title: "Termék nem található",
      robots: { index: false, follow: false },
    };
  }

  const siteName = "Sokaigelek";
  const title = product.name ? `${product.name} | ${siteName}` : siteName;
  const description = buildProductDescription(product);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const metadataBase = new URL(siteUrl);
  const canonicalPath = `/termek/${slug}`;

  const safeImg = safeRemoteImageUrl((product as any)?.image_url);
  const ogImage = safeImg ? [safeImg] : undefined;

  return {
    metadataBase,
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "website",
      title,
      description,
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

// --- Helper Components ---
function QuickTipBox() {
  return (
    <div className="rounded-2xl border bg-gradient-to-b from-white to-gray-50 p-4 text-sm text-gray-700">
      <div className="font-semibold text-gray-900">Gyors tipp</div>
      <div className="mt-1">
        Írd be a tüneted vagy célod a <a className="underline hover:text-gray-900" href="/kereses">keresőbe</a>,
        és az oldal a legrelevánsabb cikkeket + termékeket adja.
      </div>
    </div>
  );
}

function BuyBox({
  product,
  discountPct,
  hasAnyPrice,
  basePrice,
  sokaigelekPrice,
}: {
  product: any;
  discountPct: number | null;
  hasAnyPrice: boolean;
  basePrice: number | null;
  sokaigelekPrice: number | null;
}) {
  const clubPrice = basePrice !== null ? basePrice * 0.7 : null;
  const affiliateLabel1 = String(product?.affiliate_label_1 || "").trim();
  const affiliateUrl1 = String(product?.affiliate_url_1 || "").trim();
  const affiliateLabel2 = String(product?.affiliate_label_2 || "").trim();
  const affiliateUrl2 = String(product?.affiliate_url_2 || "").trim();
  const hasAffiliate1 = affiliateLabel1 && affiliateUrl1;
  const hasAffiliate2 = affiliateLabel2 && affiliateUrl2;
  const hasAnyAffiliate = hasAffiliate1 || hasAffiliate2;
  if (!hasAnyPrice && !hasAnyAffiliate) return null;
  return (
    <div className="product-buy-box rounded-3xl border bg-white p-5 space-y-4 shadow-sm overflow-hidden">
      <div className="-mx-5 -mt-5 px-5 pt-5 pb-4 bg-gradient-to-b from-gray-50 to-white border-b">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-wide text-gray-700">Vásárlás</div>
            <div className="mt-1 text-sm text-gray-600">A vásárlás a külső oldalon történik.</div>
            {discountPct !== null ? (
              <div className="mt-1 text-sm text-gray-600">
                A Sokáig élek kedvezmény az alap árból:{" "}
                <span className="font-semibold text-gray-900">{discountPct}%</span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {hasAnyPrice ? (
        <div className="rounded-2xl border bg-gray-50 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              {basePrice !== null ? (
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-xs text-gray-600">Alap ár</div>
                  <div
                    className={
                      "font-semibold " +
                      (sokaigelekPrice !== null && sokaigelekPrice < basePrice
                        ? "line-through text-gray-500"
                        : "text-gray-900")
                    }
                  >
                    {formatHuf(basePrice)}
                  </div>
                </div>
              ) : null}

              {sokaigelekPrice !== null ? (
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-xs text-gray-600">Sokáig élek ár</div>
                  <div className="text-xl font-extrabold text-gray-900">{formatHuf(sokaigelekPrice)}</div>
                </div>
              ) : null}

              {clubPrice !== null ? (
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-xs text-gray-600">Klubtag ár</div>
                  <div className="font-semibold text-gray-900">{formatHuf(clubPrice)}</div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {hasAnyAffiliate ? (
        <div className="buybox-actions">
          {hasAffiliate1 ? (
            <a
              className="buybox-primary"
              href={`/out/${product.slug}?to=1`}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {affiliateLabel1}
            </a>
          ) : null}

          {hasAffiliate2 ? (
            <a
              className="buybox-secondary"
              href={`/out/${product.slug}?to=2`}
              target="_blank"
              rel="noopener noreferrer nofollow"
            >
              {affiliateLabel2}
            </a>
          ) : null}
        </div>
      ) : null}

    </div>
  );
}

export default async function ProductPageRoute({ params }: Props) {
  const { slug } = await params;

  const { data: product, error } = await supabaseServer
    .from("products")
    .select(
      "id, slug, name, short, description, image_url, affiliate_label_1, affiliate_url_1, affiliate_label_2, affiliate_url_2, price, regular_price, status, tags, ingredients, warnings, nutrition, composition_html"
    )
    .eq("slug", slug)
    .single();

  // Opcionális mezők (ha vannak a táblában, megjelenítjük; ha nincsenek, nem törik)
  const benefits = asArray((product as any)?.benefits);
  const ingredients = asArray((product as any)?.ingredients);
  const howToUse = String((product as any)?.how_to_use || "").trim();
  const warnings = String((product as any)?.warnings || "").trim();
  // Ár mezők (a jelenlegi DB alapján)
  // Alap ár = regular_price, Sokáig élek ár = price
  const basePrice = parseNum((product as any)?.regular_price) ?? null;
  const sokaigelekPrice = parseNum((product as any)?.price) ?? null;

  const hasAnyPrice = basePrice !== null || sokaigelekPrice !== null;
  const hasBothPrices = basePrice !== null && sokaigelekPrice !== null;
  const discountPct =
    hasBothPrices && basePrice! > 0 && sokaigelekPrice! < basePrice!
      ? Math.round(((basePrice! - sokaigelekPrice!) / basePrice!) * 100)
      : null;

  const faqRaw = (product as any)?.faq;
  const faq: Array<{ q: string; a: string }> = Array.isArray(faqRaw)
    ? faqRaw
        .map((x: any) => ({ q: String(x?.q || "").trim(), a: String(x?.a || "").trim() }))
        .filter((x: any) => x.q && x.a)
    : [];

  const nutritionHtml = String((product as any)?.nutrition || (product as any)?.nutrition_facts || (product as any)?.nutrition_table || "").trim();
  const compositionHtml = String((product as any)?.composition || (product as any)?.composition_html || "").trim();
  const tagsRaw = (product as any)?.tags;
  const tags = asArray(tagsRaw);
  const tagsArray = Array.isArray(tagsRaw);

  // Ideiglenes debug képernyő (hogy lásd, mi a gond)
  const status = String((product as any)?.status || "").trim();
  const isDraft = status && status !== "published";

  if (error || !product || isDraft) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-10 space-y-3">
        <h1 className="text-2xl font-bold">Nincs ilyen termék</h1>
        <div className="text-sm text-gray-700">
          Kért slug: <b>{slug}</b>
        </div>
        <div className="text-sm text-red-600">
          Hiba: {error?.message ?? "Nem találtam a rekordot a products táblában."}
        </div>
        <div className="text-sm text-gray-500">
          Ellenőrizd az admin listában, hogy pontosan mi a slug.
        </div>
      </main>
    );
  }

  let relatedProducts: any[] = [];
  if (tags.length && tagsArray) {
    const { data: related, error: relErr } = await supabaseServer
      .from("products")
      .select("id, slug, name, short, description, image_url, status")
      .overlaps("tags", tags)
      .neq("id", product.id)
      .limit(6);

    if (!relErr && related) {
      const hasStatus = related.some((r: any) =>
        Object.prototype.hasOwnProperty.call(r, "status")
      );
      relatedProducts = hasStatus
        ? related.filter((r: any) => String(r.status || "") === "published")
        : related;
    }
  }

  return (
    <main className="container page product-page space-y-10">
      <nav className="text-sm text-gray-500">
        <div className="inline-flex items-center gap-2 rounded-full border bg-white/70 px-3 py-1">
          <a className="hover:text-gray-800" href="/">Kezdőlap</a>
          <span className="text-gray-300">/</span>
          <a className="hover:text-gray-800" href="/termek">Termékek</a>
          <span className="text-gray-300">/</span>
          <span className="text-gray-700 line-clamp-1">{product.name}</span>
        </div>
      </nav>

      {/* HERO */}
      <section className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* Left: image + tags */}
        <div className="space-y-4 self-start lg:self-stretch">
          <div className="rounded-3xl border bg-white p-4">
            <div className="aspect-square w-full overflow-hidden rounded-2xl bg-gray-50">
              {safeRemoteImageUrl((product as any)?.image_url) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={safeRemoteImageUrl((product as any)?.image_url) as string}
                  alt={`${product?.name || "Termék"} termék kép`}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="h-full w-full" />
              )}
            </div>

            {Array.isArray((product as any).tags) && (product as any).tags.length ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {(product as any).tags.map((t: string) => (
                  <span
                    key={t}
                    className="text-xs px-3 py-1 rounded-full border bg-gray-50 text-gray-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="hidden lg:block">
            <QuickTipBox />
          </div>

          <aside className="hidden lg:block sticky top-24 self-start h-fit">
            <BuyBox
              product={product}
              discountPct={discountPct}
              hasAnyPrice={hasAnyPrice}
              basePrice={basePrice}
              sokaigelekPrice={sokaigelekPrice}
            />
          </aside>
        </div>

        {/* Right: content */}
        <div className="space-y-6 w-full min-w-0 self-start">
          <header className="space-y-3">
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight product-title">
              {product.name}
            </h1>

            {product.short ? (
              <div className="product-shortbox">
                <div className="product-shortbox-title">Röviden</div>
                <div className="prose prose-neutral max-w-none text-gray-700">
                  <div dangerouslySetInnerHTML={{ __html: String(product.short) }} />
                </div>
              </div>
            ) : null}
          </header>

          <div className="lg:hidden">
            <BuyBox
              product={product}
              discountPct={discountPct}
              hasAnyPrice={hasAnyPrice}
              basePrice={basePrice}
              sokaigelekPrice={sokaigelekPrice}
            />
          </div>

          {(String((product as any)?.description || "").trim() || nutritionHtml || compositionHtml || ingredients.length) ? (
            <section className="product-tabs rounded-2xl border bg-white p-6 w-full">
              <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                <input id="tab-desc" name="productTabs" type="radio" className="peer/tabdesc sr-only" defaultChecked />
                <label
                  htmlFor="tab-desc"
                  className="cursor-pointer rounded-full px-4 py-2 text-sm font-semibold border bg-gray-50 text-gray-800 hover:bg-white"
                >
                  Leírás
                </label>

                <input id="tab-nutri" name="productTabs" type="radio" className="peer/tabnutri sr-only" />
                <label
                  htmlFor="tab-nutri"
                  className="cursor-pointer rounded-full px-4 py-2 text-sm font-semibold border bg-gray-50 text-gray-800 hover:bg-white"
                >
                  Tápérték
                </label>

                <input id="tab-comp" name="productTabs" type="radio" className="peer/tabcomp sr-only" />
                <label
                  htmlFor="tab-comp"
                  className="cursor-pointer rounded-full px-4 py-2 text-sm font-semibold border bg-gray-50 text-gray-800 hover:bg-white"
                >
                  Összetétel
                </label>
              </div>

              {/* Panels */}
              <div className="mt-5">
                <div className="product-tab-panel product-tab-desc">
                  {renderHtml((product as any)?.description) ? (
                    <div className="space-y-3">{renderHtml((product as any)?.description)}</div>
                  ) : (
                    <p className="text-sm text-gray-600">Nincs leírás megadva.</p>
                  )}
                </div>

                <div className="product-tab-panel product-tab-nutri">
                  {nutritionHtml ? (
                    <div
                      className="prose prose-neutral max-w-none"
                      dangerouslySetInnerHTML={{ __html: nutritionHtml }}
                    />
                  ) : (
                    <p className="text-sm text-gray-600">Tápérték információ nem érhető el.</p>
                  )}
                </div>

                <div className="product-tab-panel product-tab-comp">
                  {compositionHtml ? (
                    <div
                      className="prose prose-neutral max-w-none"
                      dangerouslySetInnerHTML={{ __html: compositionHtml }}
                    />
                  ) : ingredients.length ? (
                    <div>
                      <p className="text-sm text-gray-700 font-semibold">Összetevők (lista)</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {ingredients.map((i) => (
                          <span key={i} className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                            {i}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600">Összetétel információ nem érhető el.</p>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          <div className="w-full">
            {/* Main description preview / highlights */}
            <div className="space-y-6 w-full min-w-0">
              {benefits.length ? (
                <div className="rounded-2xl border bg-white p-5">
                  <h2 className="text-lg font-semibold">Miért lehet hasznos?</h2>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {benefits.slice(0, 6).map((b) => (
                      <li key={b} className="flex gap-2 text-sm text-gray-700">
                        <span className="mt-1 h-2 w-2 rounded-full bg-black" />
                        <span className="leading-6">{b}</span>
                      </li>
                    ))}
                  </ul>
                  {benefits.length > 6 ? (
                    <div className="mt-3 text-xs text-gray-500">+ {benefits.length - 6} további pont lejjebb</div>
                  ) : null}
                </div>
              ) : null}

              {ingredients.length ? (
                <div className="rounded-2xl border bg-white p-5">
                  <h2 className="text-lg font-semibold">Összetevők</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ingredients.slice(0, 14).map((i) => (
                      <span key={i} className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                        {i}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="lg:hidden">
            <QuickTipBox />
          </div>
        </div>
      </section>

      {/* RÉSZLETEK */}
      <section className="grid gap-8">
        <div className="grid gap-6 md:grid-cols-2">
          {howToUse ? (
            <div className="rounded-2xl border bg-white p-5 space-y-3">
              <h2 className="text-lg font-semibold">Használat</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{howToUse}</p>
            </div>
          ) : null}

          {warnings ? (
            <div className="rounded-2xl border bg-white p-5 space-y-3">
              <h2 className="text-lg font-semibold">Figyelmeztetés</h2>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{warnings}</p>
            </div>
          ) : null}
        </div>

        {faq.length ? (
          <div className="rounded-2xl border bg-white p-5 space-y-4">
            <h2 className="text-lg font-semibold">GYIK</h2>
            <div className="space-y-3">
              {faq.map((x, idx) => (
                <details key={`${x.q}-${idx}`} className="group rounded-2xl border bg-gray-50/40 p-4">
                  <summary className="cursor-pointer font-semibold text-gray-900">
                    {x.q}
                  </summary>
                  <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{x.a}</div>
                </details>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {relatedProducts.length ? (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Kapcsolódó termékek</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {relatedProducts.map((p: any) => {
              const desc = stripHtml(String(p.short || p.description || ""));
              return (
                <a
                  key={p.id || p.slug}
                  className="group rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  href={`/termek/${p.slug}`}
                >
                  <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-gray-50">
                    <img
                      src={productCardImage(p.image_url)}
                      alt={p.name || "Termék"}
                      loading="lazy"
                      decoding="async"
                      className="absolute inset-0 h-full w-full object-contain p-4 transition group-hover:scale-[1.02]"
                    />
                  </div>
                  <div className="mt-3 font-semibold text-gray-900">{p.name}</div>
                  {desc ? (
                    <div className="mt-1 text-sm text-gray-600 line-clamp-2">
                      {desc}
                    </div>
                  ) : null}
                </a>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="pt-8">
        <a className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900" href="/termek">
          <span aria-hidden>←</span>
          <span>Vissza a termékekhez</span>
        </a>
      </div>
    </main>
  );
}
