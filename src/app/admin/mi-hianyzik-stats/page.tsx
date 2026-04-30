import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";

type EventRow = {
  created_at: string;
  source: string;
  event_name: string;
  payload: { primaryResult?: string; recommendedProducts?: string[]; productName?: string } | null;
};

function countBy<T extends string>(items: T[]) {
  const map = new Map<string, number>();
  for (const item of items) map.set(item, (map.get(item) || 0) + 1);
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

export default async function MiHianyzikStatsPage() {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_ok")?.value !== "1") redirect("/admin");

  const now = new Date();
  const since7dDate = new Date(now);
  since7dDate.setDate(since7dDate.getDate() - 7);
  const since7d = since7dDate.toISOString();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const [eventsRes, uploadsRes, pendingUploadsRes] = await Promise.all([
    supabaseServer
      .from("miniapp_events")
      .select("created_at, source, event_name, payload")
      .gte("created_at", since7d)
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseServer.from("lab_upload_requests").select("id, created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(500),
    supabaseServer.from("lab_upload_requests").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);

  const events = (eventsRes.data || []) as EventRow[];
  const uploads = uploadsRes.data || [];
  const todayIso = today.toISOString();

  const surveyStarts = events.filter((e) => e.source === "miniapp" && e.event_name === "miniapp_started").length;
  const surveyResults = events.filter((e) => e.source === "miniapp" && e.event_name === "miniapp_result_viewed").length;
  const productClicks = events.filter((e) => e.source === "miniapp" && e.event_name === "miniapp_product_clicked").length;
  const labAnalyses = events.filter((e) => e.source === "lab_checker" && e.event_name === "lab_analysis_completed").length;
  const adminAnalyses = events.filter((e) => e.source === "admin_labor_analysis" && e.event_name === "admin_labor_analysis_completed").length;
  const adminEmailsSent = events.filter((e) => e.source === "admin_labor_analysis" && e.event_name === "admin_labor_email_sent").length;
  const uploads7d = uploads.filter((row) => String(row.created_at || "") >= since7d).length;
  const uploadsToday = uploads.filter((row) => String(row.created_at || "") >= todayIso).length;
  const topResults = countBy(events.map((e) => String(e.payload?.primaryResult || "")).filter(Boolean)).slice(0, 8);
  const topClickedProducts = countBy(
    events
      .filter((e) => e.event_name === "miniapp_product_clicked")
      .map((e) => String(e.payload?.productName || ""))
      .filter(Boolean)
  ).slice(0, 8);
  const topRecommendedProducts = countBy(
    events.flatMap((e) => (Array.isArray(e.payload?.recommendedProducts) ? e.payload.recommendedProducts : []))
  ).slice(0, 8);

  const questionnaireCompletionRate = surveyStarts > 0 ? Math.round((surveyResults / surveyStarts) * 100) : 0;

  return (
    <main className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Mi hiányzik nekem statisztika</h1>
          <p className="text-sm text-slate-600">Kérdőív, labor feltöltések és labor elemzések monitorozása.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href="/admin/labor-analysis" className="rounded-xl bg-black px-4 py-2 text-sm text-white">
            Labor elemző modul
          </Link>
          <Link href="/admin/labor-uploads" className="rounded-xl border px-4 py-2 text-sm">
            Feltöltések kezelése
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Kérdőív indítások / 7 nap" value={surveyStarts} />
        <StatCard label="Kérdőív eredmények / 7 nap" value={surveyResults} />
        <StatCard label="Kitöltési arány / 7 nap" value={questionnaireCompletionRate} suffix="%" />
        <StatCard label="Labor elemzések / 7 nap" value={labAnalyses} />
        <StatCard label="Admin labor elemzések" value={adminAnalyses} />
        <StatCard label="Labor feltöltések ma" value={uploadsToday} />
        <StatCard label="Új labor feltöltések" value={pendingUploadsRes.count ?? 0} tone="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border p-4">
          <h2 className="text-lg font-bold">Top primer eredmények</h2>
          <div className="mt-3 space-y-2 text-sm">
            {topResults.length ? (
              topResults.map(([label, count]) => (
                <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span>{label}</span>
                  <strong>{count}</strong>
                </div>
              ))
            ) : (
              <div className="text-slate-500">Még nincs elég adat.</div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border p-4">
          <h2 className="text-lg font-bold">Top kattintott termékek</h2>
          <div className="mt-3 space-y-2 text-sm">
            {topClickedProducts.length ? (
              topClickedProducts.map(([label, count]) => (
                <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span>{label}</span>
                  <strong>{count}</strong>
                </div>
              ))
            ) : (
              <div className="text-slate-500">Még nincs elég adat.</div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border p-4">
          <h2 className="text-lg font-bold">Top ajánlott termékek</h2>
          <div className="mt-3 space-y-2 text-sm">
            {topRecommendedProducts.length ? (
              topRecommendedProducts.map(([label, count]) => (
                <div key={label} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span>{label}</span>
                  <strong>{count}</strong>
                </div>
              ))
            ) : (
              <div className="text-slate-500">Még nincs elég adat.</div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border p-4">
          <h2 className="text-lg font-bold">Labor feltöltések és kiküldések</h2>
          <div className="mt-3 space-y-3 text-sm text-slate-700">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span>Utolsó 7 nap feltöltései</span>
              <strong>{uploads7d}</strong>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span>Miniapp labor elemzések</span>
              <strong>{labAnalyses}</strong>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span>Admin labor e-mailek kiküldve</span>
              <strong>{adminEmailsSent}</strong>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span>Miniapp termék kattintások</span>
              <strong>{productClicks}</strong>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  tone = "default",
  suffix = "",
}: {
  label: string;
  value: number;
  tone?: "default" | "danger";
  suffix?: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "danger" ? "border-red-200 bg-red-50" : "bg-white"}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-black ${tone === "danger" ? "text-red-700" : "text-slate-900"}`}>
        {value}
        {suffix}
      </div>
    </div>
  );
}
