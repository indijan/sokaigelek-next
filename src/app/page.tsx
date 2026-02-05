import Link from "next/link";
import ChatOpenButton from "@/components/ChatOpenButton";
import Image from "next/image";
import type { CSSProperties } from "react";
import { supabaseServer } from "@/lib/supabaseServer";
import { cdnImageUrl } from "@/lib/cdn";
import { formatHuf } from "@/lib/formatHuf";
import YouTubeEmbed from "@/components/YouTubeEmbed";
import { unstable_cache } from "next/cache";

export const revalidate = 900;
export const dynamic = "force-static";

const getFeaturedProducts = unstable_cache(
  async () => {
    const { data: featuredProducts } = await supabaseServer
      .from("products")
      .select("id, slug, name, short, image_url, price, regular_price, status")
      .eq("is_featured", true)
      .order("updated_at", { ascending: false })
      .limit(4);

    return featuredProducts ?? [];
  },
  ["home-featured-products"],
  { revalidate }
);

type Topic =
  | {
      label: string;
      action: "chat";
      image?: string;
    }
  | {
      label: string;
      href: string;
      image: string;
      action?: "cta";
    };

const TOPICS: Topic[] = [
  {
    label: "Jóllét Kalauz",
    href: "/cikkek",
    image: "/images/home/topic-tudatos-elet.jpeg",
  },
  {
    label: "Jólét felelős",
    action: "chat",
    image: "",
  },
  {
    label: "Optimális megoldás",
    href: "/cikkek?cat=optimalis-megoldas",
    image: "/images/home/topic-optimalis-megoldas.jpg",
  },
  {
    label: "Étrend-kiegészítők",
    href: "/termek",
    image: "/images/home/topic-etrend-kiegeszitok.png",
    action: "cta",
  },
];

const PROBLEMS = [
  { label: "Alvászavar", image: "/images/home/problem-alvas.jpg" },
  { label: "Stressz és kimerültség", image: "/images/home/problem-stressz.jpg" },
  { label: "Immunrendszer erősítése", image: "/images/home/problem-immun.jpg" },
  { label: "Emésztési zavarok", image: "/images/home/problem-emesztes.jpg" },
  { label: "Energiaszint növelése", image: "/images/home/problem-energia.jpg" },
  { label: "Bőr egészsége", image: "/images/home/problem-bor.jpg" },
];


function CardMedia({
  src,
  alt,
  variant,
  priority = false,
  fetchPriority,
}: {
  src?: string;
  alt: string;
  variant: "topic" | "topic-tall" | "problem" | "product" | "icon";
  priority?: boolean;
  fetchPriority?: "high" | "low" | "auto";
}) {
  const aspect =
    variant === "topic" ? "16 / 9" :
    variant === "topic-tall" ? "4 / 3" :
    variant === "product" ? "4 / 3" :
    "1 / 1";
  const sizes =
    variant === "topic"
      ? "(max-width: 600px) 50vw, (max-width: 900px) 33vw, 480px"
      : variant === "topic-tall"
        ? "(max-width: 600px) 50vw, (max-width: 900px) 33vw, 360px"
        : variant === "icon"
          ? "160px"
          : "(max-width: 640px) 100vw, 33vw";
  const quality =
    variant === "topic" || variant === "topic-tall" ? 60 : 70;
  const dimensions =
    variant === "topic"
      ? { width: 480, height: 320 }
      : variant === "topic-tall" || variant === "product"
        ? { width: 480, height: 360 }
        : variant === "icon"
          ? { width: 160, height: 160 }
          : { width: 320, height: 320 };

  // No-network placeholder (industry-standard: skeleton/gradient slot until real image exists)
  const placeholderStyle: CSSProperties = {
    aspectRatio: aspect,
    borderRadius: 14,
    overflow: "hidden",
    background:
      "radial-gradient(1200px 600px at 10% 0%, rgba(16,185,129,.18), transparent 55%), radial-gradient(900px 500px at 90% 30%, rgba(59,130,246,.14), transparent 60%), linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,0))",
    border: "1px solid rgba(255,255,255,.08)",
  };

  // If you haven't uploaded images yet, we render only the placeholder to avoid 404 image requests.
  if (!src) return <div style={placeholderStyle} aria-hidden="true" />;

  const isRemote = /^https?:\/\//i.test(src);
  const remoteSrc = isRemote ? cdnImageUrl(src) : src;

  return (
    <div style={placeholderStyle}>
      {isRemote ? (
        // Using <img> avoids Next.js image optimizer fetch issues during dev for some remote hosts.
        <img
          src={remoteSrc}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={fetchPriority}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          referrerPolicy="no-referrer"
        />
      ) : (
        <Image
          src={src}
          alt={alt}
          width={dimensions.width}
          height={dimensions.height}
          sizes={sizes}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          priority={priority}
          fetchPriority={fetchPriority}
          quality={quality}
        />
      )}
    </div>
  );
}

export default async function Home() {
  const featuredProducts = await getFeaturedProducts();

  const visibleFeatured = featuredProducts.filter((p: any) => {
    const status = String(p?.status || "").trim();
    return !status || status === "published";
  });

  const money = (n: number | null | undefined) =>
    typeof n === "number" && n > 0 ? formatHuf(n, false) : "";

  const clamp3: CSSProperties = {
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };
  const stripHtml = (s: string) =>
      s
          .replace(/<[^>]*>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/\s+/g, " ")
          .trim();

  return (
      <div className="container page" suppressHydrationWarning>
        <style>{`
          .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
            margin-top: 1rem;
          }

          .hero {
            padding: 1.75rem;
            border-radius: var(--radius-lg);
            border: 1px solid var(--border);
            background: linear-gradient(180deg, #ffffff 0%, var(--bg) 100%);
            box-shadow: var(--shadow-sm);
          }

          .hero h1 { margin-top: 0.5rem; }

          .card-title {
            font-weight: 800;
            letter-spacing: -0.01em;
            margin-bottom: 0.35rem;
          }

          .card-actions {
            margin-top: 1rem;
          }

          .callout {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            padding: 1.25rem;
            border-radius: var(--radius-lg);
            border: 1px solid rgba(101, 163, 13, 0.30);
            background: rgba(101, 163, 13, 0.12);
          }

          .callout-title {
            font-weight: 800;
            letter-spacing: -0.01em;
            margin-bottom: 0.15rem;
          }

          .defer-section {
            content-visibility: auto;
            contain-intrinsic-size: 1000px;
          }
        `}</style>
        {/* HERO */}
        <section className="hero">
          <h1>Élj sokáig. Egészségesen.</h1>
          <p className="muted" style={{ maxWidth: 780 }}>
            Tudatos életmód cikkekkel, amelyek segítenek megérteni az okokat, és
            megmutatják a lehetséges megoldásokat.
          </p>

          {/* SMART SEARCH (GET -> /kereses) */}
          <div className="searchbox" style={{ marginTop: 18, maxWidth: 780 }}>
            <form
                action="/kereses"
                method="GET"
                className="searchbox-form"
                style={{ display: "flex", gap: 10, alignItems: "stretch", flexWrap: "wrap" }}
            >
              <input
                name="q"
                className="searchbox-input"
                placeholder="Írd le, mi a problémád… (pl. fejfájás, fáradtság, alvászavar)"
                aria-label="Keresés a tartalmak között"
                style={{ flex: "1 1 360px", minWidth: 220 }}
              />
              <button className="btn btn-primary" type="submit" style={{ flex: "0 0 auto", whiteSpace: "nowrap" }}>
                Keresés
              </button>
            </form>
            <div className="searchbox-hint muted">
                Tipp: írhatsz tünetet vagy célt is — a találatok között cikkeket és javasolt étrend-kiegészítőket is kapsz.
            </div>
          </div>

          <div className="actions">
            <Link className="btn btn-primary" href="/cikkek">
              Cikkek böngészése
            </Link>
            <Link className="btn btn-secondary" href="/termek">
              Étrend-kiegészítők
            </Link>
          </div>

          <div
              className="grid"
              style={{
                marginTop: 18,
                gap: 10,
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              }}
          >
            {TOPICS.map((t, index) =>
                t.action === "chat" ? (
                  <ChatOpenButton
                    key={t.label}
                    className="card card-hover"
                    style={{
                      padding: 14,
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      cursor: "pointer",
                      border: "1px solid rgba(194,65,12,0.30)",
                      background:
                        "linear-gradient(135deg, rgba(255,247,237,0.95), rgba(255,255,255,0.9))",
                    }}
                  >
                    <CardMedia
                      src="/images/home/jollet-felelos.png"
                      alt="Jóllét felelős"
                      variant="topic-tall"
                    />
                    <div className="card-title" style={{ marginBottom: 6, marginTop: 10 }}>
                      Beszélgess a Jólét felelőssel
                    </div>
                    <div className="card-actions" style={{ marginTop: 10 }}>
                      <span className="btn btn-secondary">Tanácsot kérek</span>
                    </div>
                  </ChatOpenButton>
                ) : t.action === "cta" ? (
                  <Link
                    key={t.href}
                    className="card card-hover"
                    href={t.href}
                    style={{
                      padding: 14,
                      border: "1px solid rgba(194,65,12,0.30)",
                      background:
                        "linear-gradient(135deg, rgba(255,247,237,0.95), rgba(255,255,255,0.9))",
                    }}
                  >
                    <CardMedia src={t.image} alt={t.label} variant="topic-tall" />
                    <div className="card-title" style={{ marginBottom: 6, marginTop: 10 }}>
                      Étrend-kiegészítők
                    </div>
                    <div className="card-actions" style={{ marginTop: 10 }}>
                      <span className="btn btn-secondary">Megnézem</span>
                    </div>
                  </Link>
                ) : (
                  <Link key={t.href} className="card card-hover" href={t.href} style={{ padding: 14 }}>
                    <CardMedia
                      src={t.image}
                      alt={t.label}
                      variant="topic"
                      priority={index === 0}
                      fetchPriority={index === 0 ? "high" : "auto"}
                    />
                    <div className="card-title" style={{ marginBottom: 6, marginTop: 10 }}>
                      {t.label}
                    </div>
                    <div className="muted">Nézd meg a kapcsolódó tartalmakat</div>
                  </Link>
                )
            )}
          </div>
        </section>

        {/* RAJTAD MÚLIK */}
        <section className="section defer-section">
          <div
              className="grid"
              style={{ gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
          >
            <div className="card">
              <div className="card-title">Rajtad múlik</div>
              <p className="muted" style={{ marginTop: 10 }}>
                Az egészséges élethez elengedhetetlen az ellenőrzött és jó minőségű
                alapanyagok fogyasztása. A silány minőségű ételek, tele
                adalékanyagokkal, hosszú távon súlyos problémákhoz vezethetnek.
              </p>
              <p className="muted">
                A tápanyagokban gazdag élelmiszerek támogatják az immunrendszert és
                javíthatják a mentális állapotot. Tudatos táplálkozással nemcsak
                magadat, de a jövő generációját is véded.
              </p>
              <div className="card-actions">
                <Link className="btn btn-secondary" href="/cikkek">
                  Tovább a cikkekre
                </Link>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Itt csak természetes alapanyagokat találsz</div>
              <p className="muted" style={{ marginTop: 10 }}>
                Étrend-kiegészítőink kizárólag természetes alapanyagokból készülnek,
                céljuk a tápanyagok gyors és hatékony pótlása a szervezet számára.
                Könnyen felszívódnak, így segíthetik a vitalitás növelését és az
                egészség megőrzését.
              </p>
              <p className="muted">
                A formulák tudományos és orvosi háttérrel rendelkeznek és különböző
                egészségügyi problémákra kínálnak megoldásokat — a döntést pedig
                tanácsadással támogatjuk.
              </p>
              <div className="card-actions">
                <Link className="btn btn-primary" href="/termek">
                  Megnézem az étrend-kiegészítőket
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* TERMÉKCSOPORT + USP */}
        <section className="section defer-section">
          <h2>Természetes, tudományos, egészséges</h2>
          <p className="muted" style={{ maxWidth: 840 }}>
            A Duolife folyékony formulái egyszerűen fogyaszthatók, és a
            mindennapokban segíthetnek támogatni a szervezet természetes
            egyensúlyát.
          </p>

          <div className="grid grid-3" style={{ marginTop: 14 }}>
            <div className="card">
              <CardMedia src="/images/home/icon-termeszetes.png" alt="Természetes" variant="icon" />
              <div className="card-title" style={{ marginTop: 10 }}>Természetes</div>
              <div className="muted">
                Gondosan válogatott összetevők, átlátható szemlélet.
              </div>
            </div>
            <div className="card">
              <CardMedia src="/images/home/icon-tudomanyos.png" alt="Tudományos" variant="icon" />
              <div className="card-title" style={{ marginTop: 10 }}>Tudományos</div>
              <div className="muted">Tudományos és orvosi háttér, logikus formulák.</div>
            </div>
            <div className="card">
              <CardMedia src="/images/home/icon-harmonikus.png" alt="Harmónikus" variant="icon" />
              <div className="card-title" style={{ marginTop: 10 }}>Harmónikus</div>
              <div className="muted">Komplex, mégis könnyen beépíthető napi rutin.</div>
            </div>
          </div>
        </section>

        {/* PROBLÉMÁK / KERESÉS */}
        <section className="section defer-section">
          <div className="callout">
            <div>
              <div className="callout-title">Erre keresek megoldást…</div>
              <div className="muted">
                Válassz témát, és mutatom a kapcsolódó cikkeket és ajánlásokat.
              </div>
            </div>
            <Link className="btn btn-primary" href="/kereses">
              Keresés megnyitása
            </Link>
          </div>

          <div
              className="grid"
              style={{
                marginTop: 14,
                gap: 10,
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              }}
          >
            {PROBLEMS.map((p) => (
                <Link
                    key={p.label}
                    className="card card-hover"
                    href={`/kereses?q=${encodeURIComponent(p.label)}`}
                    style={{ padding: 14 }}
                >
                  <CardMedia src={p.image} alt={p.label} variant="problem" />
                  <div className="card-title" style={{ marginBottom: 6, marginTop: 10 }}>
                    {p.label}
                  </div>
                  <div className="muted">Kapcsolódó cikkek</div>
                </Link>
            ))}
          </div>
        </section>

        {/* KIEMELT TERMÉKEK */}
        <section className="section defer-section">
          <h2>Kiemelt termékek</h2>

          <div
            className="grid"
            style={{
              marginTop: 14,
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            {visibleFeatured.length === 0 ? (
              <div className="card" style={{ padding: 14 }}>
                <div className="card-title">Még nincs kiemelt termék</div>
                <p className="muted" style={{ marginTop: 8 }}>
                  Menj az Admin → Termékekbe, nyiss meg egy terméket, és pipáld be a
                  <b> Kiemelt termék</b> opciót.
                </p>
                <div className="card-actions">
                  <Link className="btn btn-secondary" href="/admin/products">
                    Megnyitom az admin termékeket
                  </Link>
                </div>
              </div>
            ) : (
              visibleFeatured.map((p) => {
                const basePrice =
                  typeof p.regular_price === "number" && p.regular_price > 0
                    ? p.regular_price
                    : null;
                const dealPrice =
                  typeof p.price === "number" && p.price > 0 ? p.price : null;
                const hasDiscount =
                  basePrice !== null &&
                  dealPrice !== null &&
                  dealPrice < basePrice;

                return (
                  <Link key={p.id} className="card card-hover" href={`/termek/${p.slug}`}>
                    <CardMedia
                      src={(p.image_url as string | null) || ""}
                      alt={p.name}
                      variant="product"
                    />

                    <div className="card-title" style={{ marginTop: 10 }}>
                      {p.name}
                    </div>

                    {p.short ? (
                        <div
                            className="muted"
                            style={{ marginTop: 6, ...clamp3 }}
                            title={stripHtml(String(p.short))}
                        >
                          {stripHtml(String(p.short))}
                        </div>
                    ) : null}

                    {(dealPrice || basePrice) ? (
                      <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "baseline" }}>
                        {hasDiscount ? (
                          <div className="muted" style={{ textDecoration: "line-through" }}>
                            {money(basePrice)} Ft
                          </div>
                        ) : null}
                        <div style={{ fontWeight: 700 }}>
                          {money(hasDiscount ? dealPrice : (dealPrice || basePrice))} Ft
                        </div>
                      </div>
                    ) : null}

                    <div className="card-actions" style={{ marginTop: 12 }}>
                      <span
                        className="btn btn-secondary"
                        style={{ display: "inline-flex", pointerEvents: "none", opacity: 0.95 }}
                        aria-hidden="true"
                      >
                        Megnézem
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          <div className="actions" style={{ marginTop: 14 }}>
            <Link className="btn btn-secondary" href="/termek">
              Összes termék
            </Link>
          </div>
        </section>

        {/* TANÁCSADÓ CTA */}
        <section className="section defer-section">
          <div className="callout">
            <div>
              <div className="callout-title">Beszélgess a Jóllét felelőssel</div>
              <div className="muted">
                Ha nem vagy biztos benne, milyen étrend-kiegészítőre lenne szükséged,
                segítünk eligazodni.
              </div>
            </div>
            <ChatOpenButton className="btn btn-primary">
              Tanácsot kérek
            </ChatOpenButton>
          </div>
        </section>

        {/* VIDEÓ */}
        <section className="section defer-section">
          <h2>Bemutató videó</h2>
          <div className="card" style={{ padding: 14 }}>
            <YouTubeEmbed videoId="PQLUIodpTGg" title="Sokáig Élek – Bemutató" />
          </div>
        </section>
      </div>
  );
}
