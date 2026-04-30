"use client";

import { useState } from "react";

type Marker = {
  name: string;
  value: string;
  referenceRange?: string;
  status: "low" | "high" | "borderline" | "normal" | "unknown";
  plainMeaning: string;
};

type Product = {
  name: string;
  reason: string;
  affiliateLabel1?: string;
  affiliateUrl1?: string;
  affiliateLabel2?: string;
  affiliateUrl2?: string;
};

type AnalysisPayload = {
  subject: string;
  html: string;
  adviceHtml: string;
  productsHtml: string;
  markers: Marker[];
  products: Product[];
};

function statusColor(status: Marker["status"]) {
  if (status === "high") return "#dc2626";
  if (status === "low") return "#ea580c";
  if (status === "borderline") return "#f59e0b";
  return "#22c55e";
}

export default function AdminLaborAnalysisTool() {
  const [file, setFile] = useState<File | null>(null);
  const [email, setEmail] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [adviceHtml, setAdviceHtml] = useState("");
  const [productsHtml, setProductsHtml] = useState("");
  const [subject, setSubject] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function analyze() {
    if (!file) return setError("Tölts fel egy PDF fájlt.");
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/admin/labor-analysis/analyze", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Az elemzés nem sikerült.");
      setAnalysis(data);
      setAdviceHtml(data.adviceHtml || "");
      setProductsHtml(data.productsHtml || "");
      setSubject(data.subject || "Laboreredményed összefoglalója");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Váratlan hiba történt.");
    } finally {
      setLoading(false);
    }
  }

  async function sendEmail() {
    if (!analysis) return;
    if (!email.trim()) return setError("Adj meg egy e-mail címet.");
    setError("");
    setSuccess("");
    setSending(true);
    try {
      const response = await fetch("/api/admin/labor-analysis/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email.trim(),
          subject,
          html: analysis.html.replace(analysis.adviceHtml, adviceHtml).replace(analysis.productsHtml, productsHtml),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Az e-mail küldése nem sikerült.");
      setSuccess("Az elemzés sikeresen elküldve.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Váratlan hiba történt.");
    } finally {
      setSending(false);
    }
  }

  function downloadPdfLike() {
    if (!analysis) return;
    const html = analysis.html.replace(analysis.adviceHtml, adviceHtml).replace(analysis.productsHtml, productsHtml);
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  const previewHtml =
    analysis?.html.replace(analysis.adviceHtml, adviceHtml).replace(analysis.productsHtml, productsHtml) || "";

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border p-4 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-semibold block">Optimalizált PDF feltöltése</label>
          <input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <button onClick={analyze} disabled={!file || loading} className="rounded-xl bg-black px-4 py-2 text-sm text-white">
          {loading ? "Elemzés folyamatban..." : "PDF elemzése"}
        </button>
      </div>

      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div> : null}

      {analysis ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border p-4">
              <h2 className="text-lg font-bold">1. Értékek vizuális elemzése</h2>
              <div className="mt-4 space-y-3">
                {analysis.markers.map((marker) => (
                  <div key={`${marker.name}-${marker.value}`} className="rounded-xl border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <strong>{marker.name}</strong>
                      <span style={{ color: statusColor(marker.status) }} className="font-black">
                        {marker.value}
                      </span>
                    </div>
                    <div className="mt-2 h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: marker.status === "high" || marker.status === "low" ? "85%" : marker.status === "borderline" ? "58%" : "32%",
                          background: statusColor(marker.status),
                        }}
                      />
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {marker.referenceRange ? `Referencia: ${marker.referenceRange}` : ""} {marker.plainMeaning}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border p-4">
                <h2 className="text-lg font-bold">2. Gyakorlati tanácsok</h2>
                <textarea
                  value={adviceHtml}
                  onChange={(e) => setAdviceHtml(e.target.value)}
                  className="mt-3 min-h-[220px] w-full rounded-xl border p-3 text-sm font-mono"
                />
              </div>
              <div className="rounded-2xl border p-4">
                <h2 className="text-lg font-bold">3. Termékajánló</h2>
                <textarea
                  value={productsHtml}
                  onChange={(e) => setProductsHtml(e.target.value)}
                  className="mt-3 min-h-[240px] w-full rounded-xl border p-3 text-sm font-mono"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border p-4 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[260px]">
                <label className="block text-sm font-semibold mb-1">Címzett e-mail</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  placeholder="nev@email.hu"
                />
              </div>
              <div className="flex-1 min-w-[260px]">
                <label className="block text-sm font-semibold mb-1">Tárgy</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-xl border px-3 py-2 text-sm" />
              </div>
              <button onClick={sendEmail} disabled={sending} className="rounded-xl bg-orange-600 px-4 py-2 text-sm text-white">
                {sending ? "Küldés..." : "Küldés"}
              </button>
              <button onClick={downloadPdfLike} className="rounded-xl border px-4 py-2 text-sm">
                Mentés PDF-ként
              </button>
            </div>
          </div>

          <div className="rounded-2xl border p-4">
            <h2 className="text-lg font-bold">Preview</h2>
            <div className="mt-4 rounded-xl border bg-white p-4">
              <iframe title="Labor hírlevél preview" className="min-h-[900px] w-full border-0" srcDoc={previewHtml} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
