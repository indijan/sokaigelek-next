import { supabaseServer } from "@/lib/supabaseServer";
import { getSiteUrl } from "@/lib/siteUrl";

export const revalidate = 86400;

function cleanText(value: unknown, maxLength = 220) {
  const text = String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export async function GET() {
  const siteUrl = getSiteUrl();
  const [{ data: articles }, { data: products }] = await Promise.all([
    supabaseServer
      .from("articles")
      .select("slug, title, excerpt")
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(30),
    supabaseServer
      .from("products")
      .select("slug, name, short")
      .eq("status", "published")
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(30),
  ]);

  const lines = [
    "# Sokáig élek",
    "> Magyar nyelvű egészség- és életmódmagazin gyakorlati útmutatókkal, receptekkel, étrend-kiegészítőkkel és edukatív állapotfelmérőkkel.",
    "> A laboreredmény- és állapotfelmérő tartalom tájékoztató jellegű, nem diagnózis és nem helyettesít orvosi tanácsadást.",
    "",
    "## Fontos oldalak",
    `- [Jóllét Kalauz](${siteUrl}/cikkek): Egészség- és életmódcikkek témakörök szerint.`,
    `- [Receptek](${siteUrl}/receptek): Szűrhető receptek étkezés, idő, étrend és címke szerint.`,
    `- [Étrend-kiegészítők](${siteUrl}/termek): Termékleírások és kapcsolódó támogatási irányok.`,
    `- [Mi hiányzik nekem?](${siteUrl}/mi-hianyzik-nekem): Rövid, edukatív állapotfelmérés.`,
    `- [Laboreredmény feltöltése](${siteUrl}/laboreredmeny-feltoltes): Digitális laborlelet beküldése érthető összefoglalóhoz.`,
    "",
    "## Friss és kiemelt cikkek",
    ...((articles || []).map((article: any) => `- [${cleanText(article.title, 160)}](${siteUrl}/cikkek/${article.slug}): ${cleanText(article.excerpt)}`)),
    "",
    "## Étrend-kiegészítők",
    ...((products || []).map((product: any) => `- [${cleanText(product.name, 160)}](${siteUrl}/termek/${product.slug}): ${cleanText(product.short)}`)),
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
