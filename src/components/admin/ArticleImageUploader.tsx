"use client";

import { useState } from "react";

export default function ArticleImageUploader({
                                                 articleId,
                                                 currentUrl,
                                             }: {
    articleId: string;
    currentUrl?: string | null;
}) {
    const [uploading, setUploading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    async function onPick(file: File | null) {
        if (!file) return;
        setErr(null);
        setUploading(true);

        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("article_id", articleId);

            const res = await fetch("/api/admin/upload-article-image", {
                method: "POST",
                body: fd,
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || "Upload failed");

            // egyszerű: full refresh, hogy az új URL biztosan megjelenjen
            window.location.reload();
        } catch (e: any) {
            setErr(e.message || "Hiba");
        } finally {
            setUploading(false);
        }
    }

    async function onDelete() {
        if (!currentUrl) return;
        if (!confirm("Biztosan törlöd a borítóképet?")) return;

        setErr(null);
        setUploading(true);

        try {
            const fd = new FormData();
            fd.append("article_id", articleId);

            const res = await fetch("/api/admin/delete-article-image", {
                method: "POST",
                body: fd,
            });

            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || "Törlés sikertelen");

            window.location.reload();
        } catch (e: any) {
            setErr(e.message || "Hiba");
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="border rounded-2xl p-4 space-y-3">
            <div className="font-semibold">Borítókép</div>

            {currentUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={currentUrl}
                    alt="Borítókép"
                    className="w-full max-w-md rounded-xl border"
                />
            ) : (
                <div className="text-sm text-gray-500">Még nincs kép feltöltve.</div>
            )}

            <label className="inline-flex items-center gap-2">
                <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => onPick(e.target.files?.[0] || null)}
                    disabled={uploading}
                />
                {uploading ? <span className="text-sm">Feltöltés…</span> : null}
            </label>

            {currentUrl ? (
                <button
                    type="button"
                    className="text-red-600 underline text-sm"
                    disabled={uploading}
                    onClick={onDelete}
                >
                    Borítókép törlése
                </button>
            ) : null}

            {err ? (
                <div className="text-sm text-red-600">{err}</div>
            ) : null}
        </div>
    );
}