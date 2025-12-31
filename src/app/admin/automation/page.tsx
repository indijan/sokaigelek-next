import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";

export default async function AdminAutomationPage() {
  const cookieStore = await cookies();
  const ok = cookieStore.get("admin_ok")?.value === "1";
  if (!ok) redirect("/admin");

  const canRunNow = Boolean(process.env.CRON_SECRET);

  const { data: categories } = await supabaseServer
    .from("categories")
    .select("slug, name")
    .order("sort_order", { ascending: true });

  const { data: lastRun } = await supabaseServer
    .from("article_automation_runs")
    .select("run_date, status, details, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: queue } = await supabaseServer
    .from("article_automation_queue")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automatikus cikkek</h1>
        <p className="text-sm text-gray-600 mt-1">
          Itt tudod előre felvinni a napi cikk promptokat. Sorrendben fognak lefutni.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form
            action={async () => {
              "use server";
              const secret = process.env.CRON_SECRET || "";
              if (!secret) return;
              const h = headers();
              const host = h.get("x-forwarded-host") || h.get("host") || "";
              const proto = h.get("x-forwarded-proto") || "http";
              const base =
                process.env.NEXT_PUBLIC_SITE_URL ||
                (host ? `${proto}://${host}` : "");
              if (!base) return;
              const url = `${base}/api/cron/auto-articles?secret=${encodeURIComponent(
                secret
              )}&force=1`;
              await fetch(url, { method: "GET" });
              redirect("/admin/automation");
            }}
          >
            <button
              className="bg-slate-900 text-white rounded-xl px-4 py-2 text-sm"
              disabled={!canRunNow}
            >
              Futtatás most
            </button>
          </form>
          {!canRunNow ? (
            <span className="text-xs text-red-600">
              CRON_SECRET nincs beállítva.
            </span>
          ) : null}
          {lastRun ? (
            <span className="text-xs text-gray-600">
              Utolsó futás: {lastRun.run_date} • {lastRun.status}
            </span>
          ) : (
            <span className="text-xs text-gray-600">Még nem volt futás.</span>
          )}
        </div>
        {lastRun?.details ? (
          <div className="mt-2 text-xs text-red-600 line-clamp-2">
            Hiba: {lastRun.details}
          </div>
        ) : null}
      </div>

      <form
        className="space-y-3 border rounded-2xl p-4"
        action={async (formData) => {
          "use server";
          const category_slug = String(formData.get("category_slug") || "").trim() || null;
          const prompt = String(formData.get("prompt") || "").trim();
          const positionRaw = String(formData.get("position") || "").trim();
          const positionInput = positionRaw ? Number(positionRaw) : null;

          if (!prompt) {
            redirect("/admin/automation");
          }

          let position = positionInput;
          if (!position || !Number.isFinite(position)) {
            const { data: last } = await supabaseServer
              .from("article_automation_queue")
              .select("position")
              .order("position", { ascending: false })
              .limit(1)
              .maybeSingle();
            position = (last?.position || 0) + 1;
          }

          await supabaseServer.from("article_automation_queue").insert({
            category_slug,
            prompt,
            position,
            status: "pending",
          });

          redirect("/admin/automation");
        }}
      >
        <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
          <div className="space-y-1">
            <label className="text-sm font-semibold">Kategória</label>
            <select name="category_slug" className="w-full border rounded-xl px-3 py-2">
              <option value="">— nincs —</option>
              {categories?.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-semibold">Prompt</label>
            <textarea
              name="prompt"
              className="w-full border rounded-xl px-3 py-2 h-24"
              placeholder="Miről szóljon a cikk? Adj meg kulcspontokat is."
            />
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="space-y-1">
            <label className="text-sm font-semibold">Sorrend (opcionális)</label>
            <input
              name="position"
              type="number"
              className="border rounded-xl px-3 py-2 w-40"
              placeholder="pl. 12"
            />
          </div>
          <button className="bg-black text-white rounded-xl px-4 py-2 text-sm">
            + Hozzáadás
          </button>
        </div>
      </form>

      <div className="border rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 bg-gray-50 text-sm font-semibold px-4 py-2">
          <div className="col-span-1">#</div>
          <div className="col-span-2">Státusz</div>
          <div className="col-span-3">Kategória</div>
          <div className="col-span-4">Prompt</div>
          <div className="col-span-2">Művelet</div>
        </div>

        <div className="hidden md:block">
          {(queue || []).map((q: any) => (
            <div key={q.id} className="grid grid-cols-12 px-4 py-3 border-t text-sm items-start gap-y-2">
              <div className="col-span-1 text-gray-600">{q.position}</div>
              <div className="col-span-2">
                <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-50">
                  {q.status}
                </span>
                {q.last_error ? (
                  <div className="text-xs text-red-600 mt-1 line-clamp-2">
                    {q.last_error}
                  </div>
                ) : null}
              </div>
              <div className="col-span-3 text-gray-700">{q.category_slug || "—"}</div>
              <div className="col-span-4 text-gray-700 whitespace-pre-wrap">
                {q.prompt}
              </div>
              <div className="col-span-2">
                <form
                  action={async () => {
                    "use server";
                    await supabaseServer.from("article_automation_queue").delete().eq("id", q.id);
                    redirect("/admin/automation");
                  }}
                >
                  <button className="text-red-700 underline text-sm">Törlés</button>
                </form>
              </div>
            </div>
          ))}
        </div>

        <div className="md:hidden space-y-3 p-3">
          {(queue || []).map((q: any) => (
            <div key={q.id} className="border rounded-xl p-3 text-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-600">#{q.position}</div>
                <span className="text-xs px-2 py-0.5 rounded-full border bg-gray-50">
                  {q.status}
                </span>
              </div>
              {q.last_error ? (
                <div className="text-xs text-red-600 line-clamp-2">
                  {q.last_error}
                </div>
              ) : null}
              <div className="text-gray-700">
                <span className="text-xs text-gray-500">Kategória: </span>
                {q.category_slug || "—"}
              </div>
              <div className="text-gray-700 whitespace-pre-wrap">{q.prompt}</div>
              <form
                action={async () => {
                  "use server";
                  await supabaseServer.from("article_automation_queue").delete().eq("id", q.id);
                  redirect("/admin/automation");
                }}
              >
                <button className="text-red-700 underline text-sm">Törlés</button>
              </form>
            </div>
          ))}
        </div>

        {queue?.length === 0 ? (
          <div className="px-4 py-4 text-sm text-gray-600">
            Nincs még felvitt prompt.
          </div>
        ) : null}
      </div>
    </div>
  );
}
