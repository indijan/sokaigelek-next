import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";

export const metadata = {
  title: "Search Console audit - Admin",
  robots: { index: false, follow: false },
};

export default async function SearchConsoleAdminPage() {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_ok")?.value !== "1") redirect("/admin");

  const [{ data: runs }, { data: findings }] = await Promise.all([
    supabaseServer
      .from("search_console_audit_runs")
      .select("id, site_url, status, started_at, finished_at, error, summary, ai_summary")
      .order("started_at", { ascending: false })
      .limit(10),
    supabaseServer
      .from("search_console_audit_findings")
      .select("id, finding_type, severity, url, title, details, ai_recommendation, status, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const latest = runs?.[0];
  const latestSummary = latest?.summary && typeof latest.summary === "object"
    ? latest.summary as Record<string, unknown>
    : {};
  const pageTotals = latestSummary.pageTotals && typeof latestSummary.pageTotals === "object"
    ? latestSummary.pageTotals as Record<string, unknown>
    : {};

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Google Search Console audit</h1>
          <p className="mt-1 text-sm text-slate-600">Napi teljesítmény- és indexelési ellenőrzés.</p>
        </div>
        <Link href="/admin" className="rounded-xl border px-3 py-2 text-sm">Admin kezdőlap</Link>
      </div>

      {!latest ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          Még nincs futás. A bekötéshez a `GSC_AUDIT_ENABLED=1`, a Search Console OAuth változók és az SQL tábla szükséges.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Legutóbbi állapot" value={String(latest.status)} />
            <Metric label="Vizsgált URL-ek" value={String(latestSummary.inspectedUrls || 0)} />
            <Metric label="Megállapítások" value={String(latestSummary.findings || 0)} />
            <Metric label="Kattintások" value={String(pageTotals.clicks || 0)} />
          </div>

          {latest.ai_summary ? (
            <section className="rounded-2xl border bg-slate-50 p-5">
              <h2 className="font-bold">AI audit összefoglaló</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{latest.ai_summary}</p>
            </section>
          ) : null}

          <section>
            <h2 className="mb-3 text-lg font-bold">Nyitott megállapítások</h2>
            <div className="grid gap-3">
              {findings?.length ? findings.map((finding) => (
                <article key={finding.id} className="rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{finding.title}</strong>
                    <span className="text-xs font-bold uppercase text-slate-500">{finding.severity}</span>
                  </div>
                  {finding.url ? <a className="mt-2 block break-all text-sm underline" href={finding.url}>{finding.url}</a> : null}
                  <pre className="mt-3 overflow-auto rounded-xl bg-slate-50 p-3 text-xs">{JSON.stringify(finding.details, null, 2)}</pre>
                </article>
              )) : <p className="rounded-2xl border p-4 text-sm text-slate-600">Nincs nyitott megállapítás.</p>}
            </div>
          </section>
        </>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold">Futási előzmények</h2>
        <div className="grid gap-2">
          {(runs || []).map((run) => (
            <div key={run.id} className="flex flex-wrap justify-between gap-2 rounded-xl border p-3 text-sm">
              <span>{new Date(run.started_at).toLocaleString("hu-HU")}</span>
              <span className="font-bold">{run.status}</span>
              <span>{run.error || `${getNumber(run.summary, "findings")} megállapítás`}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function getNumber(value: unknown, key: string): number {
  if (!value || typeof value !== "object") return 0;
  const result = (value as Record<string, unknown>)[key];
  return typeof result === "number" ? result : Number(result || 0);
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border bg-white p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>;
}
