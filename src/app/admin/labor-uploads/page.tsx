import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";

const PAGE_SIZE = 30;

type LabUploadRow = {
  id: string;
  created_at: string;
  uploader_name: string;
  uploader_email: string;
  original_filename: string;
  file_size: number;
  status: string;
};

function formatBytes(bytes: number | null) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default async function AdminLaborUploadsPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[]; q?: string | string[]; delete?: string | string[]; err?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const ok = cookieStore.get("admin_ok")?.value === "1";
  if (!ok) redirect("/admin");

  const params = (await searchParams) ?? {};
  const qParam = Array.isArray(params.q) ? params.q[0] : params.q;
  const pageParam = Array.isArray(params.page) ? params.page[0] : params.page;
  const delParam = Array.isArray(params.delete) ? params.delete[0] : params.delete;
  const errParam = Array.isArray(params.err) ? params.err[0] : params.err;
  const q = String(qParam || "").trim();
  const errMessage = String(errParam || "").trim();
  const page = Math.max(1, Number(pageParam || "1") || 1);
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabaseServer
    .from("lab_upload_requests")
    .select("id, created_at, uploader_name, uploader_email, original_filename, file_size, status", { count: "exact" })
    .order("created_at", { ascending: false });

  if (q) {
    const like = `%${q}%`;
    query = query.or(`uploader_name.ilike.${like},uploader_email.ilike.${like},original_filename.ilike.${like}`);
  }

  const { data, error, count } = await query.range(offset, offset + PAGE_SIZE - 1);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const baseParams = new URLSearchParams();
  if (q) baseParams.set("q", q);
  const pendingDeleteRow = String(delParam || "")
    ? ((data || []) as LabUploadRow[]).find((row) => String(row.id) === String(delParam))
    : null;

  return (
    <main className="space-y-6">
      {errMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">{errMessage}</div>
      ) : null}

      {pendingDeleteRow ? (
        <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">Törlés megerősítése</div>
              <div className="text-sm text-gray-700">
                Biztosan törlöd ezt a feltöltést? <span className="font-medium">&quot;{pendingDeleteRow.original_filename}&quot;</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/admin/labor-uploads" className="rounded-xl px-3 py-2 text-sm border bg-white hover:bg-gray-50">
                Mégse
              </Link>
              <form
                action={async () => {
                  "use server";
                  const { data: row, error: fetchErr } = await supabaseServer
                    .from("lab_upload_requests")
                    .select("id, storage_bucket, storage_path")
                    .eq("id", pendingDeleteRow.id)
                    .maybeSingle();

                  if (fetchErr || !row?.id) {
                    redirect(`/admin/labor-uploads?err=${encodeURIComponent("A feltöltés nem található.")}`);
                  }

                  if (row.storage_bucket && row.storage_path) {
                    await supabaseServer.storage.from(String(row.storage_bucket)).remove([String(row.storage_path)]);
                  }

                  const { error: deleteErr } = await supabaseServer.from("lab_upload_requests").delete().eq("id", pendingDeleteRow.id);
                  if (deleteErr) {
                    redirect(`/admin/labor-uploads?err=${encodeURIComponent(deleteErr.message)}`);
                  }

                  redirect("/admin/labor-uploads");
                }}
              >
                <button className="rounded-xl px-3 py-2 text-sm bg-red-600 text-white hover:bg-red-700">Igen, törlés</button>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Labor feltöltések</h1>
          <p className="text-sm text-slate-600">Beküldött dokumentumok és a feltöltők adatai.</p>
        </div>
      </div>

      <form className="flex items-end gap-3 flex-wrap" method="GET">
        <div className="space-y-1 min-w-[240px] flex-1">
          <label className="text-sm font-semibold">Keresés</label>
          <input
            name="q"
            defaultValue={q}
            placeholder="Név, e-mail vagy fájlnév…"
            className="border rounded-xl px-3 py-2 text-sm bg-white w-full"
          />
        </div>
        <button className="border rounded-xl px-4 py-2 text-sm">Szűrés</button>
        {q ? (
          <Link className="text-sm underline" href="/admin/labor-uploads">
            Szűrés törlése
          </Link>
        ) : null}
      </form>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          Nem sikerült lekérni a feltöltéseket. Valószínűleg még nincs létrehozva a `lab_upload_requests` tábla vagy a
          bucket.
        </div>
      ) : (
        <div className="border rounded-2xl overflow-hidden">
          <div className="grid grid-cols-12 bg-gray-50 text-sm font-semibold px-4 py-2 gap-3">
            <div className="col-span-2">Dátum</div>
            <div className="col-span-2">Név</div>
            <div className="col-span-3">E-mail</div>
            <div className="col-span-3">Fájl</div>
            <div className="col-span-1">Méret</div>
            <div className="col-span-1">Művelet</div>
          </div>

          {((data || []) as LabUploadRow[]).map((row) => (
            <div key={row.id} className="grid grid-cols-12 px-4 py-3 border-t text-sm gap-3 items-center">
              <div className="col-span-2 text-slate-600">{new Date(row.created_at).toLocaleString("hu-HU")}</div>
              <div className="col-span-2 font-medium">{row.uploader_name}</div>
              <div className="col-span-3 text-slate-600">{row.uploader_email}</div>
              <div className="col-span-3 text-slate-700">
                <div>{row.original_filename}</div>
                <div className="text-xs text-slate-500">{row.status}</div>
              </div>
              <div className="col-span-1 text-slate-600">{formatBytes(row.file_size)}</div>
              <div className="col-span-1 flex flex-col gap-1">
                <Link className="underline" href={`/api/admin/labor-uploads/${row.id}/download`}>
                  Letöltés
                </Link>
                <Link className="text-red-700 underline" href={`/admin/labor-uploads?delete=${encodeURIComponent(row.id)}`}>
                  Törlés
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            const params = new URLSearchParams(baseParams);
            params.set("page", String(p));
            const href = `/admin/labor-uploads?${params.toString()}`;
            const active = p === page;
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
