"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GenerateArticleCoverButton({
    articleId,
    formId,
}: {
    articleId: string;
    formId: string;
}) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function run() {
        setErr(null);
        setLoading(true);
        try {
            const form = document.getElementById(formId);
            const formData = form instanceof HTMLFormElement ? new FormData(form) : null;
            const res = await fetch("/api/admin/generate-article-cover", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    articleId,
                    title: String(formData?.get("title") || "").trim(),
                    excerpt: String(formData?.get("excerpt") || "").trim(),
                    contentHtml: String(formData?.get("content_html") || "").trim(),
                    categorySlug: String(formData?.get("category_slug") || "").trim(),
                    slug: String(formData?.get("new_slug") || "").trim(),
                }),
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || "Hiba történt");

            router.refresh(); // frissíti a szerver oldalt, megjelenik az új kép
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : "Hiba történt");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-2">
            <button
                type="button"
                onClick={run}
                disabled={loading}
                className="bg-black text-white rounded-xl px-4 py-2 text-sm disabled:opacity-60"
            >
                {loading ? "Generálás..." : "AI borítókép generálása"}
            </button>

            {err ? <div className="text-sm text-red-600">{err}</div> : null}
        </div>
    );
}
