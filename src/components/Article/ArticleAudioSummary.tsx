"use client";

import { useMemo, useRef, useState } from "react";

type Props = {
  slug: string;
  title: string;
  shareUrl: string;
  relatedProductsUrl?: string | null;
};

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "absolute";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}

export default function ArticleAudioSummary({ slug, title, shareUrl, relatedProductsUrl }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const shareLabel = useMemo(() => `Érdekes cikk: ${title}`, [title]);

  const ensureAudio = async () => {
    if (audioUrl || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/articles/${encodeURIComponent(slug)}/summary`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Nem sikerült az összefoglalót betölteni.");
      }
      const data = await res.json();
      if (!data?.audioUrl) {
        throw new Error("Nem érkezett hanganyag.");
      }
      setAudioUrl(String(data.audioUrl));
    } catch (err: any) {
      setError(err?.message || "Hiba történt a lejátszás indításakor.");
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async () => {
    await ensureAudio();
    if (audioRef.current) {
      try {
        await audioRef.current.play();
      } catch {
        // ignore play errors (e.g. user gesture required)
      }
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: shareLabel, url: shareUrl });
        return;
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          await copyText(shareUrl);
        }
        return;
      }
    }
    await copyText(shareUrl);
  };

  return (
    <div className="article-audio-summary">
      <div className="audio-summary-heading">Hallgasd meg a cikk összefoglalóját</div>
      <p className="audio-summary-sub">
        Ha nincs időd, épp más dolgod van vagy egyszerűen jobban szeretsz hallgatni, akkor
        hallgasd meg a cikk összefoglalóját.
      </p>

      <div className="audio-summary-player">
        <button
          type="button"
          className="audio-play-button"
          onClick={handlePlay}
          aria-label="Lejátszás"
          disabled={loading}
        >
          {loading ? "…" : "▶"}
        </button>
        <div className="audio-status">
          {error ? (
            <span className="audio-error">{error}</span>
          ) : loading ? (
            "Összefoglaló készül, pár másodperc..."
          ) : audioUrl ? (
            "Készen áll a lejátszásra (kb. 1-2 perc)"
          ) : (
            "Kattints a lejátszásra az összefoglalóhoz."
          )}
        </div>
        {audioUrl ? (
          <audio ref={audioRef} src={audioUrl} preload="none" controls className="audio-native" />
        ) : null}
      </div>

      <div className="audio-summary-actions">
        <button type="button" className="audio-action primary" onClick={handleShare}>
          Küldd el az ismerősödnek
        </button>
        {relatedProductsUrl ? (
          <a className="audio-action secondary" href={relatedProductsUrl}>
            Nézd meg a kapcsolódó étrend-kiegészítőket
          </a>
        ) : null}
      </div>
    </div>
  );
}
