const SUPABASE_HOST = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
})();

function isSupabasePublicUrl(url: string) {
  try {
    const u = new URL(url);
    if (SUPABASE_HOST && u.hostname !== SUPABASE_HOST) return false;
    if (!u.hostname.endsWith(".supabase.co")) return false;
    return u.pathname.startsWith("/storage/v1/object/public/");
  } catch {
    return false;
  }
}

export function cdnImageUrl(url: string) {
  const raw = url.trim();
  if (!raw) return raw;
  if (isSupabasePublicUrl(raw)) {
    return `/api/image?url=${encodeURIComponent(raw)}`;
  }
  try {
    return encodeURI(raw);
  } catch {
    return raw;
  }
}
