import type { MetadataRoute } from "next";
import { supabaseServer } from "@/lib/supabaseServer";

type SitemapEntry = MetadataRoute.Sitemap[number];

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
    { url: `${siteUrl}/termek`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${siteUrl}/kategorak`, changeFrequency: "weekly", priority: 0.5 },
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

  const articleRoutes: SitemapEntry[] = (articles || []).map((article: any) => ({
    url: `${siteUrl}/cikkek/${article.slug}`,
    lastModified:
      safeDate(article.updated_at) ||
      safeDate(article.published_at) ||
      safeDate(article.created_at),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const productRoutes: SitemapEntry[] = (products || []).map((product: any) => ({
    url: `${siteUrl}/termek/${product.slug}`,
    lastModified: safeDate(product.updated_at) || safeDate(product.created_at),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...articleRoutes, ...productRoutes];
}
