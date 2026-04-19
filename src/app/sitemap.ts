import type { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabaseServer";

type SitemapEntry = MetadataRoute.Sitemap[number];
type ArticleRow = { slug: string; updated_at?: string | null; published_at?: string | null; created_at?: string | null };
type ProductRow = { slug: string; updated_at?: string | null; created_at?: string | null };
type CategoryRow = { slug: string; created_at?: string | null };

export const revalidate = 3600;

function safeDate(input?: string | null): Date | undefined {
  if (!input) return undefined;
  const d = new Date(input);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.sokaigelek.hu";

  const staticRoutes: SitemapEntry[] = [
    { url: `${siteUrl}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/cikkek`, changeFrequency: "daily", priority: 0.8 },
    { url: `${siteUrl}/mi-hianyzik-nekem`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/termek`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/kategorak`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${siteUrl}/kapcsolat`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/adatvedelem`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/aszf`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const [{ data: articles }, { data: products }] = await Promise.all([
    supabaseServer
      .from("articles")
      .select("slug, updated_at, published_at, created_at")
      .eq("status", "published"),
    supabaseServer
      .from("products")
      .select("slug, updated_at, created_at")
      .eq("status", "published"),
  ]);

  const { data: categories } = await supabaseServer
    .from("categories")
    .select("slug, created_at")
    .order("name", { ascending: true });

  const articleRoutes: SitemapEntry[] = ((articles || []) as ArticleRow[]).map((article) => ({
    url: `${siteUrl}/cikkek/${article.slug}`,
    lastModified:
      safeDate(article.updated_at) ||
      safeDate(article.published_at) ||
      safeDate(article.created_at),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const productRoutes: SitemapEntry[] = ((products || []) as ProductRow[]).map((product) => ({
    url: `${siteUrl}/termek/${product.slug}`,
    lastModified: safeDate(product.updated_at) || safeDate(product.created_at),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const categoryRoutes: SitemapEntry[] = ((categories || []) as CategoryRow[]).map((category) => ({
    url: `${siteUrl}/kategoria/${category.slug}`,
    lastModified: safeDate(category.created_at),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...articleRoutes, ...productRoutes, ...categoryRoutes];
}
