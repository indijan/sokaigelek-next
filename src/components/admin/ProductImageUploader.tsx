"use client";

import { useState } from "react";

export default function ProductImageUploader(props: {
    slug: string;
    initialUrl?: string | null;
}) {
    const [imageUrl, setImageUrl] = useState(props.initialUrl ?? "");
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string>("");

    async function upload() {
        if (!file) {
            setErr("Válassz ki egy képet.");
            return;
        }
        setErr("");
        setLoading(true);

        const fd = new FormData();
        fd.append("slug", props.slug);
        fd.append("file", file);

        const res = await fetch("/api/admin/upload-product-image", {
            method: "POST",
            body: fd,
        });

        const json = await res.json();
        setLoading(false);

        if (!res.ok) {
            setErr(json?.error || "Hiba történt feltöltés közben.");
            return;
        }

        setImageUrl(json.publicUrl);
        setFile(null);
    }

    return (
        <div className="border rounded-2xl p-4 space-y-3">
            <div className="font-semibold">Kép</div>

            {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="w-48 rounded-xl border" />
            ) : (
                <div className="text-sm text-gray-600">Nincs kép feltöltve.</div>
            )}

            <div className="flex items-center gap-3">
                <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <button
                    type="button"
                    onClick={upload}
                    disabled={loading}
                    className="border rounded-xl px-3 py-2 text-sm disabled:opacity-60"
                >
                    {loading ? "Feltöltés..." : "Kép feltöltése"}
                </button>
            </div>

            {err && <div className="text-sm text-red-600">{err}</div>}
        </div>
    );
}