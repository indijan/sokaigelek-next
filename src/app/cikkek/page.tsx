import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
import { cdnImageUrl } from "@/lib/cdn";

export const revalidate = 60;

export default async function ArticlesIndexPage({
    searchParams,
}: {
    searchParams?:
        | Promise<{ cat?: string | string[]; page?: string | string[] }>
        | { cat?: string | string[]; page?: string | string[] };
}) {
    const sp = searchParams ? await Promise.resolve(searchParams) : undefined;
    const catParam = sp?.cat;
    const activeCat = Array.isArray(catParam) ? catParam[0] : catParam;

    const pageParam = sp?.page;
    const pageRaw = Array.isArray(pageParam) ? pageParam[0] : pageParam;
    const page = Math.max(1, Number.parseInt(String(pageRaw ?? "1"), 10) || 1);

    const perPage = 12;
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const [categoriesRes, articlesRes, categoryCountRes] = await Promise.all([
        supabaseServer
            .from("categories")
            .select("id, name, slug, sort_order, created_at")
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true }),

        (() => {
          const q = supabaseServer
            .from("articles")
            .select(
              "id, slug, title, excerpt, category_slug, image_url, featured_image_url, cover_image_url, thumbnail_url, image, featured_image, hero_image_url, created_at",
              { count: "exact" }
            )
            .eq("status", "published")
            .order("created_at", { ascending: false })
            .range(from, to);
          return activeCat ? q.eq("category_slug", activeCat) : q;
        })(),
        supabaseServer
            .from("articles")
            .select("category_slug")
            .eq("status", "published"),
    ]);

    const categories = (categoriesRes as any).data as any[] | null;
    const categoriesError = (categoriesRes as any).error as any;

    const articles = (articlesRes as any).data as any[] | null;
    const error = (articlesRes as any).error as any;
    const categoryRows = (categoryCountRes as any).data as any[] | null;
    const totalCount = Number((articlesRes as any).count ?? 0);
    const totalAllCount = (categoryRows || []).length || totalCount;

    const categoryCountMap = new Map<string, number>();
    (categoryRows || []).forEach((row: any) => {
        const key = String(row?.category_slug || "").trim();
        if (!key) return;
        categoryCountMap.set(key, (categoryCountMap.get(key) || 0) + 1);
    });


    const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
    const hasPrev = page > 1;
    const hasNext = page < totalPages;

    const buildPageHref = (p: number) => {
        const params = new URLSearchParams();
        if (activeCat) params.set("cat", String(activeCat));
        if (p > 1) params.set("page", String(p));
        const qs = params.toString();
        return qs ? `/cikkek?${qs}` : "/cikkek";
    };

    if (error || categoriesError) {
        return (
            <div className="mx-auto max-w-3xl px-4 py-10">
                <h1 className="text-2xl font-bold">Jóllét Kalauz</h1>
                {error ? <p className="mt-2 text-red-600">Hiba: {error.message}</p> : null}
                {categoriesError ? (
                    <p className="mt-2 text-red-600">Kategória hiba: {categoriesError.message}</p>
                ) : null}
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl px-4 py-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="mt-3 text-3xl font-extrabold tracking-tight">Jóllét Kalauz</h1>
                    <p className="mt-2 max-w-2xl text-sm text-gray-600">
                        Tanácsok és válogatott ajánlások a jobb közérzetért és a hosszú egészséges életért.
                    </p>
                </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
                <Link
                    href="/cikkek"
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                        !activeCat
                            ? "border-amber-300 bg-amber-50 text-amber-900"
                            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                >
                    Összes ({totalAllCount})
                </Link>

                {(categories ?? []).map((c: any) => {
                    const slug = c.slug ?? c.category_slug;
                    const label = c.name ?? c.title ?? slug;
                    if (!slug) return null;

                    const isActive = activeCat === slug;
                    return (
                        <Link
                            key={c.id ?? slug}
                            href={`/cikkek?cat=${encodeURIComponent(String(slug))}`}
                            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                                isActive
                                    ? "border-amber-300 bg-amber-50 text-amber-900"
                                    : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                        >
                            {String(label)} ({categoryCountMap.get(String(slug)) || 0})
                        </Link>
                    );
                })}
            </div>

            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {((articles ?? []) as any[]).map((a) => (
                    <Link
                        key={a.id}
                        href={`/cikkek/${a.slug}`}
                        className="group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                        <div className="relative h-40 w-full overflow-hidden bg-gray-100">
                          {(() => {
                            const img =
                              a.image_url ??
                              a.featured_image_url ??
                              a.cover_image_url ??
                              a.thumbnail_url ??
                              a.image ??
                              a.featured_image ??
                              a.featured_image ??
                              a.hero_image_url ??
                              null;

                            return img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={cdnImageUrl(String(img))}
                                alt={a.title}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                loading="lazy"
                              />
                            ) : (
                              <div className="h-full w-full bg-gradient-to-br from-amber-50 via-white to-rose-50" />
                            );
                          })()}

                          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-3">
                            <div className="inline-flex max-w-[75%] items-center gap-2 rounded-full border bg-white/80 px-3 py-1 text-xs text-gray-700 backdrop-blur">
                              <span className="h-2 w-2 rounded-full bg-amber-500" />
                              <span className="truncate">{a.category_slug ?? "Kategória nélkül"}</span>
                            </div>
                            <div className="rounded-full border bg-white/80 px-3 py-1 text-xs text-gray-600 backdrop-blur group-hover:text-gray-900">
                              Olvasom
                            </div>
                          </div>
                        </div>

                        <div className="p-4">
                            <div className="text-base font-semibold leading-snug tracking-tight group-hover:underline">
                                {a.title}
                            </div>

                            {a.excerpt ? (
                                <div className="mt-2 text-sm leading-relaxed text-gray-600 line-clamp-3">
                                    {a.excerpt}
                                </div>
                            ) : (
                                <div className="mt-2 text-sm text-gray-500">
                                    Rövid kivonat még nincs megadva.
                                </div>
                            )}

                            <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                                <span className="truncate">/{a.slug}</span>
                                <span className="text-amber-700">→</span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {(articles ?? []).length === 0 ? (
                <div className="mt-10 rounded-2xl border bg-white p-6 text-sm text-gray-600">
                    {activeCat ? "Ebben a kategóriában még nincs bejegyzés." : "Még nincs bejegyzés."}
                </div>
            ) : null}

            {totalPages > 1 ? (
                <div className="mt-10 flex flex-col items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-4 sm:flex-row">
                    <div className="text-sm text-gray-600">
                        Oldal <span className="font-semibold text-gray-900">{page}</span> / {totalPages}
                        <span className="hidden sm:inline"> · Összesen {totalCount} rekord</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <Link
                            href={buildPageHref(page - 1)}
                            aria-disabled={!hasPrev}
                            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                                hasPrev
                                    ? "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                                    : "pointer-events-none border-gray-100 bg-gray-50 text-gray-400"
                            }`}
                        >
                            ← Előző
                        </Link>

                        <Link
                            href={buildPageHref(page + 1)}
                            aria-disabled={!hasNext}
                            className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                                hasNext
                                    ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
                                    : "pointer-events-none border-gray-100 bg-gray-50 text-gray-400"
                            }`}
                        >
                            Következő →
                        </Link>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
