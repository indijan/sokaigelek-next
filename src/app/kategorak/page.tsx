import Link from "next/link";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabaseServer";

export const revalidate = 60;

export const metadata: Metadata = {
    title: "Kategóriák | Sokáig élek",
    description: "A Sokáig élek Jóllét Kalauz cikkeinek témakörei és kategóriaoldalai.",
    alternates: { canonical: "/kategorak" },
    openGraph: {
        title: "Kategóriák | Sokáig élek",
        description: "A Sokáig élek Jóllét Kalauz cikkeinek témakörei és kategóriaoldalai.",
        url: "/kategorak",
        type: "website",
    },
};

export default async function CategoriesIndexPage() {
    const { data: categories, error } = await supabaseServer
        .from("categories")
        .select("id, name, slug")
        .order("name", { ascending: true });

    if (error) {
        return (
            <div className="max-w-3xl">
                <h1 className="text-2xl font-bold">Kategóriák</h1>
                <p className="mt-2 text-red-600">Hiba: {error.message}</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-end justify-between gap-4">
                <h1 className="text-2xl font-bold">Kategóriák</h1>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
                {(categories ?? []).map((c) => (
                    <div key={c.id} className="rounded-2xl border bg-white p-4">
                        <Link href={`/kategoria/${c.slug}`} className="font-semibold hover:underline">
                            {c.name}
                        </Link>
                        <div className="text-sm text-gray-500">{c.slug}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
