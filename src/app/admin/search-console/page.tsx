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
  const visibleFindings = (findings || []).filter(isRealFinding);
  const latestSummary = latest?.summary && typeof latest.summary === "object"
    ? latest.summary as Record<string, unknown>
    : {};
  const pageTotals = latestSummary.pageTotals && typeof latestSummary.pageTotals === "object"
    ? latestSummary.pageTotals as Record<string, unknown>
    : {};

  return (
    <div className="grid min-w-0 gap-6">
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
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Metric label="Legutóbbi állapot" value={statusLabel(latest.status)} />
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

          {getString(latestSummary, "aiError") ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              Az URL-ellenőrzés lefutott, de az AI-szöveges összefoglaló most nem készült el. Ez nem befolyásolja a Search Console eredményeit.
            </div>
          ) : null}

          <section>
            <h2 className="mb-3 text-lg font-bold">Nyitott megállapítások</h2>
            <div className="grid gap-3">
              {visibleFindings.length ? visibleFindings.map((finding) => (
                <article key={finding.id} className="min-w-0 overflow-hidden rounded-2xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{findingTitle(finding)}</strong>
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">{severityLabel(finding.severity)}</span>
                  </div>
                  {finding.url ? <a className="mt-2 block break-all text-sm underline" href={finding.url}>{finding.url}</a> : null}
                  <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                    <p>{findingDescription(finding)}</p>
                    {inspectionLink(finding.details) ? (
                      <a className="mt-2 inline-block font-semibold underline" href={inspectionLink(finding.details) || undefined} target="_blank" rel="noreferrer">
                        Részletek megnyitása a Search Console-ban
                      </a>
                    ) : null}
                    {finding.ai_recommendation ? <p className="mt-3 border-t border-slate-200 pt-3"><strong>Javaslat:</strong> {finding.ai_recommendation}</p> : null}
                  </div>
                </article>
              )) : <p className="rounded-2xl border p-4 text-sm text-slate-600">Nincs valódi, javítandó megállapítás. A sikeres URL-ellenőrzéseket nem jelöljük hibának.</p>}
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
              <span className={run.status === "completed" ? "font-bold text-emerald-700" : "font-bold text-red-700"}>{statusLabel(run.status)}</span>
              <span className="max-w-full break-words text-slate-600">{run.error ? humanizeError(run.error) : `${getNumber(run.summary, "findings")} megállapítás`}</span>
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

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getString(value: unknown, key: string): string | null {
  const result = getRecord(value)[key];
  return typeof result === "string" ? result : null;
}

function statusLabel(status: string): string {
  return status === "completed" ? "Rendben" : status === "failed" ? "Sikertelen" : "Folyamatban";
}

function severityLabel(severity: string): string {
  return severity === "error" ? "Hiba" : severity === "warning" ? "Ellenőrizendő" : "Tájékoztató";
}

function findingTitle(finding: { finding_type: string; title: string }): string {
  if (finding.finding_type === "url_inspection_error") return "URL-ellenőrzés sikertelen";
  return finding.title === "URL Inspection eltérést jelzett" ? "Indexelési probléma" : finding.title;
}

function isRealFinding(finding: { finding_type: string; details: unknown }): boolean {
  if (finding.finding_type !== "url_inspection") return true;
  const details = getRecord(finding.details);
  if (Array.isArray(details.failedChecks)) return details.failedChecks.length > 0;

  // Hide legacy records created by the old, overly broad PASS detection.
  const legacy = getRecord(details.indexStatusResult);
  return [
    ["verdict", legacy.verdict, "PASS"],
    ["robotsTxtState", legacy.robotsTxtState, "ALLOWED"],
    ["pageFetchState", legacy.pageFetchState, "SUCCESSFUL"],
    ["indexingState", legacy.indexingState, "INDEXING_ALLOWED"],
  ].some(([, value, allowed]) => value && value !== allowed);
}

function findingDescription(finding: { finding_type: string; details: unknown }): string {
  const details = getRecord(finding.details);
  if (finding.finding_type === "url_inspection_error") {
    return "A Google URL-ellenőrzés technikai hiba miatt nem futott le. Ez nem bizonyítja, hogy az oldal hibás; a következő napi futás újrapróbálja.";
  }
  const failedChecks = Array.isArray(details.failedChecks) ? details.failedChecks : [];
  const labels = failedChecks.map((check) => {
    const name = getRecord(check).name;
    return checkLabel(typeof name === "string" ? name : "ismeretlen ellenőrzés");
  });
  return labels.length
    ? `A Google ezt jelezte: ${labels.join(", ")}.`
    : "Az URL ellenőrzése rendben lefutott.";
}

function checkLabel(name: string): string {
  return {
    verdict: "indexelési állapot",
    robotsTxtState: "robots.txt szabály",
    pageFetchState: "oldal lekérése",
    indexingState: "indexelhetőség",
  }[name] || name;
}

function inspectionLink(details: unknown): string | null {
  return getString(details, "inspectionResultLink");
}

function humanizeError(error: string): string {
  if (error.includes("OpenAI audit failed") || error.includes("openai")) return "Az AI-összefoglaló nem készült el, de az ellenőrzés folytatható.";
  return error;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border bg-white p-4"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>;
}
