import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import {
  getSearchConsoleSiteUrl,
  inspectUrl,
  listSitemaps,
  querySearchAnalytics,
  type SearchAnalyticsRow,
} from "@/lib/googleSearchConsole";

export const maxDuration = 60;

function authorized(req: Request): boolean {
  const { searchParams } = new URL(req.url);
  const expected = process.env.CRON_SECRET || "";
  const secret = searchParams.get("secret") || "";
  const ua = req.headers.get("user-agent") || "";
  return req.headers.get("x-vercel-cron") === "1" || ua.toLowerCase().includes("cloudflare-cron/") ||
    (!!expected && secret === expected);
}

function dateInBudapest(offsetDays: number): string {
  const now = new Date(Date.now() - offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function sum(rows: SearchAnalyticsRow[]): { clicks: number; impressions: number } {
  return rows.reduce<{ clicks: number; impressions: number }>(
    (acc, row) => ({
      clicks: acc.clicks + Number(row.clicks || 0),
      impressions: acc.impressions + Number(row.impressions || 0),
    }),
    { clicks: 0, impressions: 0 },
  );
}

function extractIndexedUrls(rows: SearchAnalyticsRow[]): string[] {
  return rows.map((row) => String(row.keys?.[0] || "")).filter((url) => /^https?:\/\//i.test(url));
}

async function createAiSummary(input: unknown): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey || process.env.GSC_AI_ENABLED === "0") return null;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.GSC_AI_MODEL || process.env.OPENAI_MODEL || "gpt-5-mini",
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: "Magyar SEO auditor vagy. A kapott Search Console adatokat röviden értékeld. Ne találj ki adatot, és ne javasolj orvosi állítást. Különítsd el a biztos hibát a lehetőségtől. Adj legfeljebb 5, konkrét, alacsony kockázatú következő lépést. Publikált tartalom, canonical, redirect vagy schema automatikus módosítását ne kérd közvetlenül; csak javasold jóváhagyásra.",
        },
        { role: "user", content: JSON.stringify(input).slice(0, 18000) },
      ],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`OpenAI audit failed (${response.status})`);
  return String(payload.choices?.[0]?.message?.content || "").trim() || null;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.GSC_AUDIT_ENABLED !== "1") return NextResponse.json({ ok: true, skipped: "disabled" });

  let runId: string | null = null;
  try {
    const siteUrl = getSearchConsoleSiteUrl();
    const { data: run, error: runError } = await supabaseServer
      .from("search_console_audit_runs")
      .insert({ site_url: siteUrl })
      .select("id")
      .single();
    if (runError) throw runError;
    runId = run.id;

    const endDate = dateInBudapest(3);
    const startDate = dateInBudapest(9);
    const [pages, queries, sitemap] = await Promise.all([
      querySearchAnalytics(startDate, endDate, ["page"], 1000),
      querySearchAnalytics(startDate, endDate, ["query"], 1000),
      listSitemaps(),
    ]);

    const findings: Array<Record<string, unknown>> = [];
    for (const row of pages) {
      const url = String(row.keys?.[0] || "");
      const impressions = Number(row.impressions || 0);
      const ctr = Number(row.ctr || 0);
      const position = Number(row.position || 0);
      if (url && impressions >= 30 && ctr < 0.02 && position <= 12) {
        findings.push({
          run_id: runId,
          finding_type: "low_ctr",
          severity: "warning",
          url,
          title: "Magas megjelenés, alacsony CTR",
          details: { impressions, ctr, position },
        });
      }
    }

    const candidateUrls = [...new Set(extractIndexedUrls(pages))].slice(0, 25);
    for (const url of candidateUrls) {
      try {
        const inspection = (await inspectUrl(url)) as {
          inspectionResult?: {
            indexStatusResult?: Record<string, unknown>;
            inspectionResultLink?: string;
          };
        };
        const result = inspection?.inspectionResult || {};
        const index = result.indexStatusResult || {};
        const failed = [index.verdict, index.robotsTxtState, index.pageFetchState].some((value) =>
          value && !["PASS", "ALLOWED", "SUCCESS"].includes(String(value))
        );
        if (failed) {
          findings.push({
            run_id: runId,
            finding_type: "url_inspection",
            severity: "warning",
            url,
            title: "URL Inspection eltérést jelzett",
            details: { indexStatusResult: index, inspectionResultLink: result.inspectionResultLink },
          });
        }
      } catch (error) {
        findings.push({
          run_id: runId,
          finding_type: "url_inspection_error",
          severity: "info",
          url,
          title: "URL Inspection nem futott le",
          details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
      }
    }

    if (findings.length) {
      const { error } = await supabaseServer.from("search_console_audit_findings").insert(findings);
      if (error) throw error;
    }

    const summary = {
      dateRange: { startDate, endDate },
      pageRows: pages.length,
      queryRows: queries.length,
      pageTotals: sum(pages),
      queryTotals: sum(queries),
      findings: findings.length,
      inspectedUrls: candidateUrls.length,
      sitemap,
    };
    const aiSummary = await createAiSummary({ summary, findings: findings.slice(0, 50) });
    await supabaseServer.from("search_console_audit_runs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      summary,
      ai_summary: aiSummary,
    }).eq("id", runId);

    return NextResponse.json({ ok: true, runId, findings: findings.length, inspectedUrls: candidateUrls.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "search_console_audit_failed";
    if (runId) {
      await supabaseServer.from("search_console_audit_runs").update({
        status: "failed",
        finished_at: new Date().toISOString(),
        error: message,
      }).eq("id", runId);
    }
    console.error("search_console_audit_failed", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
