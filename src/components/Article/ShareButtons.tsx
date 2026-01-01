"use client";

import { useEffect, useState } from "react";

type Props = {
  url: string;
  title?: string;
};

function openShareUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

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

export default function ShareButtons({ url, title }: Props) {
  const [copied, setCopied] = useState<null | string>(null);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(null), 2500);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function onCopy(label: string) {
    await copyText(url);
    setCopied(label);
  }

  async function onNativeShare() {
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          await onCopy("Link");
        }
      }
      return;
    }
    await onCopy("Link");
  }

  function onFacebook() {
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
    openShareUrl(shareUrl);
  }

  return (
    <div className="mt-6 rounded-2xl border border-slate-900/10 bg-white/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="text-sm font-semibold text-slate-900">
        Ha szerinted lehet még valaki, akit érdekel ez a cikk, kérlek oszd meg vele!
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onNativeShare}
          className="group inline-flex items-center justify-between rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white px-4 py-3 text-sm font-semibold text-emerald-900 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          Megosztás
          <span className="opacity-60 transition group-hover:translate-x-0.5">→</span>
        </button>
        <button
          type="button"
          onClick={onFacebook}
          className="group inline-flex items-center justify-between rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-white px-4 py-3 text-sm font-semibold text-blue-900 transition hover:-translate-y-0.5 hover:shadow-md"
        >
          Facebook
          <span className="opacity-60 transition group-hover:translate-x-0.5">→</span>
        </button>
      </div>
      {copied ? (
        <div className="mt-3 text-xs text-emerald-700">
          Link kimásolva.
        </div>
      ) : null}
      {title ? (
        <div className="mt-2 text-[11px] text-slate-500">
          Cím: {title}
        </div>
      ) : null}
    </div>
  );
}
