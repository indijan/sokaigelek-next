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
  searchParams?: Promise<{ page?: string | string[]; q?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const ok = cookieStore.get("admin_ok")?.value === "1";
  if (!ok) redirect("/admin");

  const params = (await searchParams) ?? {};
  const qParam = Array.isArray(params.q) ? params.q[0] : params.q;
  const pageParam = Array.isArray(params.page) ? params.page[0] : params.page;
  const q = String(qParam || "").trim();
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

  return (
    <main className="space-y-6">
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
              <div className="col-span-1">
                <Link className="underline" href={`/api/admin/labor-uploads/${row.id}/download`}>
                  Letöltés
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
