import Link from "next/link";

const items = [
    { href: "/admin/articles", label: "Cikkek" },
    { href: "/admin/products", label: "Termékek" },
    { href: "/admin/categories", label: "Kategóriák" },
];

export default function AdminNav() {
    return (
        <aside className="w-full md:w-56 shrink-0">
            <div className="sticky top-0 md:top-6">
                <div className="rounded-2xl border bg-white p-3">
                    <div className="text-xs font-semibold text-gray-500 px-2 py-2">
                        Admin
                    </div>
                    <nav className="flex md:flex-col gap-2">
                        {items.map((it) => (
                            <Link
                                key={it.href}
                                href={it.href}
                                className="px-3 py-2 rounded-xl hover:bg-gray-100 text-sm"
                            >
                                {it.label}
                            </Link>
                        ))}
                    </nav>
                    <div className="mt-3 pt-3 border-t">
                        <Link href="/" className="px-3 py-2 rounded-xl hover:bg-gray-100 text-sm block">
                            ← Vissza a site-ra
                        </Link>
                    </div>
                </div>
            </div>
        </aside>
    );
}