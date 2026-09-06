import { getSiteUrl } from "@/lib/siteUrl";

export const SITE_NAME = "Sokáig élek";
export const SITE_SOCIALS = [
  "https://www.facebook.com/sokaigelek",
  "https://m.me/sokaigelek",
];

export function absoluteUrl(pathOrUrl?: string | null) {
  const raw = String(pathOrUrl || "").trim();
  const siteUrl = getSiteUrl();
  if (!raw) return siteUrl;

  try {
    return new URL(raw, siteUrl).toString();
  } catch {
    return siteUrl;
  }
}

export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function buildBreadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

export function buildItemListJsonLd(
  name: string,
  url: string,
  items: Array<{ name: string; url: string; image?: string | null }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    url: absoluteUrl(url),
    inLanguage: "hu-HU",
    mainEntity: {
      "@type": "ItemList",
      itemListElement: items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(item.url),
        name: item.name,
        ...(item.image ? { image: absoluteUrl(item.image) } : {}),
      })),
    },
  };
}
