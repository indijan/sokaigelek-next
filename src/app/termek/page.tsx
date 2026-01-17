import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { cdnImageUrl } from "@/lib/cdn";
import { formatHuf } from "@/lib/formatHuf";

const PAGE_SIZE = 12;

export const revalidate = 900;

function stripHtml(input: string) {
  return input
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function normalizeSpaces(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function cleanExcerpt(input: unknown, maxLen = 140) {
  if (!input) return "";
  const raw = String(input);
  const cleaned = normalizeSpaces(stripHtml(raw));
  if (!cleaned) return "";
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen - 1).trimEnd() + "…" : cleaned;
}

function safeImageUrl(input: unknown) {
  const raw = (input ? String(input) : "").trim();
  if (!raw || raw.toLowerCase() === "null") return "/images/placeholder-product.jpg";

  // If the URL/text is already corrupted (mojibake), don't try to render it.
  // Examples seen: "¬Æ", "Ã", "Å".
  if (/[¬ÃÅ]/.test(raw)) return "/images/placeholder-product.jpg";

  return cdnImageUrl(raw);
}

function formatFt(value: unknown) {
  const n = typeof value === "number" ? value : Number(String(value || "").replace(/\s/g, "").replace(/,/g, "."));
  if (!Number.isFinite(n) || n <= 0) return "";
  return formatHuf(n);
}

export default async function ProductsIndexPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; tag?: string; slugs?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const slugFilter = String(params.slugs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const page = Number(params.page ?? "1");
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const offset = (safePage - 1) * PAGE_SIZE;

  const { error: statusErr } = await supabaseServer
    .from("products")
    .select("status")
    .limit(1);
  const supportsStatus = !statusErr;

  // --- Automatikus tag lista (dinamikus) ---
  const tagMap = new Map<string, string>();
  const tagCountMap = new Map<string, number>();
  let totalAllCount = 0;
  let dynamicTags: string[] = [];
  if (!slugFilter.length) {
    const tagQuery = supabaseServer.from("products").select("tags");
    const { data: tagRows } = supportsStatus
      ? await tagQuery.eq("status", "published")
      : await tagQuery;

    (tagRows ?? []).forEach((row: any) => {
      totalAllCount += 1;
      if (Array.isArray(row.tags)) {
        const seen = new Set<string>();
        row.tags.forEach((t: string) => {
          if (!t || typeof t !== "string") return;
          const trimmed = t.trim();
          if (!trimmed) return;
          const key = trimmed.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            tagCountMap.set(key, (tagCountMap.get(key) ?? 0) + 1);
          }
          if (!tagMap.has(key)) tagMap.set(key, trimmed);
        });
      }
    });

    dynamicTags = Array.from(tagMap.values()).sort((a, b) => a.localeCompare(b, "hu"));
  }

  const selectFields = "id, slug, name, short, image_url, price, regular_price, status";
  let query = slugFilter.length
    ? supabaseServer.from("products").select(selectFields).order("name", { ascending: true })
    : supabaseServer.from("products").select(selectFields, { count: "exact" }).order("name", { ascending: true });

  // Tag filter (will work once tags are stored, e.g. in `tags` array column)
  const activeTagRaw = String(params.tag ?? "osszes");
  const activeTagLower = activeTagRaw.toLowerCase();
  if (!slugFilter.length && activeTagLower !== "osszes") {
    query = query.contains("tags", [activeTagRaw]);
  }
  if (slugFilter.length) {
    query = query.in("slug", slugFilter);
  }
  if (supportsStatus) {
    query = query.eq("status", "published");
  }

  const { data: products, error, count } = slugFilter.length
    ? await query
    : await query.range(offset, offset + PAGE_SIZE - 1);

  const visibleProducts = products ?? [];

  const total = slugFilter.length ? visibleProducts.length : count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900">
          Termékek <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">UI v2</span>
        </h1>
        <p className="mt-2 text-red-600">Hiba: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {slugFilter.length ? "Kapcsolódó termékek" : "Étrend-kiegészítők"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {slugFilter.length
              ? "Ezeket a termékeket ajánljuk a cikk tartalma alapján."
              : "Válogass a kiemelt, természetes összetevőkből készült termékeink közül."}
          </p>
          {/* TAG SZŰRŐ (server-oldali, query param alapú) */}
          {!slugFilter.length ? (() => {
            const activeTag = activeTagRaw;
            const tagOptions: Array<{ label: string; value: string; count: number }> = [
              { label: "Összes", value: "osszes", count: totalAllCount },
              ...dynamicTags.map((t) => ({
                label: t,
                value: t,
                count: tagCountMap.get(t.toLowerCase()) ?? 0,
              })),
            ];

            return (
              <div className="mt-6 flex flex-wrap gap-2">
                {tagOptions.map((t) => {
                  const isActive =
                    t.value === "osszes" ? activeTagLower === "osszes" : activeTag === t.value;
                  const href = t.value === "osszes" ? "/termek" : `/termek?tag=${encodeURIComponent(t.value)}`;

                  return (
                    <Link
                      key={t.value}
                      href={href}
                      className={
                        isActive
                          ? "inline-flex items-center gap-2 rounded-full bg-[#9a3412] ring-2 ring-[#c2410b]/40 px-4 py-1.5 text-sm font-semibold text-white !text-white shadow-sm transition hover:bg-[#d3541a] hover:!text-white"
                          : "inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      }
                      aria-current={isActive ? "page" : undefined}
                    >
                      <span>{t.label}</span>
                      <span
                        className={
                          isActive
                            ? "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-white/20 px-1.5 text-[11px] font-semibold text-white"
                            : "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-700"
                        }
                      >
                        {t.count}
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })() : null}
        </div>
        {slugFilter.length ? (
          <Link
            href="/termek"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Összes termék
            <span aria-hidden>→</span>
          </Link>
        ) : null}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visibleProducts.map((p) => {
          const excerpt = cleanExcerpt(p.short, 150);
          const img = safeImageUrl(p.image_url);
          const dealPrice = formatFt(p.price);
          const basePrice = formatFt(p.regular_price);

          return (
            <Link
              key={p.id}
              href={`/termek/${p.slug}`}
              className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#c2410b]/30"
            >
              {/* KÉP */}
              <div className="relative aspect-[16/10] bg-slate-50">
                <img
                  src={img}
                  alt={p.name}
                  loading="lazy"
                  decoding="async"
                  width={480}
                  height={300}
                  className="absolute inset-0 h-full w-full object-contain p-6 transition group-hover:scale-[1.02]"
                />
              </div>

              {/* TARTALOM */}
              <div className="p-5">
                <h2 className="text-lg font-semibold leading-snug tracking-tight text-slate-900">
                  {p.name}
                </h2>

                {excerpt ? (
                  <p className="mt-2 text-sm text-slate-600">
                    {excerpt}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">
                    Rövid leírás hamarosan.
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-sm leading-tight text-slate-900">
                    {/* Alap ár = regular_price, Sokáig élek ár = price */}
                    {basePrice ? (
                      <div className="text-slate-600">
                        <span className="mr-1">Alap ár:</span>
                        <span className="line-through">{basePrice}</span>
                      </div>
                    ) : null}

                    {dealPrice ? (
                      <div className="mt-0.5">
                        <span className="mr-1 text-slate-600">Sokáig élek ár:</span>
                        <span className="text-base font-semibold text-[#c2410b]">{dealPrice}</span>
                      </div>
                    ) : (
                      <div className="mt-0.5 text-slate-600">Ár hamarosan</div>
                    )}
                  </div>

                  <span className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-gradient-to-r from-[#c2410b] to-[#d3541a] shadow-md hover:shadow-lg hover:scale-[1.03] px-4 py-2 text-sm font-semibold text-white shadow-sm transition group-hover:bg-[#d3541a]">
                    Megnézem
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* LAPOZÓ */}
      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            const active = p === safePage;
            return (
              <Link
                key={p}
                href={`/termek?page=${p}${params.tag ? `&tag=${params.tag}` : ""}`}
                className={
                  active
                    ? "rounded-full bg-[#c2410b] px-4 py-2 text-sm font-semibold text-white shadow-sm !text-white transition hover:bg-[#d3541a]"
                    : "rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                }
              >
                {p}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
