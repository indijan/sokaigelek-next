import { getSiteUrl } from "@/lib/siteUrl";

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
