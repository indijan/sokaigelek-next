import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import AdminActionButton from "@/components/admin/AdminActionButton";

function getTimeZoneOffset(timeZone: string, date: Date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map = new Map(parts.map((p) => [p.type, p.value]));
  const year = Number(map.get("year"));
  const month = Number(map.get("month"));
  const day = Number(map.get("day"));
  const hour = Number(map.get("hour"));
  const minute = Number(map.get("minute"));
  const second = Number(map.get("second"));
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return (asUtc - date.getTime()) / 60000;
}

function budapestLocalToUtcIso(value: string) {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;
  const [year, month, day] = datePart.split("-").map((v) => Number(v));
  const [hour, minute] = timePart.split(":").map((v) => Number(v));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute)
  ) {
    return null;
  }
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offsetMinutes = getTimeZoneOffset("Europe/Budapest", new Date(utcGuess));
  const actualUtc = new Date(utcGuess - offsetMinutes * 60000);
  return actualUtc.toISOString();
}

function formatBudapest(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function AdminAutomationPage({
  searchParams,
}: {
  searchParams?: Promise<{ ok?: string | string[]; err?: string | string[]; archived?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const ok = cookieStore.get("admin_ok")?.value === "1";
  if (!ok) redirect("/admin");

  const canRunNow = Boolean(process.env.CRON_SECRET);
  const disclaimer =
    "Megjegyzés: A cikkben szereplő információk tájékoztató jellegűek, nem helyettesítik az orvosi tanácsadást. Egészségügyi problémák esetén kérjük, fordulj szakorvoshoz vagy egészségügyi szakemberhez.";

  const sp = searchParams ? await searchParams : undefined;
  const okParam = sp?.ok;
  const okMessage = Array.isArray(okParam) ? okParam[0] : okParam;
  const errParam = sp?.err;
  const errMessage = Array.isArray(errParam) ? errParam[0] : errParam;
  const archivedParam = sp?.archived;
  const showArchived = Array.isArray(archivedParam)
    ? archivedParam[0] === "1"
    : archivedParam === "1";

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

  let queueQuery = supabaseServer
    .from("article_automation_queue")
    .select("*")
    .order("publish_at", { ascending: true, nullsFirst: false })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (!showArchived) {
    queueQuery = queueQuery.neq("status", "archived");
  }
  const { data: queue } = await queueQuery;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Automatikus cikkek</h1>
        <p className="text-sm text-gray-600 mt-1">
          Itt tudod előre felvinni az időzített cikk promptokat. A beállított időpontban futnak le.
        </p>
        {errMessage ? (
          <div className="mt-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {errMessage}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <form
            action={async () => {
              "use server";
              const secret = process.env.CRON_SECRET || "";
              if (!secret) return;
              const h = await headers();
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
              <AdminActionButton
                className="bg-slate-900 text-white rounded-xl px-4 py-2 text-sm disabled:opacity-60"
                pendingText="Futtatás..."
                disabled={!canRunNow}
              >
                Futtatás most
              </AdminActionButton>
            </form>
            <form
              action={async () => {
                "use server";
                const { data: runs } = await supabaseServer
                  .from("article_automation_runs")
                  .select("article_id")
                  .not("article_id", "is", null)
                  .order("created_at", { ascending: false });

                const articleIds = Array.from(
                  new Set((runs || []).map((r: any) => r.article_id).filter(Boolean))
                );

                for (const id of articleIds) {
                  const { data: article } = await supabaseServer
                    .from("articles")
                    .select("id, content_html")
                    .eq("id", id)
                    .maybeSingle();

                  if (!article?.content_html) continue;
                  if (String(article.content_html).includes("Megjegyzés: A cikkben szereplő információk")) {
                    continue;
                  }

                  const nextHtml = `${article.content_html}\n<p><em>${disclaimer}</em></p>`;
                  await supabaseServer
                    .from("articles")
                    .update({ content_html: nextHtml })
                    .eq("id", id);
                }

                redirect("/admin/automation?ok=disclaimer");
              }}
            >
              <AdminActionButton
                className="border border-slate-900/15 rounded-xl px-4 py-2 text-sm"
                pendingText="Hozzáadás..."
              >
                Megjegyzés hozzáadása a korábbi AI cikkekhez
              </AdminActionButton>
            </form>
            {okMessage === "disclaimer" ? (
              <span className="text-xs text-emerald-700">
                Megjegyzés hozzáadva a korábbi AI cikkekhez.
              </span>
            ) : null}
            <form
              action={async (formData) => {
                "use server";
                const articleId = String(formData.get("article_id") || "").trim();
                const postToFacebook = formData.get("post_to_facebook") === "on";
                const postToPinterest = formData.get("post_to_pinterest") === "on";
                const postToX = formData.get("post_to_x") === "on";
                if (!articleId) {
                  redirect("/admin/automation?err=Hi%C3%A1nyzik%20a%20cikk%20ID");
                }
                const { data: last } = await supabaseServer
                  .from("article_automation_queue")
                  .select("position")
                  .order("position", { ascending: false })
                  .limit(1)
                  .maybeSingle();
                const position = (last?.position || 0) + 1;
                const { error } = await supabaseServer.from("article_automation_queue").insert({
                  category_slug: null,
                  prompt: "Manual reprocess",
                  position,
                  status: "pending",
                  publish_at: new Date().toISOString(),
                  article_id: articleId,
                  post_to_facebook: postToFacebook,
                  post_to_pinterest: postToPinterest,
                  post_to_x: postToX,
                });
                if (error) {
                  redirect(`/admin/automation?err=${encodeURIComponent(error.message)}`);
                }
                redirect("/admin/automation?ok=reprocess");
              }}
              className="w-full border rounded-xl px-3 py-3 grid gap-3 max-w-full overflow-hidden"
            >
              <div className="text-xs text-gray-600">Cikk ID újrapróbálás</div>
              <input
                name="article_id"
                className="border rounded-lg px-3 py-2 text-sm w-full"
                placeholder="UUID"
                defaultValue=""
              />
              <div className="grid gap-2 text-sm max-w-full">
                {[
                  { id: "repost-fb", name: "post_to_facebook", label: "FB/IG", checked: true },
                  { id: "repost-pin", name: "post_to_pinterest", label: "Pinterest", checked: false },
                  { id: "repost-x", name: "post_to_x", label: "X", checked: false },
                ].map((opt) => (
                  <div
                    key={opt.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "20px 1fr",
                      alignItems: "center",
                      columnGap: "8px",
                      justifyItems: "start",
                      textAlign: "left",
                    }}
                  >
                    <input
                      id={opt.id}
                      name={opt.name}
                      type="checkbox"
                      defaultChecked={opt.checked}
                      className="h-4 w-4"
                      aria-label={opt.label}
                    />
                    <span className="select-none" style={{ justifySelf: "start" }}>
                      {opt.label}
                    </span>
                  </div>
                ))}
              </div>
              <div>
                <AdminActionButton className="border rounded-lg px-3 py-2 text-sm" pendingText="Hozzáadás...">
                  Újrapróbálás
                </AdminActionButton>
              </div>
            </form>
            {okMessage === "reprocess" ? (
              <span className="text-xs text-emerald-700">
                Újrapróbálás sorba állítva.
              </span>
            ) : null}
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
        {lastRun?.details && lastRun.status === "error" ? (
          <div className="mt-2 text-xs text-red-600 line-clamp-2">
            Hiba: {lastRun.details}
          </div>
        ) : null}
        {lastRun?.details && lastRun.status !== "error" ? (
          <div className="mt-2 text-xs text-gray-600 line-clamp-2">
            Utolsó futás üzenete: {lastRun.details}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-gray-600">
          {showArchived ? "Archivált elemek is látszanak." : "Archivált elemek rejtve."}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <Link
            href={showArchived ? "/admin/automation" : "/admin/automation?archived=1"}
            className="underline"
          >
            {showArchived ? "Archiváltak elrejtése" : "Archiváltak mutatása"}
          </Link>
          <form
            action={async () => {
              "use server";
              await supabaseServer
                .from("article_automation_queue")
                .update({ status: "archived" })
                .eq("status", "done");
              redirect("/admin/automation");
            }}
          >
            <AdminActionButton className="text-gray-700 underline" pendingText="Archiválás...">
              Done elemek archiválása
            </AdminActionButton>
          </form>
        </div>
      </div>

      <form
        className="space-y-3 border rounded-2xl p-4"
        action={async (formData) => {
          "use server";
          const category_slug = String(formData.get("category_slug") || "").trim() || null;
          const prompt = String(formData.get("prompt") || "").trim();
          const positionRaw = String(formData.get("position") || "").trim();
          const positionInput = positionRaw ? Number(positionRaw) : null;
          const publishAtLocal = String(formData.get("publish_at") || "").trim();
          const publish_at = budapestLocalToUtcIso(publishAtLocal);
          const postToFacebook = formData.get("post_to_facebook") === "on";
          const postToPinterest = formData.get("post_to_pinterest") === "on";
          const postToX = formData.get("post_to_x") === "on";

          if (!prompt) {
            redirect("/admin/automation");
          }
          if (!publish_at) {
            redirect("/admin/automation?err=Hi%C3%A1nyzik%20az%20id%C5%91z%C3%ADt%C3%A9s");
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
            publish_at,
            post_to_facebook: postToFacebook,
            post_to_pinterest: postToPinterest,
            post_to_x: postToX,
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

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
          <div className="space-y-1">
            <label className="text-sm font-semibold">Időzítés (Budapest)</label>
            <input
              name="publish_at"
              type="datetime-local"
              className="border rounded-xl px-3 py-2 w-full"
            />
          </div>
          <div className="space-y-2 min-w-0">
            <div className="text-sm font-semibold">Social megosztás</div>
            <div className="grid gap-2">
              <label className="grid grid-cols-[16px_1fr] items-center gap-2 text-sm max-w-full">
                <input name="post_to_facebook" type="checkbox" defaultChecked />
                <span className="break-words">FB + IG (Meta cross‑post)</span>
              </label>
              <label className="grid grid-cols-[16px_1fr] items-center gap-2 text-sm max-w-full">
                <input name="post_to_pinterest" type="checkbox" />
                <span className="break-words">Pinterest</span>
              </label>
              <label className="grid grid-cols-[16px_1fr] items-center gap-2 text-sm max-w-full">
                <input name="post_to_x" type="checkbox" />
                <span className="break-words">X</span>
              </label>
            </div>
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
          <AdminActionButton
            className="bg-black text-white rounded-xl px-4 py-2 text-sm"
            pendingText="Mentés..."
          >
            + Hozzáadás
          </AdminActionButton>
        </div>
      </form>

      <div className="border rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-12 bg-gray-50 text-sm font-semibold px-4 py-2">
          <div className="col-span-1">#</div>
          <div className="col-span-2">Státusz</div>
          <div className="col-span-2">Időzítés</div>
          <div className="col-span-2">Social</div>
          <div className="col-span-2">Kategória</div>
          <div className="col-span-2">Prompt</div>
          <div className="col-span-1">Cikk ID</div>
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
              <div className="col-span-2 text-gray-700">
                {formatBudapest(q.publish_at)}
              </div>
              <div className="col-span-2 text-gray-700">
                {[
                  q.post_to_facebook ? "FB/IG" : null,
                  q.post_to_pinterest ? "Pin" : null,
                  q.post_to_x ? "X" : null,
                ]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </div>
              <div className="col-span-2 text-gray-700">{q.category_slug || "—"}</div>
              <div className="col-span-2 text-gray-700 whitespace-pre-wrap">
                {q.prompt}
              </div>
              <div className="col-span-1 text-xs text-gray-600 break-all">
                {q.article_id || "—"}
              </div>
              <div className="col-span-2 flex items-center gap-2 flex-wrap">
                {q.status === "error" ? (
                  <form
                    action={async () => {
                      "use server";
                      await supabaseServer
                        .from("article_automation_queue")
                        .update({
                          status: "pending",
                          last_error: null,
                          publish_at: new Date().toISOString(),
                        })
                        .eq("id", q.id);
                      redirect("/admin/automation");
                    }}
                  >
                    <AdminActionButton className="text-amber-700 underline text-sm" pendingText="Újrapróbálás...">
                      Újrapróbálás
                    </AdminActionButton>
                  </form>
                ) : null}
                {q.status === "done" ? (
                  <form
                    action={async () => {
                      "use server";
                      await supabaseServer
                        .from("article_automation_queue")
                        .update({ status: "archived" })
                        .eq("id", q.id);
                      redirect("/admin/automation");
                    }}
                  >
                    <AdminActionButton className="text-gray-700 underline text-sm" pendingText="Archiválás...">
                      Archiválás
                    </AdminActionButton>
                  </form>
                ) : null}
                <form
                  action={async () => {
                    "use server";
                    await supabaseServer.from("article_automation_queue").delete().eq("id", q.id);
                    redirect("/admin/automation");
                  }}
                >
                  <AdminActionButton className="text-red-700 underline text-sm" pendingText="Törlés...">
                    Törlés
                  </AdminActionButton>
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
                <span className="text-xs text-gray-500">Időzítés: </span>
                {formatBudapest(q.publish_at)}
              </div>
              <div className="text-gray-700">
                <span className="text-xs text-gray-500">Social: </span>
                {[
                  q.post_to_facebook ? "FB/IG" : null,
                  q.post_to_pinterest ? "Pin" : null,
                  q.post_to_x ? "X" : null,
                ]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </div>
              <div className="text-gray-700">
                <span className="text-xs text-gray-500">Kategória: </span>
                {q.category_slug || "—"}
              </div>
              <div className="text-gray-700 whitespace-pre-wrap">{q.prompt}</div>
              <div className="text-gray-700">
                <span className="text-xs text-gray-500">Cikk ID: </span>
                <span className="break-all">{q.article_id || "—"}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {q.status === "error" ? (
                  <form
                    action={async () => {
                      "use server";
                      await supabaseServer
                        .from("article_automation_queue")
                        .update({
                          status: "pending",
                          last_error: null,
                          publish_at: new Date().toISOString(),
                        })
                        .eq("id", q.id);
                      redirect("/admin/automation");
                    }}
                  >
                    <AdminActionButton className="text-amber-700 underline text-sm" pendingText="Újrapróbálás...">
                      Újrapróbálás
                    </AdminActionButton>
                  </form>
                ) : null}
                {q.status === "done" ? (
                  <form
                    action={async () => {
                      "use server";
                      await supabaseServer
                        .from("article_automation_queue")
                        .update({ status: "archived" })
                        .eq("id", q.id);
                      redirect("/admin/automation");
                    }}
                  >
                    <AdminActionButton className="text-gray-700 underline text-sm" pendingText="Archiválás...">
                      Archiválás
                    </AdminActionButton>
                  </form>
                ) : null}
                <form
                  action={async () => {
                    "use server";
                    await supabaseServer.from("article_automation_queue").delete().eq("id", q.id);
                    redirect("/admin/automation");
                  }}
                >
                  <AdminActionButton className="text-red-700 underline text-sm" pendingText="Törlés...">
                    Törlés
                  </AdminActionButton>
                </form>
              </div>
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
