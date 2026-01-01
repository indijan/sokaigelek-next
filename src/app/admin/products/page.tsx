import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";

const PAGE_SIZE = 20;

export default async function AdminProductsPage({
  searchParams,
}: {
  // Next.js 16+: searchParams is async (Promise) in Server Components
  searchParams?: Promise<{ delete?: string | string[]; err?: string | string[]; q?: string | string[] }>;
}) {
    const cookieStore = await cookies();
    const ok = cookieStore.get("admin_ok")?.value === "1";
    if (!ok) redirect("/admin");

  const params = (await searchParams) ?? {};
  const delParam = (params as any).delete;
  const pendingDeleteId = Array.isArray(delParam) ? delParam[0] : delParam;
  const errParam = (params as any).err;
  const errMessage = Array.isArray(errParam) ? errParam[0] : errParam;
  const qParam = (params as any).q;
  const searchQ = Array.isArray(qParam) ? qParam[0] : qParam;
  const trimmedQ = String(searchQ || "").trim();
  const pageParam = (params as any).page;
  const rawPage = Array.isArray(pageParam) ? pageParam[0] : pageParam;
  const page = Number(rawPage || "1");
  const safePage = Number.isFinite(page) && page > 0 ? page : 1;
  const offset = (safePage - 1) * PAGE_SIZE;

  let query = supabaseServer
    .from("products")
    .select("id, slug, name, updated_at, is_featured", { count: "exact" })
    .order("updated_at", { ascending: false });

  if (trimmedQ) {
    const like = `%${trimmedQ}%`;
    query = query.or(`name.ilike.${like},slug.ilike.${like}`);
  }

  const { data: products, error, count } = await query.range(
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

  // --- Delete confirmation UI (server-side) ---
  const pendingDeleteProduct = pendingDeleteId
    ? products?.find((x) => String(x.id) === String(pendingDeleteId))
    : null;

  const deleteForm = pendingDeleteProduct ? (
    <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-semibold">Törlés megerősítése</div>
          <div className="text-sm text-gray-700">
            Biztosan törlöd ezt a terméket? <span className="font-medium">"{pendingDeleteProduct.name}"</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/products"
            className="rounded-xl px-3 py-2 text-sm border bg-white hover:bg-gray-50"
          >
            Mégse
          </Link>

          <form
            action={async () => {
              "use server";
              await supabaseServer.from("products").delete().eq("id", pendingDeleteProduct.id);
              redirect("/admin/products");
            }}
          >
            <button
              className="rounded-xl px-3 py-2 text-sm bg-red-600 text-white hover:bg-red-700"
            >
              Igen, törlés
            </button>
          </form>
        </div>
      </div>
    </div>
  ) : null;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const baseParams = new URLSearchParams();
  if (trimmedQ) baseParams.set("q", trimmedQ);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
      {errMessage ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
          {errMessage}
        </div>
      ) : null}
      {deleteForm}
      <form className="flex items-end gap-3 flex-wrap" method="GET">
        <div className="space-y-1 min-w-[240px] flex-1">
          <label className="text-sm font-semibold">Keresés</label>
          <input
            name="q"
            defaultValue={trimmedQ}
            placeholder="Keresés névre vagy slugra…"
            className="border rounded-xl px-3 py-2 text-sm bg-white w-full"
          />
        </div>

        <button className="border rounded-xl px-4 py-2 text-sm">Szűrés</button>

        {trimmedQ ? (
          <Link className="text-sm underline" href="/admin/products">
            Szűrés törlése
          </Link>
        ) : null}
      </form>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Termékek</h1>
        <Link className="bg-black text-white rounded-xl px-4 py-2 text-sm" href="/admin/products/uj">
          + Új termék
        </Link>
      </div>

      <div className="border rounded-2xl overflow-hidden">
        <div className="grid grid-cols-12 bg-gray-50 text-sm font-semibold px-4 py-2">
          <div className="col-span-5">Név</div>
          <div className="col-span-3">Slug</div>
          <div className="col-span-1 text-center">Kiemelt</div>
          <div className="col-span-3">Műveletek</div>
        </div>

        {products?.map((p) => (
          <div key={p.id} className="grid grid-cols-12 px-4 py-3 border-t text-sm items-center">
            <div className="col-span-5 flex items-center gap-2">
              <span>{p.name}</span>
              {p.is_featured ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  Kiemelt
                </span>
              ) : null}
            </div>
            <div className="col-span-3 text-gray-600">{p.slug}</div>
            <div className="col-span-1 text-center">
              {p.is_featured ? "★" : ""}
            </div>
            <div className="col-span-3 flex items-center gap-2 flex-wrap">
              <Link className="underline" href={`/admin/products/${p.slug}`}>
                Szerkesztés
              </Link>
              <Link
                className="text-red-700 underline"
                href={`/admin/products?delete=${encodeURIComponent(String(p.id))}`}
              >
                Törlés
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
            const href = `/admin/products?${params.toString()}`;
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
