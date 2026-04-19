"use client";

import { useMemo, useState } from "react";

type LabMarker = {
  name: string;
  value: string;
  referenceRange?: string;
  status: "low" | "high" | "borderline" | "normal" | "unknown";
  plainMeaning: string;
};

type LabProduct = {
  name: string;
  url: string;
  imageUrl?: string | null;
  reason: string;
};

type LabAnalysis = {
  summary: string;
  primaryFinding: {
    title: string;
    explanation: string;
  };
  secondaryFinding?: {
    title: string;
    explanation: string;
  };
  abnormalMarkers: LabMarker[];
  practicalAdvice: string[];
  products: LabProduct[];
  disclaimer: string;
};

const acceptedTypes = ".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.html";
const loadingMessages = [
  "Elkezdtük az elemzést...",
  "Kiolvassuk a laborértékeket...",
  "Összevetjük a referenciatartományokkal...",
  "Megnézzük, melyik minta lehet a legfontosabb...",
  "Összeállítjuk a gyakorlati javaslatokat...",
  "Még egy pillanat, és mutatjuk az eredményt...",
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function statusLabel(status: LabMarker["status"]) {
  if (status === "low") return "Alacsony";
  if (status === "high") return "Magas";
  if (status === "borderline") return "Határérték közeli";
  if (status === "normal") return "Normál";
  return "Nem egyértelmű";
}

export default function LabResultChecker() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LabAnalysis | null>(null);

  const fileLabel = useMemo(() => {
    if (!file) return "PDF, kép, CSV vagy szöveges laborlelet";
    return `${file.name} · ${formatFileSize(file.size)}`;
  }, [file]);

  async function handleSubmit() {
    if (!file || isLoading) return;
    setIsLoading(true);
    setLoadingStep(0);
    setError("");
    setResult(null);
    const interval = window.setInterval(() => {
      setLoadingStep((step) => Math.min(step + 1, loadingMessages.length - 1));
    }, 2400);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/mi-hianyzik/lab-check", {
        method: "POST",
        body,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Nem sikerült elemezni a laboreredményt.");
      setResult(data as LabAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Váratlan hiba történt.");
    } finally {
      window.clearInterval(interval);
      setIsLoading(false);
    }
  }

  return (
    <div className="mh-lab-checker">
      <div className="mh-lab-upload">
        <label className="mh-lab-drop">
          <input
            type="file"
            accept={acceptedTypes}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            disabled={isLoading}
          />
          <span className="mh-lab-drop-icon" aria-hidden>
            ↑
          </span>
          <strong>{file ? "Feltöltött fájl" : "Laboreredmény feltöltése"}</strong>
          <small>{fileLabel}</small>
        </label>

        <button className="mh-lab-submit" type="button" onClick={handleSubmit} disabled={!file || isLoading}>
          {isLoading ? "Elemzem a leletet..." : "Laboreredmény elemzése"}
        </button>
      </div>

      {isLoading ? (
        <div className="mh-lab-loading" role="status" aria-live="polite">
          <span aria-hidden />
          <p>{loadingMessages[loadingStep]}</p>
        </div>
      ) : null}

      <p className="mh-lab-note">
        A checker nem állít fel diagnózist és nem helyettesít orvost. A cél az, hogy érthetően kiemelje, mi térhet el a
        referenciatartománytól, és milyen életmódbeli vagy étrend-kiegészítő irány lehet releváns.
      </p>

      {error ? <div className="mh-lab-error">{error}</div> : null}

      {result ? (
        <div className="mh-lab-result">
          <section className="mh-lab-result-main">
            <span>Labor összefoglaló</span>
            <h3>{result.primaryFinding.title}</h3>
            <p>{result.primaryFinding.explanation}</p>
            <p>{result.summary}</p>
          </section>

          {result.secondaryFinding ? (
            <section className="mh-lab-result-card">
              <h4>Kiegészítő megállapítás</h4>
              <strong>{result.secondaryFinding.title}</strong>
              <p>{result.secondaryFinding.explanation}</p>
            </section>
          ) : null}

          <section className="mh-lab-result-card">
            <h4>Normától eltérő vagy figyelmet kérő értékek</h4>
            <div className="mh-lab-marker-grid">
              {result.abnormalMarkers.length > 0 ? (
                result.abnormalMarkers.map((marker) => (
                  <article key={`${marker.name}-${marker.value}`} className={`mh-lab-marker is-${marker.status}`}>
                    <div>
                      <strong>{marker.name}</strong>
                      <span>{statusLabel(marker.status)}</span>
                    </div>
                    <p>
                      {marker.value}
                      {marker.referenceRange ? ` · ref.: ${marker.referenceRange}` : ""}
                    </p>
                    <small>{marker.plainMeaning}</small>
                  </article>
                ))
              ) : (
                <p className="mh-lab-empty">A feltöltött lelet alapján nem volt egyértelműen kiemelhető eltérés.</p>
              )}
            </div>
          </section>

          <section className="mh-lab-result-card">
            <h4>Gyakorlati tanácsok, következő lépések</h4>
            <div className="mh-lab-advice-list">
              {result.practicalAdvice.map((item) => (
                <article key={item}>
                  <span aria-hidden>✓</span>
                  <p>{item}</p>
                </article>
              ))}
            </div>
          </section>

          {result.products.length > 0 ? (
            <section className="mh-lab-result-card">
              <h4>Releváns termékajánlás</h4>
              <div className="mh-lab-products">
                {result.products.map((product) => (
                  <a key={product.url} href={product.url} target="_blank" rel="noreferrer" className="mh-lab-product">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.imageUrl} alt="" />
                    ) : (
                      <span aria-hidden>{product.name.slice(0, 1)}</span>
                    )}
                    <div>
                      <strong>{product.name}</strong>
                      <small>{product.reason}</small>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          <p className="mh-lab-disclaimer">{result.disclaimer}</p>
        </div>
      ) : null}
    </div>
  );
}
