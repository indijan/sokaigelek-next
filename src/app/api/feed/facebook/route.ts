import { supabaseServer } from "@/lib/supabaseServer";
import { cdnImageUrl } from "@/lib/cdn";

type ProductRow = {
  id: string;
  slug: string | null;
  name: string | null;
  short: string | null;
  description: string | null;
  image_url: string | null;
  price: string | number | null;
  regular_price: string | number | null;
  status: string | null;
};

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeXml(input: string) {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizePrice(value: ProductRow["price"]) {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  const { data, error } = await supabaseServer
    .from("products")
    .select("id, slug, name, short, description, image_url, price, regular_price, status")
    .eq("status", "published");

  if (error) {
    return new Response("Feed error", { status: 500 });
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://sokaigelek.hu").replace(/\/$/, "");

  const items = (data as ProductRow[] | null) ?? [];
  const xmlItems = items
    .map((p) => {
      const slug = (p.slug || "").trim();
      if (!slug) return "";

      const title = (p.name || slug).trim();
      const descSource = (p.short || p.description || "").trim();
      const description = descSource ? stripHtml(descSource) : title;

      const price = normalizePrice(p.price ?? p.regular_price);
      if (price === null) return "";

      const link = `${siteUrl}/termek/${encodeURIComponent(slug)}`;
      const image = p.image_url ? cdnImageUrl(String(p.image_url)) : "";

      return [
        "<item>",
        `<g:id>${escapeXml(p.id)}</g:id>`,
        `<g:title>${escapeXml(title)}</g:title>`,
        `<g:description>${escapeXml(description)}</g:description>`,
        `<g:link>${escapeXml(link)}</g:link>`,
        image ? `<g:image_link>${escapeXml(image)}</g:image_link>` : "",
        "<g:condition>new</g:condition>",
        "<g:availability>in stock</g:availability>",
        `<g:price>${price.toFixed(2)} HUF</g:price>`,
        "</item>",
      ]
        .filter(Boolean)
        .join("");
    })
    .filter(Boolean)
    .join("");

  const xml = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<rss version=\"2.0\" xmlns:g=\"http://base.google.com/ns/1.0\">",
    "<channel>",
    "<title>Sokaigelek Products</title>",
    `<link>${escapeXml(siteUrl)}</link>`,
    `<description>Facebook catalog feed</description>`,
    xmlItems,
    "</channel>",
    "</rss>",
  ].join("");

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
