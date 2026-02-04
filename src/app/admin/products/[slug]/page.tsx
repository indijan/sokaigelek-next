import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import ProductImageUploader from "@/components/admin/ProductImageUploader";
import { slugifyHu } from "@/lib/slugifyHu";
import HtmlEditor from "@/components/admin/HtmlEditor";
import UnsavedFormGuard from "@/components/admin/UnsavedFormGuard";

type Props = {
    params: Promise<{ slug: string }>;
    searchParams?: Promise<{ err?: string | string[]; ok?: string | string[] }>;
};

function parseOptionalNumber(value: FormDataEntryValue | null) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const normalized = raw.replace(/\s/g, "").replace(/,/g, ".");
    const num = Number(normalized);
    return Number.isFinite(num) ? num : null;
}

function toTags(value: string) {
    return value
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
}

export default async function AdminProductEditPage({ params, searchParams }: Props) {
    const cookieStore = await cookies();
    const ok = cookieStore.get("admin_ok")?.value === "1";
    if (!ok) redirect("/admin");

    const { slug } = await params;
    const sp = (await searchParams) ?? {};
    const errParam = (sp as any).err;
    const errMessage = Array.isArray(errParam) ? errParam[0] : errParam;
    const okParam = (sp as any).ok;
    const okMessage = Array.isArray(okParam) ? okParam[0] : okParam;

    const { data: product, error } = await supabaseServer
        .from("products")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

    const isNew = slug === "uj" && !product;

    if (error || (!product && !isNew)) {
        return (
            <main className="max-w-3xl mx-auto px-4 py-10">
                <div className="text-red-600">Nem találom a terméket: {slug}</div>
            </main>
        );
    }

    const supportsStatus = Object.prototype.hasOwnProperty.call(product ?? {}, "status") || isNew;
    const nutritionField = Object.prototype.hasOwnProperty.call(product ?? {}, "nutrition")
        ? "nutrition"
        : Object.prototype.hasOwnProperty.call(product ?? {}, "nutrition_facts")
        ? "nutrition_facts"
        : Object.prototype.hasOwnProperty.call(product ?? {}, "nutrition_table")
        ? "nutrition_table"
        : isNew
        ? "nutrition"
        : null;
    const compositionField = Object.prototype.hasOwnProperty.call(product ?? {}, "composition_html")
        ? "composition_html"
        : Object.prototype.hasOwnProperty.call(product ?? {}, "composition")
        ? "composition"
        : isNew
        ? "composition_html"
        : null;
    const supportsNutrition = Boolean(nutritionField);
    const supportsComposition = Boolean(compositionField);

    return (
        <main className="max-w-3xl mx-auto px-4 py-10 space-y-6">
            {errMessage ? (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                    {errMessage}
                </div>
            ) : null}
            {!errMessage && okMessage ? (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-sm">
                    Sikeres mentés.
                </div>
            ) : null}
            <h1 className="text-2xl font-bold">{isNew ? "Új termék" : "Termék szerkesztése"}</h1>

            <form
                id="product-edit-form"
                action={async (formData) => {
                    "use server";
                    const id = String(formData.get("id") || "");
                    const rawSlug = String(formData.get("new_slug") || "").trim();

                    const name = String(formData.get("name") || "");
                    const short = String(formData.get("short") || "");
                    const tags = toTags(String(formData.get("tags") || ""));
                    const description = String(formData.get("description") || "");
                    const regular_price = parseOptionalNumber(formData.get("regular_price"));
                    const price = parseOptionalNumber(formData.get("price"));
                    const status = supportsStatus ? String(formData.get("status") || "draft") : null;
                    const isNewMode = slug === "uj";
                    const nutrition = supportsNutrition && nutritionField
                        ? String(formData.get(nutritionField) || "")
                        : "";
                    const composition = supportsComposition && compositionField
                        ? String(formData.get(compositionField) || "")
                        : "";

                    // ✅ KIEMELT pipa
                    const is_featured = formData.get("is_featured") === "on";

                    // 1) Slug alap: ha a user nem ír slugot, névből generáljuk
                    const baseSlug = slugifyHu(rawSlug || name);

                    // 2) Ha üres marad (pl. nincs név), akkor marad a régi slug
                    let nextSlug = baseSlug || (isNewMode ? `uj-termek-${Date.now()}` : slug);

                    // 3) Ütközés kezelése: ha a slug változik, és foglalt, akkor -2, -3...
                    if (nextSlug !== slug || isNewMode) {
                        let candidate = nextSlug;
                        let i = 2;

                        while (true) {
                            const baseQuery = supabaseServer
                                .from("products")
                                .select("id")
                                .eq("slug", candidate);
                            const { data: existing, error: existsErr } = isNewMode
                                ? await baseQuery.maybeSingle()
                                : await baseQuery.neq("id", id).maybeSingle();

                            if (existsErr) {
                                redirect(`/admin/products/${slug}?err=${encodeURIComponent(existsErr.message)}`);
                            }

                            if (!existing) {
                                nextSlug = candidate;
                                break;
                            }

                            candidate = `${nextSlug}-${i}`;
                            i += 1;
                        }
                    }

                    const affiliate_label_1 = String(formData.get("affiliate_label_1") || "").trim();
                    const affiliate_url_1 = String(formData.get("affiliate_url_1") || "").trim();
                    const affiliate_label_2 = String(formData.get("affiliate_label_2") || "").trim();
                    const affiliate_url_2 = String(formData.get("affiliate_url_2") || "").trim();

                    const hasAffiliate1 = Boolean(affiliate_label_1) || Boolean(affiliate_url_1);
                    const hasAffiliate2 = Boolean(affiliate_label_2) || Boolean(affiliate_url_2);

                    if (hasAffiliate1 && (!affiliate_label_1 || !affiliate_url_1)) {
                        redirect(`/admin/products/${slug}?err=${encodeURIComponent("Affiliate link 1-hez címke és URL is szükséges.")}`);
                    }

                    if (hasAffiliate2 && (!affiliate_label_2 || !affiliate_url_2)) {
                        redirect(`/admin/products/${slug}?err=${encodeURIComponent("Affiliate link 2-höz címke és URL is szükséges.")}`);
                    }

                    const updateData: Record<string, unknown> = {
                        slug: nextSlug,
                        name,
                        short,
                        description,
                        regular_price,
                        price,
                        is_featured, // ✅ mentés
                        tags,
                        affiliate_label_1,
                        affiliate_url_1,
                        affiliate_label_2,
                        affiliate_url_2,
                    };

                    if (supportsStatus) updateData.status = status;
                    if (supportsNutrition && nutritionField) updateData[nutritionField] = nutrition;
                    if (supportsComposition && compositionField) updateData[compositionField] = composition;

                    if (isNewMode) {
                        const { error: insertErr } = await supabaseServer.from("products").insert(updateData);
                        if (insertErr) {
                            const msg = insertErr.message || "";
                            const shouldStripStatus = /status/i.test(msg) && /column|schema cache/i.test(msg);
                            const shouldStripNutrition =
                                /(nutrition|nutrition_facts|nutrition_table)/i.test(msg) &&
                                /column|schema cache/i.test(msg);
                            const shouldStripComposition =
                                /(composition|composition_html)/i.test(msg) &&
                                /column|schema cache/i.test(msg);
                            if (shouldStripStatus || shouldStripNutrition || shouldStripComposition) {
                                const {
                                    status: _status,
                                    nutrition: _nutrition,
                                    nutrition_facts: _nutritionFacts,
                                    nutrition_table: _nutritionTable,
                                    composition: _composition,
                                    composition_html: _compositionHtml,
                                    ...insertData
                                } = updateData;
                                const retryData = {
                                    ...insertData,
                                    ...(shouldStripStatus ? {} : { status }),
                                    ...(shouldStripNutrition || !nutritionField ? {} : { [nutritionField]: nutrition }),
                                    ...(shouldStripComposition || !compositionField ? {} : { [compositionField]: composition }),
                                };
                                const { error: retryErr } = await supabaseServer.from("products").insert(retryData);
                                if (retryErr) {
                                    redirect(`/admin/products/uj?err=${encodeURIComponent(retryErr.message)}`);
                                }
                            } else {
                                redirect(`/admin/products/uj?err=${encodeURIComponent(insertErr.message)}`);
                            }
                        }
                    } else {
                        const { error: updateErr } = await supabaseServer
                            .from("products")
                            .update(updateData)
                            .eq("id", id);
                        if (updateErr) {
                            const msg = updateErr.message || "";
                            const shouldStripStatus = /status/i.test(msg) && /column|schema cache/i.test(msg);
                            const shouldStripNutrition =
                                /(nutrition|nutrition_facts|nutrition_table)/i.test(msg) &&
                                /column|schema cache/i.test(msg);
                            const shouldStripComposition =
                                /(composition|composition_html)/i.test(msg) &&
                                /column|schema cache/i.test(msg);
                            if (shouldStripStatus || shouldStripNutrition || shouldStripComposition) {
                                const {
                                    status: _status,
                                    nutrition: _nutrition,
                                    nutrition_facts: _nutritionFacts,
                                    nutrition_table: _nutritionTable,
                                    composition: _composition,
                                    composition_html: _compositionHtml,
                                    ...baseRetry
                                } = updateData;
                                const retryData = {
                                    ...baseRetry,
                                    ...(shouldStripStatus ? {} : { status }),
                                    ...(shouldStripNutrition || !nutritionField ? {} : { [nutritionField]: nutrition }),
                                    ...(shouldStripComposition || !compositionField ? {} : { [compositionField]: composition }),
                                };
                                const { error: retryErr } = await supabaseServer
                                    .from("products")
                                    .update(retryData)
                                    .eq("id", id);
                                if (retryErr) {
                                    redirect(`/admin/products/${slug}?err=${encodeURIComponent(retryErr.message)}`);
                                }
                            } else {
                                redirect(`/admin/products/${slug}?err=${encodeURIComponent(updateErr.message)}`);
                            }
                        }
                    }

                    revalidatePath("/");
                    revalidatePath("/termek");
                    revalidatePath(`/termek/${nextSlug}`);

                    redirect(`/admin/products/${nextSlug}?ok=1`);
                }}
                className="space-y-4"
            >
                {product?.id ? <input type="hidden" name="id" defaultValue={product.id} /> : null}

                <div>
                    <label className="text-sm font-semibold">Slug (URL)</label>
                    <input
                        name="new_slug"
                        defaultValue={product?.slug ?? ""}
                        className="w-full border rounded-xl px-3 py-2"
                        placeholder="pl. duolife-aloes"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        Kisbetű, szám és kötőjel javasolt. Ha üresen hagyod, a Név alapján automatikusan generáljuk.
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        Publikus link:{" "}
                        <span className="font-mono">
                            {product?.slug ? `/termek/${product.slug}` : "mentés után lesz"}
                        </span>
                    </p>
                </div>

                <div>
                    <label className="text-sm font-semibold">Név</label>
                    <input
                        name="name"
                        defaultValue={product?.name ?? ""}
                        className="w-full border rounded-xl px-3 py-2"
                    />
                </div>

                {supportsStatus ? (
                    <div>
                        <label className="text-sm font-semibold">Státusz</label>
                        <select
                            name="status"
                            defaultValue={(product as any)?.status ?? "draft"}
                            className="w-full border rounded-xl px-3 py-2"
                        >
                            <option value="draft">draft</option>
                            <option value="published">published</option>
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                            Draft állapotban a termék nem jelenik meg a publikus oldalon.
                        </p>
                    </div>
                ) : null}

                <div>
                    <label className="text-sm font-semibold">Rövid leírás</label>
                    <textarea
                        name="short"
                        defaultValue={product?.short ?? ""}
                        className="w-full border rounded-xl px-3 py-2 h-24"
                    />
                </div>

                <div>
                    <label className="text-sm font-semibold">Hosszú leírás</label>
                    <div className="text-xs text-gray-500 mt-1">
                        Itt szerkesztheted a termékleírást formázva. Mentéskor automatikusan HTML-ként kerül elmentésre.
                    </div>
                    <div className="mt-2">
                        <HtmlEditor name="description" initialHtml={product?.description ?? ""} />
                    </div>
                </div>

                {supportsNutrition && nutritionField ? (
                    <div>
                        <label className="text-sm font-semibold">Tápérték</label>
                        <div className="text-xs text-gray-500 mt-1">
                            Ide jöhet táblázat vagy formázott HTML. Ez a Tápérték fül tartalma.
                        </div>
                        <div className="mt-2">
                            <HtmlEditor name={nutritionField} initialHtml={(product as any)?.[nutritionField] ?? ""} />
                        </div>
                    </div>
                ) : null}

                {supportsComposition && compositionField ? (
                    <div>
                        <label className="text-sm font-semibold">Összetétel</label>
                        <div className="text-xs text-gray-500 mt-1">
                            Ide jöhet összetevők listája vagy formázott HTML. Ez az Összetétel fül tartalma.
                        </div>
                        <div className="mt-2">
                            <HtmlEditor name={compositionField} initialHtml={(product as any)?.[compositionField] ?? ""} />
                        </div>
                    </div>
                ) : null}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-sm font-semibold">Alap ár</label>
                        <input
                            type="number"
                            step="0.01"
                            name="regular_price"
                            defaultValue={product?.regular_price ?? ""}
                            className="w-full border rounded-xl px-3 py-2"
                            placeholder="pl. 19990"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold">Sokáig élek ár</label>
                        <input
                            type="number"
                            step="0.01"
                            name="price"
                            defaultValue={product?.price ?? ""}
                            className="w-full border rounded-xl px-3 py-2"
                            placeholder="pl. 15990"
                        />
                    </div>
                </div>

                {/* ✅ KIEMELT pipa UI */}
                <div>
                    <label htmlFor="is_featured" className="inline-flex items-center gap-2 text-sm font-semibold">
                        <input
                            id="is_featured"
                            type="checkbox"
                            name="is_featured"
                            defaultChecked={!!product?.is_featured}
                            className="h-4 w-4"
                        />
                        <span>Kiemelt termék (főoldalon / ajánlókban)</span>
                    </label>
                </div>

                <div>
                    <label className="text-sm font-semibold">Tagek (vesszővel elválasztva)</label>
                    <input
                        name="tags"
                        defaultValue={((product as any)?.tags || []).join(", ")}
                        className="w-full border rounded-xl px-3 py-2"
                        placeholder="immun, emésztés, energia"
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <div className="font-semibold">Affiliate link 1</div>
                        <input
                            name="affiliate_label_1"
                            defaultValue={product?.affiliate_label_1 ?? ""}
                            className="w-full border rounded-xl px-3 py-2"
                            placeholder="Gomb felirat"
                        />
                        <input
                            name="affiliate_url_1"
                            defaultValue={product?.affiliate_url_1 ?? ""}
                            className="w-full border rounded-xl px-3 py-2"
                            placeholder="https://..."
                        />
                    </div>

                    <div className="space-y-2">
                        <div className="font-semibold">Affiliate link 2</div>
                        <input
                            name="affiliate_label_2"
                            defaultValue={product?.affiliate_label_2 ?? ""}
                            className="w-full border rounded-xl px-3 py-2"
                            placeholder="Gomb felirat"
                        />
                        <input
                            name="affiliate_url_2"
                            defaultValue={product?.affiliate_url_2 ?? ""}
                            className="w-full border rounded-xl px-3 py-2"
                            placeholder="https://..."
                        />
                    </div>
                </div>

                <button className="bg-black text-white rounded-xl px-4 py-2 text-sm">
                    Mentés
                </button>
            </form>

            {product?.id ? (
                <ProductImageUploader
                    slug={slug}
                    productId={String(product.id)}
                    initialUrl={product.image_url}
                />
            ) : null}
            <UnsavedFormGuard formId="product-edit-form" />
        </main>
    );
}
