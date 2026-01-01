import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";

const PAGE_SIZE = 20;

export default async function AdminArticlesPage({
    searchParams,
}: {
    searchParams: Promise<{
        cat?: string | string[];
        status?: string | string[];
        q?: string | string[];
        err?: string | string[];
        page?: string | string[];
    }>;
}) {
    const cookieStore = await cookies();
    const ok = cookieStore.get("admin_ok")?.value === "1";
    if (!ok) redirect("/admin");

    const { cat, status, q: qParam, err, page: pageParam } = await searchParams;
    const selectedCat = Array.isArray(cat) ? (cat[0] || "").trim() : (cat || "").trim();
    const selectedStatus = Array.isArray(status) ? (status[0] || "").trim() : (status || "").trim();
    const searchQ = Array.isArray(qParam) ? (qParam[0] || "").trim() : (qParam || "").trim();
    const errMessage = Array.isArray(err) ? err[0] : err;
    const rawPage = Array.isArray(pageParam) ? pageParam[0] : pageParam;
    const page = Number(rawPage || "1");
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const offset = (safePage - 1) * PAGE_SIZE;

    const { data: categories } = await supabaseServer
        .from("categories")
        .select("slug, name")
        .order("sort_order", { ascending: true });

    let query = supabaseServer
        .from("articles")
        .select("id, slug, title, status, updated_at, created_at, category_slug", { count: "exact" })
        .order("updated_at", { ascending: false });

    if (selectedCat) query = query.eq("category_slug", selectedCat);
    if (selectedStatus) query = query.eq("status", selectedStatus);
    if (searchQ) {
        // search in title OR slug
        const like = `%${searchQ}%`;
        query = query.or(`title.ilike.${like},slug.ilike.${like}`);
    }

    const { data: articles, error, count } = await query.range(
        offset,
        offset + PAGE_SIZE - 1
    );

    if (error) {
        return (
            <main className="max-w-3xl mx-auto px-4 py-10">
                <div className="text-red-600">Hiba: {error.message}</div>
            </main>
        );
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const baseParams = new URLSearchParams();
    if (selectedCat) baseParams.set("cat", selectedCat);
    if (selectedStatus) baseParams.set("status", selectedStatus);
    if (searchQ) baseParams.set("q", searchQ);

    return (
        <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
            {errMessage ? (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                    {errMessage}
                </div>
            ) : null}

            <form className="flex items-end gap-3 flex-wrap" method="GET">
                <div className="space-y-1">
                    <label className="text-sm font-semibold">Kategória szűrő</label>
                    <select
                        name="cat"
                        defaultValue={selectedCat}
                        className="border rounded-xl px-3 py-2 text-sm bg-white"
                    >
                        <option value="">— összes —</option>
                        {categories?.map((c) => (
                            <option key={c.slug} value={c.slug}>
                                {c.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="space-y-1">
                    <label className="text-sm font-semibold">Státusz</label>
                    <select
                        name="status"
                        defaultValue={selectedStatus}
                        className="border rounded-xl px-3 py-2 text-sm bg-white"
                    >
                        <option value="">— összes —</option>
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                    </select>
                </div>

                <div className="space-y-1 min-w-[240px] flex-1">
                    <label className="text-sm font-semibold">Keresés</label>
                    <input
                        name="q"
                        defaultValue={searchQ}
                        placeholder="Keresés címre vagy slugra…"
                        className="border rounded-xl px-3 py-2 text-sm bg-white w-full"
                    />
                </div>

                <button className="border rounded-xl px-4 py-2 text-sm">Szűrés</button>

                {selectedCat || selectedStatus || searchQ ? (
                    <Link className="text-sm underline" href="/admin/articles">
                        Szűrés törlése
                    </Link>
                ) : null}
            </form>
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <h1 className="text-2xl font-bold">Cikkek</h1>

                <form
                    action={async () => {
                        "use server";

                        const slug = `uj-cikk-${Date.now()}`;

                        // csak minimál mezők -> akkor is működik, ha még nem minden oszlop létezik / van NOT NULL
                        const { error } = await supabaseServer.from("articles").insert({
                            slug,
                            title: "Új cikk",
                        });

                        if (error) {
                            // ideiglenesen dobd vissza a hibaüzenetet az URL-be
                            redirect(`/admin/articles?err=${encodeURIComponent(error.message)}`);
                        }

                        redirect(`/admin/articles/${slug}`);
                    }}
                >
                    <button className="bg-black text-white rounded-xl px-4 py-2 text-sm">
                        + Új cikk
                    </button>
                </form>
            </div>

            <div className="border rounded-2xl overflow-hidden">
                <div className="grid grid-cols-12 bg-gray-50 text-sm font-semibold px-4 py-2">
                    <div className="col-span-6">Cím</div>
                    <div className="col-span-4">Slug</div>
                    <div className="col-span-2">Művelet</div>
                </div>

                {articles?.map((a) => (
                    <div key={a.id} className="grid grid-cols-12 px-4 py-3 border-t text-sm">
                        <div className="col-span-6">
                            <div className="font-medium">{a.title}</div>
                            <div className="text-xs text-gray-500">{a.status}</div>
                        </div>
                        <div className="col-span-4 text-gray-600">{a.slug}</div>
                        <div className="col-span-2">
                            <Link className="underline" href={`/admin/articles/${a.slug}`}>
                                Szerkesztés
                            </Link>
                        </div>
                    </div>
                ))}
            </div>

            {totalPages > 1 ? (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                    {Array.from({ length: totalPages }).map((_, i) => {
                        const p = i + 1;
                        const params = new URLSearchParams(baseParams);
                        params.set("page", String(p));
                        const href = `/admin/articles?${params.toString()}`;
                        const active = p === safePage;
                        return (
                            <Link
                                key={p}
                                href={href}
                                className={
                                    active
                                        ? "rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white"
                                        : "rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                                }
                            >
                                {p}
                            </Link>
                        );
                    })}
                </div>
            ) : null}
        </main>
    );
}
