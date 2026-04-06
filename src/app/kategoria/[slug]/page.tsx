import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import { cdnImageUrl } from "@/lib/cdn";

export const revalidate = 900;

type Props = {
  params: Promise<{ slug: string }>;
};

type CategoryArticleCard = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  cover_image_url?: string | null;
  created_at?: string | null;
};

function buildCategoryDescription(name: string) {
  return `${name} témájú cikkek, útmutatók és gyakorlati tanácsok a Sokáig élek Jóllét Kalauzban.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data: category } = await supabaseServer
    .from("categories")
    .select("name, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (!category) {
    return {
      title: "Kategória nem található",
      robots: { index: false, follow: false },
    };
  }

  const name = String(category.name || slug).trim();
  const title = `${name} cikkek | Jóllét Kalauz | Sokaigelek`;
  const description = buildCategoryDescription(name);
  const canonicalPath = `/kategoria/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function CategoryLandingPage({ params }: Props) {
  const { slug } = await params;

  const [categoryRes, articlesRes] = await Promise.all([
    supabaseServer
      .from("categories")
      .select("id, name, slug")
      .eq("slug", slug)
      .maybeSingle(),
    supabaseServer
      .from("articles")
      .select("id, slug, title, excerpt, cover_image_url, created_at")
      .eq("status", "published")
      .eq("category_slug", slug)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(24),
  ]);

  if (!categoryRes.data) notFound();

  const category = categoryRes.data;
  const articles = articlesRes.data || [];
  const name = String(category.name || slug).trim();

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav className="mb-4 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-800">Főoldal</Link>
        {" / "}
        <Link href="/kategorak" className="hover:text-gray-800">Kategóriák</Link>
        {" / "}
        <span className="text-gray-700">{name}</span>
      </nav>

      <header className="max-w-3xl">
        <h1 className="text-3xl font-extrabold tracking-tight">{name}</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">
          {buildCategoryDescription(name)} A válogatás célja, hogy egy helyen tudd átnézni a témához kapcsolódó
          legfontosabb gyakorlati tudnivalókat és ajánlott olvasnivalókat.
        </p>
      </header>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {(articles as CategoryArticleCard[]).map((article) => (
          <Link
            key={article.id}
            href={`/cikkek/${article.slug}`}
            className="group overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="relative h-40 w-full overflow-hidden bg-gray-100">
              {article.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cdnImageUrl(String(article.cover_image_url))}
                  alt={article.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-amber-50 via-white to-rose-50" />
              )}
            </div>
            <div className="p-4">
              <div className="text-base font-semibold leading-snug tracking-tight group-hover:underline">
                {article.title}
              </div>
              {String(article.excerpt || "").trim() ? (
                <div className="mt-2 text-sm leading-relaxed text-gray-600 line-clamp-3">
                  {String(article.excerpt || "").trim()}
                </div>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
