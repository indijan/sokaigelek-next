export function getSiteUrl(fallback = "https://www.sokaigelek.hu") {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || fallback;

  try {
    const url = new URL(raw);

    if (url.hostname === "sokaigelek.hu") {
      url.hostname = "www.sokaigelek.hu";
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return fallback.replace(/\/$/, "");
  }
}

