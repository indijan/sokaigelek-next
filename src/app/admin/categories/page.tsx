import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import { supabaseServer } from "@/lib/supabaseServer";

function slugifyHu(input: string) {
    return input
        .trim()
        .toLowerCase()
        // ékezetek levétele (ő/ű is jó)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        // szóköz/underscore -> kötőjel
        .replace(/[\s_]+/g, "-")
        // minden más nem engedett karakter kidobása
        .replace(/[^a-z0-9-]/g, "")
        // többszörös kötőjelek összevonása
        .replace(/-+/g, "-")
        // eleje/vége kötőjel levágása
        .replace(/^-|-$/g, "");
}

export default async function AdminCategoriesPage({
    searchParams,
}: {
    searchParams: Promise<{ delete?: string }>;
}) {
    const sp = await searchParams;
    const deleteId = String(sp?.delete || "");
    // 🔐 admin auth
    const cookieStore = await cookies();
    const ok = cookieStore.get("admin_ok")?.value === "1";
    if (!ok) redirect("/admin");

    // 📥 kategóriák betöltése
    const { data: categories, error } = await supabaseServer
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true });

    if (error) {
        return (
            <main className="max-w-3xl mx-auto px-4 py-10">
                <div className="text-red-600">Hiba: {error.message}</div>
            </main>
        );
    }

    return (
        <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
            <h1 className="text-2xl font-bold">Kategóriák</h1>

            {/* ➕ Új kategória */}
            <form
                className="flex gap-2"
                action={async (formData) => {
                    "use server";

                    const rawName = String(formData.get("name") || "").trim();
                    if (!rawName) return;

                    let slug = slugifyHu(rawName);

                    // slug ütközés
                    const { data: existing } = await supabaseServer
                        .from("categories")
                        .select("id")
                        .eq("slug", slug)
                        .maybeSingle();

                    if (existing) {
                        slug = `${slug}-${Date.now()}`;
                    }

                    // sort_order: a legnagyobb érték + 1
                    // (ne zárjunk be nem-serializálható `categories` változót a Server Action-be)
                    const { data: last } = await supabaseServer
                        .from("categories")
                        .select("sort_order")
                        .order("sort_order", { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    const maxOrder = (last?.sort_order ?? 0) + 1;

                    await supabaseServer.from("categories").insert({
                        name: rawName,
                        slug,
                        sort_order: maxOrder,
                    });

                    redirect("/admin/categories");
                }}
            >
                <input
                    name="name"
                    placeholder="Új kategória neve"
                    className="border rounded-xl px-3 py-2 flex-1"
                />
                <button className="bg-black text-white rounded-xl px-4 py-2">
                    + Hozzáadás
                </button>
            </form>

            {/* 📋 Lista */}
            <div className="border rounded-2xl overflow-hidden">
                <div className="grid grid-cols-12 bg-gray-50 px-4 py-2 text-sm font-semibold">
                    <div className="col-span-4">Név</div>
                    <div className="col-span-4">Slug</div>
                    <div className="col-span-2">Sorrend</div>
                    <div className="col-span-2">Művelet</div>
                </div>

                {categories?.map((cat) => (
                    <div
                        key={cat.id}
                        className="grid grid-cols-12 px-4 py-3 border-t text-sm items-center"
                    >
                        <div className="col-span-4">{cat.name}</div>
                        <div className="col-span-4 text-gray-500">{cat.slug}</div>

                        {/* sorrend */}
                        <form
                            className="col-span-2"
                            action={async (formData) => {
                                "use server";
                                const sort = Number(formData.get("sort_order"));
                                await supabaseServer
                                    .from("categories")
                                    .update({ sort_order: sort })
                                    .eq("id", cat.id);
                                redirect("/admin/categories");
                            }}
                        >
                            <input
                                name="sort_order"
                                type="number"
                                defaultValue={cat.sort_order}
                                className="border rounded-lg px-2 py-1 w-20"
                            />
                        </form>

                        {/* törlés (2 lépcsős megerősítéssel, JS nélkül) */}
                        <div className="col-span-2">
                            {deleteId === String(cat.id) ? (
                                <div className="flex flex-col gap-2">
                                    <div className="text-xs text-red-700">
                                        Biztos törlöd? <span className="font-semibold">{cat.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Link
                                            href="/admin/categories"
                                            className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50"
                                        >
                                            Mégse
                                        </Link>

                                        <form
                                            action={async () => {
                                                "use server";
                                                await supabaseServer
                                                    .from("categories")
                                                    .delete()
                                                    .eq("id", cat.id);
                                                redirect("/admin/categories");
                                            }}
                                        >
                                            <button className="text-sm px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700">
                                                Igen, törlés
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            ) : (
                                <Link
                                    href={`/admin/categories?delete=${encodeURIComponent(String(cat.id))}`}
                                    className="text-red-600 underline"
                                >
                                    Törlés
                                </Link>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </main>
    );
}