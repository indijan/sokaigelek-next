import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { bestSimilarityHit, normalizeContentText } from "@/lib/contentSimilarity";

type FeedItem = {
  title: string;
  link: string;
  summary: string;
  publishedAt?: string;
};

function decodeXmlText(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return decodeXmlText(String(match?.[1] || "")).replace(/\s+/g, " ").trim();
}

function parseFeedItems(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemMatches = xml.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) || [];
  for (const block of itemMatches) {
    const title = extractTag(block, "title");
    const summary =
      extractTag(block, "description") || extractTag(block, "summary") || extractTag(block, "content");
    let link = extractTag(block, "link");
    if (!link) {
      const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      link = decodeXmlText(String(hrefMatch?.[1] || "")).trim();
    }
    const publishedAt = extractTag(block, "pubDate") || extractTag(block, "updated");
    if (!title || !link) continue;
    items.push({ title, link, summary, publishedAt: publishedAt || undefined });
    if (items.length >= 30) break;
  }
  return items;
}

async function fetchFeedItems(url: string): Promise<FeedItem[]> {
  const res = await fetch(url, { headers: { Accept: "application/rss+xml, application/atom+xml, application/xml" } });
  if (!res.ok) return [];
  const xml = await res.text();
  return parseFeedItems(xml);
}

function dayIndexBudapest(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const d = new Date(`${parts}T00:00:00+01:00`);
  return Math.floor(d.getTime() / (24 * 60 * 60 * 1000));
}

function normalizeForDedup(title: string, summary: string): string {
  return normalizeContentText(`${title} ${summary}`.trim());
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") || "";
  const expected = process.env.CRON_SECRET || "";
  const cronHeader = req.headers.get("x-vercel-cron");
  const isVercelCron = cronHeader === "1" || cronHeader === "true";
  const ua = req.headers.get("user-agent") || "";
  const isVercelCronUa = ua.toLowerCase().includes("vercel-cron/");
  if (!(isVercelCron || isVercelCronUa) && (!expected || secret !== expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const feedsJson = process.env.AUTO_TOPIC_FEEDS_JSON || "";
  if (!feedsJson) {
    return NextResponse.json({ ok: true, skipped: "missing_feeds_config" });
  }

  let feedsByCategory: Record<string, string[]> = {};
  try {
    const parsed = JSON.parse(feedsJson);
    if (parsed && typeof parsed === "object") {
      feedsByCategory = parsed as Record<string, string[]>;
    }
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_AUTO_TOPIC_FEEDS_JSON" }, { status: 500 });
  }

  const categories = Object.keys(feedsByCategory).filter((k) => Array.isArray(feedsByCategory[k]) && feedsByCategory[k].length);
  if (!categories.length) {
    return NextResponse.json({ ok: true, skipped: "empty_feeds_config" });
  }

  const nowMs = Date.now();
  const recencyHours = Math.max(6, Math.min(240, Number(searchParams.get("recency_hours") || "72")));
  const recencyMs = recencyHours * 60 * 60 * 1000;
  const forcedCategory = String(searchParams.get("category") || "").trim();
  const rotationSeedRaw = searchParams.get("rotation_seed");
  const rotationSeed = rotationSeedRaw === null ? 0 : Number(rotationSeedRaw) || 0;
  const maxCategoryAttempts = Math.max(
    1,
    Math.min(categories.length, Number(searchParams.get("max_category_attempts") || String(categories.length)))
  );

  const orderedCategories = forcedCategory
    ? [forcedCategory]
    : (() => {
        const startIdx = (dayIndexBudapest() + rotationSeed) % categories.length;
        const rotated = [...categories.slice(startIdx), ...categories.slice(0, startIdx)];
        return rotated.slice(0, maxCategoryAttempts);
      })();

  const attempts: Array<{ category: string; scanned: number; reason: string }> = [];

  for (const category of orderedCategories) {
    const feedUrls = feedsByCategory[category] || [];
    if (!feedUrls.length) {
      attempts.push({ category, scanned: 0, reason: "no_feed_for_category" });
      continue;
    }

    const { data: pendingForCategory } = await supabaseServer
      .from("article_automation_queue")
      .select("id", { count: "exact" })
      .eq("category_slug", category)
      .in("status", ["pending", "processing"]);
    if ((pendingForCategory?.length || 0) > 0) {
      attempts.push({ category, scanned: 0, reason: "pending_exists" });
      continue;
    }

    const [recentArticlesRes, recentQueueRes] = await Promise.all([
      supabaseServer
        .from("articles")
        .select("title, excerpt, category_slug, created_at")
        .eq("category_slug", category)
        .order("created_at", { ascending: false })
        .limit(120),
      supabaseServer
        .from("article_automation_queue")
        .select("prompt, category_slug, created_at, status")
        .eq("category_slug", category)
        .in("status", ["pending", "processing", "done"])
        .order("created_at", { ascending: false })
        .limit(120),
    ]);

    const recentCorpus: string[] = [
      ...(recentArticlesRes.data || []).map((a: any) => `${a.title || ""} ${a.excerpt || ""}`.trim()),
      ...(recentQueueRes.data || []).map((q: any) => String(q.prompt || "").trim()),
    ].filter(Boolean);

    const feedItemsNested = await Promise.all(feedUrls.map((u) => fetchFeedItems(u)));
    const feedItems = feedItemsNested.flat().slice(0, 120);

    const sorted = [...feedItems].sort((a, b) => {
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    });

    let picked: FeedItem | null = null;
    let reason = "no_candidate";
    for (const item of sorted) {
      const ts = item.publishedAt ? new Date(item.publishedAt).getTime() : NaN;
      if (!Number.isNaN(ts) && nowMs - ts > recencyMs) continue;
      const candidateText = normalizeForDedup(item.title, item.summary);
      if (!candidateText) continue;
      const hit = bestSimilarityHit(candidateText, recentCorpus);
      if (hit && hit.score >= 0.74) {
        reason = `duplicate(score=${hit.score.toFixed(2)})`;
        continue;
      }
      picked = item;
      break;
    }

    if (!picked) {
      attempts.push({ category, scanned: sorted.length, reason });
      continue;
    }

    const prompt = [
      `Külső trend téma (forrás inspiráció): ${picked.title}`,
      picked.summary ? `Rövid kivonat: ${picked.summary.slice(0, 700)}` : "",
      `Forrás link: ${picked.link}`,
      "",
      "Írj új, eredeti cikket a témáról saját szerkesztésben. Ne másold a forrást, csak inspirációnak használd.",
    ]
      .filter(Boolean)
      .join("\n");

    const { error: insertErr, data: inserted } = await supabaseServer
      .from("article_automation_queue")
      .insert({
        category_slug: category,
        prompt,
        status: "pending",
        publish_at: new Date().toISOString(),
        post_to_facebook: true,
        post_to_pinterest: false,
        post_to_x: true,
      })
      .select("id, category_slug, created_at")
      .single();

    if (insertErr) {
      return NextResponse.json({ ok: false, error: insertErr.message, attempts }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      category,
      queued: inserted?.id,
      pickedTitle: picked.title,
      pickedLink: picked.link,
      attempts,
    });
  }

  return NextResponse.json({
    ok: true,
    skipped: "no_candidate",
    attempts,
  });
}
