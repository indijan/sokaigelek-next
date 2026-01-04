import { NextRequest } from "next/server";

const SUPABASE_HOST = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
})();

const PUBLIC_PATH_PREFIX = "/storage/v1/object/public/";
const DEFAULT_MAX_AGE = 60 * 60 * 24 * 30;
const DEFAULT_SWR = 60 * 60 * 24;

function intFromEnv(key: string, fallback: number) {
  const raw = process.env[key];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isAllowedUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (SUPABASE_HOST && u.hostname !== SUPABASE_HOST) return false;
    if (!u.hostname.endsWith(".supabase.co")) return false;
    return u.pathname.startsWith(PUBLIC_PATH_PREFIX);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get("url");
  if (!src || !isAllowedUrl(src)) {
    return new Response("Bad Request", { status: 400 });
  }

  const upstream = await fetch(src, {
    headers: {
      "User-Agent": "sokaigelek-next-image-proxy",
    },
    cache: "force-cache",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream Error", { status: 502 });
  }

  const maxAge = intFromEnv("IMAGE_CACHE_MAX_AGE", DEFAULT_MAX_AGE);
  const swr = intFromEnv("IMAGE_CACHE_SWR", DEFAULT_SWR);

  const headers = new Headers(upstream.headers);
  headers.set(
    "Cache-Control",
    `public, s-maxage=${maxAge}, stale-while-revalidate=${swr}`
  );
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
