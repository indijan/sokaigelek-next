import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import AdminActionButton from "@/components/admin/AdminActionButton";

type FeedItem = {
  title: string;
  link: string;
  summary: string;
  publishedAt?: string;
};

type StreamTopic = FeedItem & {
  categorySlug: string;
  state: "new" | "similar" | "exists";
  matches: Array<{ title: string; publishedAt?: string | null }>;
};

type PublishedArticleForSimilarity = {
  category_slug: string | null;
  title: string | null;
  published_at?: string | null;
  created_at?: string | null;
};

type AiTopicDecision = {
  topicIndex: number;
  state: "new" | "similar" | "exists";
  matchIndexes: number[];
};

function getTimeZoneOffset(timeZone: string, date: Date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map = new Map(parts.map((p) => [p.type, p.value]));
  const year = Number(map.get("year"));
  const month = Number(map.get("month"));
  const day = Number(map.get("day"));
  const hour = Number(map.get("hour"));
  const minute = Number(map.get("minute"));
  const second = Number(map.get("second"));
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return (asUtc - date.getTime()) / 60000;
}

function budapestLocalToUtcIso(value: string) {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;
  const [year, month, day] = datePart.split("-").map((v) => Number(v));
  const [hour, minute] = timePart.split(":").map((v) => Number(v));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMinutes = getTimeZoneOffset("Europe/Budapest", new Date(utcGuess));
  const actualUtc = new Date(utcGuess - offsetMinutes * 60000);
  return actualUtc.toISOString();
}

function formatBudapest(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function stripHtml(input: string): string {
  return String(input || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeXmlText(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function cleanSnippet(input: string, maxLen = 700): string {
  const text = stripHtml(decodeXmlText(String(input || ""))).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const clipped = text.length > maxLen ? `${text.slice(0, maxLen - 3).trim()}...` : text;
  return clipped.replace(/\s+\.\.\.$/, "...");
}

function normalizeFeedTitle(input: string): string {
  const text = cleanSnippet(input, 260)
    .replace(/\s*&nbsp;\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text) return "";

  const noSourceSuffix = text.replace(/\s+[|\-–—]\s+[^|\-–—]{2,80}$/g, "").trim();
  const collapsed = noSourceSuffix.replace(/\s+/g, " ").trim();
  return collapsed || text;
}

function normalizeSourceLink(input: string): string {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (host.endsWith("google.com") && url.pathname === "/url") {
      const target = url.searchParams.get("url");
      if (target) return target.trim();
    }
    return raw;
  } catch {
    return raw;
  }
}

function sourceHostLabel(input: string): string {
  try {
    const url = new URL(input);
    return url.hostname.replace(/^www\./i, "");
  } catch {
    return "forrás";
  }
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
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseFeedItems(xml);
  } catch {
    return [];
  }
}

function stateMeta(state: StreamTopic["state"]) {
  if (state === "new") return { label: "Zöld: új téma", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (state === "similar") return { label: "Sárga: hasonló téma", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "Piros: már feldolgozott", cls: "bg-rose-50 text-rose-700 border-rose-200" };
}

function extractJsonObject(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

async function openaiJson(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: prompt,
    }),
    cache: "no-store",
  });
  if (!r.ok) return null;
  const data = await r.json();
  const text =
    data?.output_text ||
    data?.output?.map((o: any) => o?.content?.map((c: any) => c?.text).join("")).join("") ||
    "";
  return extractJsonObject(text);
}

async function aiClassifyTopicsByTitle(
  topics: string[],
  existing: Array<{ title: string; publishedAt?: string | null }>
): Promise<AiTopicDecision[] | null> {
  if (!topics.length) return [];
  const limitedExisting = existing.slice(0, 300);
  const topicsBlock = topics.map((t, i) => `${i}: ${t}`).join("\n");
  const existingBlock = limitedExisting
    .map((e, i) => `${i}: ${e.title} | ${e.publishedAt || "n/a"}`)
    .join("\n");

  const prompt = `
Feladat: Kategórián belül hasonló cikkcímek felismerése CSAK CÍM alapján.
Fontos: Szinonimák, jelentés és tartalmi összefüggés alapján dönts.

TÉMÁK (feed):
${topicsBlock}

MÁR PUBLIKÁLT CIKKEK:
${existingBlock}

Válaszolj kizárólag JSON-nal:
{
  "results": [
    {
      "topicIndex": 0,
      "state": "new|similar|exists",
      "matchIndexes": [0, 3]
    }
  ]
}

Szabályok:
- "exists": gyakorlatilag ugyanaz a téma/cím.
- "similar": erősen rokon téma, de nem ugyanaz.
- "new": nincs releváns hasonlóság.
- A matchIndexes csak a legrelevánsabb 0-5 találat legyen.
`.trim();

  const parsed = await openaiJson(prompt);
  if (!parsed) return null;
  const rows = Array.isArray(parsed?.results) ? parsed.results : [];
  return rows
    .map((r: any) => ({
      topicIndex: Number(r?.topicIndex),
      state: String(r?.state || "").trim(),
      matchIndexes: Array.isArray(r?.matchIndexes)
        ? r.matchIndexes.map((x: any) => Number(x)).filter((x: number) => Number.isFinite(x) && x >= 0)
        : [],
    }))
    .filter(
      (r: any) =>
        Number.isFinite(r.topicIndex) &&
        (r.state === "new" || r.state === "similar" || r.state === "exists")
    ) as AiTopicDecision[];
}

async function fetchAllPublishedArticlesForSimilarity(): Promise<PublishedArticleForSimilarity[]> {
  const pageSize = 1000;
  const rows: PublishedArticleForSimilarity[] = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabaseServer
      .from("articles")
      .select("category_slug, title, published_at, created_at")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error || !data || data.length === 0) break;
    rows.push(...(data as PublishedArticleForSimilarity[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

export default async function AdminAutomationPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string | string[]; err?: string | string[]; archived?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const ok = cookieStore.get("admin_ok")?.value === "1";
  if (!ok) redirect("/admin");

  const sp = searchParams ? await searchParams : undefined;
  const okParam = sp?.ok;
  const okMessage = Array.isArray(okParam) ? okParam[0] : okParam;
  const errParam = sp?.err;
  const errMessage = Array.isArray(errParam) ? errParam[0] : errParam;
  const archivedParam = sp?.archived;
  const showArchived = Array.isArray(archivedParam) ? archivedParam[0] === "1" : archivedParam === "1";

  const { data: categories } = await supabaseServer
    .from("categories")
    .select("slug, name")
    .order("sort_order", { ascending: true });

  const categoryMap = new Map((categories || []).map((c: any) => [String(c.slug), String(c.name)]));

  const { data: lastRun } = await supabaseServer
    .from("article_automation_runs")
    .select("run_date, status, details, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let queueQuery = supabaseServer
    .from("article_automation_queue")
    .select("*")
    .order("publish_at", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (!showArchived) {
    queueQuery = queueQuery.neq("status", "archived");
  }
  const { data: queue } = await queueQuery;

  const feedsJson = process.env.AUTO_TOPIC_FEEDS_JSON || "";
  let feedsByCategory: Record<string, string[]> = {};
  if (feedsJson) {
    try {
      const parsed = JSON.parse(feedsJson);
      if (parsed && typeof parsed === "object") {
        feedsByCategory = parsed as Record<string, string[]>;
      }
    } catch {
      feedsByCategory = {};
    }
  }

  const feedCategories = Object.keys(feedsByCategory).filter(
    (k) => Array.isArray(feedsByCategory[k]) && feedsByCategory[k].length
  );

  const publishedArticles = await fetchAllPublishedArticlesForSimilarity();
  const publishedByCategory = new Map<string, Array<{ title: string; publishedAt?: string | null }>>();
  for (const row of publishedArticles || []) {
    const key = String((row as any).category_slug || "").trim();
    const title = String((row as any).title || "").trim();
    if (!key || !title) continue;
    if (!publishedByCategory.has(key)) publishedByCategory.set(key, []);
    publishedByCategory.get(key)!.push({
      title,
      publishedAt: (row as any).published_at || (row as any).created_at || null,
    });
  }

  const streamByCategory = new Map<string, StreamTopic[]>();
  const aiUnavailableCategories = new Set<string>();
  for (const categorySlug of feedCategories) {
    const urls = feedsByCategory[categorySlug] || [];
    const nestedItems = await Promise.all(urls.map((u) => fetchFeedItems(u)));
    const items = nestedItems.flat().slice(0, 80);
    const existingInCategory = publishedByCategory.get(categorySlug) || [];
    const aiDecisions = await aiClassifyTopicsByTitle(
      items.map((i) => normalizeFeedTitle(i.title)).filter(Boolean),
      existingInCategory
    );
    if (aiDecisions === null) aiUnavailableCategories.add(categorySlug);
    const decisionByIndex = new Map<number, AiTopicDecision>((aiDecisions || []).map((d) => [d.topicIndex, d]));

    const dedup = new Set<string>();
    const rows: StreamTopic[] = [];
    let topicIdx = -1;
    for (const item of items) {
      const linkNorm = normalizeSourceLink(item.link);
      const cleanedTitle = normalizeFeedTitle(item.title);
      if (!cleanedTitle) continue;
      topicIdx += 1;
      const key = cleanedTitle.toLowerCase();
      if (dedup.has(key)) continue;
      dedup.add(key);

      const decision = decisionByIndex.get(topicIdx);
      const state: StreamTopic["state"] = decision?.state || (aiDecisions === null ? "similar" : "new");
      const matches =
        decision?.matchIndexes
          ?.slice(0, 5)
          .map((i) => existingInCategory[i])
          .filter(Boolean) || [];

      rows.push({
        categorySlug,
        title: cleanedTitle,
        summary: cleanSnippet(item.summary, 350),
        link: linkNorm || item.link,
        publishedAt: item.publishedAt,
        state,
        matches,
      });

      if (rows.length >= 15) break;
    }

    const sorted = rows.sort((a, b) => {
      if (a.state !== b.state) {
        const rank = { new: 0, similar: 1, exists: 2 } as const;
        return rank[a.state] - rank[b.state];
      }
      const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return tb - ta;
    });

    streamByCategory.set(categorySlug, sorted);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automation</h1>
        <p className="text-sm text-gray-600 mt-1">
          Félautomata mód: RSS streamből egy kattintással tudsz cikket indítani. A fact-check nem blokkolja a publikálást.
        </p>
        {errMessage ? (
          <div className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{errMessage}</div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600">
          {lastRun ? (
            <span>
              Utolsó futás: {lastRun.run_date} • {lastRun.status}
            </span>
          ) : (
            <span>Még nem volt futás.</span>
          )}
          {okMessage === "stream_queued" ? <span className="text-emerald-700">Stream téma sorba állítva és futtatva.</span> : null}
          {okMessage === "queued" ? <span className="text-emerald-700">Prompt sorba állítva.</span> : null}
        </div>
      </div>

      <div className="border rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Téma Stream (RSS)</h2>
          <div className="text-xs text-gray-600">AI címvizsgálat (kategórián belül): zöld új • sárga hasonló • piros már feldolgozott</div>
        </div>
        {aiUnavailableCategories.size > 0 ? (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            AI címvizsgálat jelenleg nem elérhető ezeknél a kategóriáknál: {Array.from(aiUnavailableCategories).join(", ")}
          </div>
        ) : null}

        {feedCategories.length === 0 ? (
          <div className="text-sm text-gray-600">Nincs beállítva `AUTO_TOPIC_FEEDS_JSON`.</div>
        ) : (
          <div className="space-y-4">
            {feedCategories.map((categorySlug) => {
              const topics = streamByCategory.get(categorySlug) || [];
              return (
                <div key={categorySlug} className="border rounded-xl p-3 space-y-3">
                  <div className="text-sm font-semibold">{categoryMap.get(categorySlug) || categorySlug}</div>
                  {topics.length === 0 ? (
                    <div className="text-xs text-gray-500">Nincs beolvasható feed elem.</div>
                  ) : (
                    <div className="space-y-2">
                      {topics.map((topic, idx) => {
                        const meta = stateMeta(topic.state);
                        return (
                          <div key={`${topic.link}-${idx}`} className="border rounded-lg p-3 grid gap-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="font-medium text-sm">{topic.title}</div>
                              <span className={`text-xs px-2 py-0.5 rounded-full border ${meta.cls}`}>
                                {meta.label}
                              </span>
                            </div>
                            {topic.matches.length > 0 ? (
                              <div className="text-xs text-gray-600">
                                Hasonló meglévő cikkek:
                                <div className="mt-1 space-y-1">
                                  {topic.matches.map((m, i) => (
                                    <div key={`${m.title}-${i}`}>
                                      <span className="font-medium">{m.title}</span>
                                      {m.publishedAt ? ` (${formatBudapest(m.publishedAt)})` : ""}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {topic.summary ? <div className="text-xs text-gray-700">{topic.summary}</div> : null}
                            <div className="text-xs text-gray-500">
                              Forrás:{" "}
                              <a href={topic.link} target="_blank" rel="noreferrer" className="underline">
                                {sourceHostLabel(topic.link)}
                              </a>
                            </div>
                            <div>
                              <form
                                action={async (formData) => {
                                  "use server";
                                  const category = String(formData.get("category_slug") || "").trim();
                                  const title = cleanSnippet(String(formData.get("topic_title") || ""), 220);
                                  const summary = cleanSnippet(String(formData.get("topic_summary") || ""), 700);
                                  const link = normalizeSourceLink(String(formData.get("topic_link") || "").trim());
                                  if (!category || !title || !link) {
                                    redirect("/admin/automation?err=Hi%C3%A1nyz%C3%B3%20stream%20adat");
                                  }

                                  const prompt = [
                                    `Külső trend téma (forrás inspiráció): ${title}`,
                                    summary ? `Rövid kivonat: ${summary}` : "",
                                    `Forrás link: ${link}`,
                                    "",
                                    "Írj új, eredeti cikket a témáról saját szerkesztésben. Ne másold a forrást, csak inspirációnak használd.",
                                  ]
                                    .filter(Boolean)
                                    .join("\n");

                                  const { data: last } = await supabaseServer
                                    .from("article_automation_queue")
                                    .select("position")
                                    .order("position", { ascending: false })
                                    .limit(1)
                                    .maybeSingle();

                                  const position = Number(last?.position || 0) + 1;
                                  const { error } = await supabaseServer.from("article_automation_queue").insert({
                                    category_slug: category,
                                    prompt,
                                    position,
                                    status: "pending",
                                    publish_at: new Date().toISOString(),
                                    post_to_facebook: false,
                                    post_to_pinterest: false,
                                    post_to_x: false,
                                  });
                                  if (error) {
                                    redirect(`/admin/automation?err=${encodeURIComponent(error.message)}`);
                                  }

                                  const secret = process.env.CRON_SECRET || "";
                                  const h = await headers();
                                  const host = h.get("x-forwarded-host") || h.get("host") || "";
                                  const proto = h.get("x-forwarded-proto") || "http";
                                  const base = process.env.NEXT_PUBLIC_SITE_URL || (host ? `${proto}://${host}` : "");
                                  if (secret && base) {
                                    const url = `${base}/api/cron/auto-articles?secret=${encodeURIComponent(secret)}&force=1`;
                                    await fetch(url, { method: "GET", cache: "no-store" });
                                  }

                                  redirect("/admin/automation?ok=stream_queued");
                                }}
                              >
                                <input type="hidden" name="category_slug" value={topic.categorySlug} />
                                <input type="hidden" name="topic_title" value={topic.title} />
                                <input type="hidden" name="topic_summary" value={topic.summary || ""} />
                                <input type="hidden" name="topic_link" value={topic.link} />
                                <AdminActionButton className="border rounded-lg px-3 py-1.5 text-xs" pendingText="Indítás...">
                                  Cikk generálása ebből
                                </AdminActionButton>
                              </form>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-gray-600">{showArchived ? "Archivált elemek is látszanak." : "Archivált elemek rejtve."}</div>
        <div className="flex items-center gap-3 text-xs">
          <Link href={showArchived ? "/admin/automation" : "/admin/automation?archived=1"} className="underline">
            {showArchived ? "Archiváltak elrejtése" : "Archiváltak mutatása"}
          </Link>
          <form
            action={async () => {
              "use server";
              await supabaseServer.from("article_automation_queue").update({ status: "archived" }).eq("status", "done");
              redirect("/admin/automation");
            }}
          >
            <AdminActionButton className="text-gray-700 underline" pendingText="Archiválás...">
              Done elemek archiválása
            </AdminActionButton>
          </form>
        </div>
      </div>

      <form
        className="space-y-3 border rounded-2xl p-4"
        action={async (formData) => {
          "use server";
          const category_slug = String(formData.get("category_slug") || "").trim() || null;
          const prompt = String(formData.get("prompt") || "").trim();
          const positionRaw = String(formData.get("position") || "").trim();
          const positionInput = positionRaw ? Number(positionRaw) : null;
          const publishAtLocal = String(formData.get("publish_at") || "").trim();
          const publish_at = budapestLocalToUtcIso(publishAtLocal);
          const postToFacebook = formData.get("post_to_facebook") === "on";
          const postToPinterest = formData.get("post_to_pinterest") === "on";
          const postToX = formData.get("post_to_x") === "on";

          if (!prompt) redirect("/admin/automation");
          if (!publish_at) redirect("/admin/automation?err=Hi%C3%A1nyzik%20az%20id%C5%91z%C3%ADt%C3%A9s");

          let position = positionInput;
          if (!position || !Number.isFinite(position)) {
            const { data: last } = await supabaseServer
              .from("article_automation_queue")
              .select("position")
              .order("position", { ascending: false })
              .limit(1)
              .maybeSingle();
            position = (last?.position || 0) + 1;
          }

          await supabaseServer.from("article_automation_queue").insert({
            category_slug,
            prompt,
            position,
            status: "pending",
            publish_at,
            post_to_facebook: postToFacebook,
            post_to_pinterest: postToPinterest,
            post_to_x: postToX,
          });

          redirect("/admin/automation?ok=queued");
        }}
      >
        <div className="text-sm font-semibold">Manuális prompt + időzítés</div>
        <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
          <div className="space-y-1">
            <label className="text-sm font-semibold">Kategória</label>
            <select name="category_slug" className="w-full border rounded-xl px-3 py-2">
              <option value="">— nincs —</option>
              {categories?.map((c: any) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold">Prompt</label>
            <textarea
              name="prompt"
              className="w-full border rounded-xl px-3 py-2 h-24"
              placeholder="Miről szóljon a cikk? Adj meg kulcspontokat is."
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          <div className="space-y-1">
            <label className="text-sm font-semibold">Időzítés (Budapest)</label>
            <input name="publish_at" type="datetime-local" className="border rounded-xl px-3 py-2 w-full" />
          </div>
          <div className="space-y-2 min-w-0">
            <div className="text-sm font-semibold">Social megosztás</div>
            <div className="grid gap-2">
              <label className="grid grid-cols-[16px_1fr] items-center gap-2 text-sm max-w-full">
                <input name="post_to_facebook" type="checkbox" defaultChecked />
                <span className="break-words">FB + IG (Meta cross-post)</span>
              </label>
              <label className="grid grid-cols-[16px_1fr] items-center gap-2 text-sm max-w-full">
                <input name="post_to_pinterest" type="checkbox" />
                <span className="break-words">Pinterest</span>
              </label>
              <label className="grid grid-cols-[16px_1fr] items-center gap-2 text-sm max-w-full">
                <input name="post_to_x" type="checkbox" />
                <span className="break-words">X</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="space-y-1">
            <label className="text-sm font-semibold">Sorrend (opcionális)</label>
            <input name="position" type="number" className="border rounded-xl px-3 py-2 w-40" placeholder="pl. 12" />
          </div>
          <AdminActionButton className="bg-black text-white rounded-xl px-4 py-2 text-sm" pendingText="Mentés...">
            + Hozzáadás
          </AdminActionButton>
        </div>
      </form>

      <div className="border rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 bg-gray-50 text-sm font-semibold px-4 py-2">
          <div className="col-span-1">#</div>
          <div className="col-span-2">Státusz</div>
          <div className="col-span-2">Időzítés</div>
          <div className="col-span-2">Social</div>
          <div className="col-span-2">Kategória</div>
          <div className="col-span-2">Prompt</div>
          <div className="col-span-1">Cikk ID</div>
          <div className="col-span-2">Művelet</div>
        </div>

        <div className="hidden md:block">
          {(queue || []).map((q: any) => (
            <div key={q.id} className="grid grid-cols-12 px-4 py-3 border-t text-sm items-start gap-y-2">
              <div className="col-span-1 text-gray-600">{q.position}</div>
              <div className="col-span-2">
                <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-50">{q.status}</span>
                {q.last_error ? <div className="text-xs text-red-600 mt-1 line-clamp-2">{q.last_error}</div> : null}
              </div>
              <div className="col-span-2 text-gray-700">{formatBudapest(q.publish_at)}</div>
              <div className="col-span-2 text-gray-700">
                {[q.post_to_facebook ? "FB/IG" : null, q.post_to_pinterest ? "Pin" : null, q.post_to_x ? "X" : null]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </div>
              <div className="col-span-2 text-gray-700">{q.category_slug || "—"}</div>
              <div className="col-span-2 text-gray-700 whitespace-pre-wrap">{q.prompt}</div>
              <div className="col-span-1 text-xs text-gray-600 break-all">{q.article_id || "—"}</div>
              <div className="col-span-2 flex items-center gap-2 flex-wrap">
                {q.status === "error" ? (
                  <form
                    action={async () => {
                      "use server";
                      await supabaseServer
                        .from("article_automation_queue")
                        .update({ status: "pending", last_error: null, publish_at: new Date().toISOString() })
                        .eq("id", q.id);
                      redirect("/admin/automation");
                    }}
                  >
                    <AdminActionButton className="text-amber-700 underline text-sm" pendingText="Újrapróbálás...">
                      Újrapróbálás
                    </AdminActionButton>
                  </form>
                ) : null}
                {q.status === "done" ? (
                  <form
                    action={async () => {
                      "use server";
                      await supabaseServer.from("article_automation_queue").update({ status: "archived" }).eq("id", q.id);
                      redirect("/admin/automation");
                    }}
                  >
                    <AdminActionButton className="text-gray-700 underline text-sm" pendingText="Archiválás...">
                      Archiválás
                    </AdminActionButton>
                  </form>
                ) : null}
                <form
                  action={async () => {
                    "use server";
                    await supabaseServer.from("article_automation_queue").delete().eq("id", q.id);
                    redirect("/admin/automation");
                  }}
                >
                  <AdminActionButton className="text-red-700 underline text-sm" pendingText="Törlés...">
                    Törlés
                  </AdminActionButton>
                </form>
              </div>
            </div>
          ))}
        </div>

        {queue?.length === 0 ? <div className="px-4 py-4 text-sm text-gray-600">Nincs még felvitt prompt.</div> : null}
      </div>
    </div>
  );
}
