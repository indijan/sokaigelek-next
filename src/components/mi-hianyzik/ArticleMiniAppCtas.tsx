"use client";

import Link from "next/link";
import { useState } from "react";
import "./ArticleMiniAppCtas.css";

const HIDE_MS = 14 * 24 * 60 * 60 * 1000;
const DESKTOP_KEY = "mh_article_desktop_cta_hidden_until";
const MOBILE_KEY = "mh_article_mobile_cta_hidden_until";

function shouldShowFromStorage(key: string) {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(key);
  if (!raw) return true;
  const until = Number(raw);
  if (!Number.isFinite(until)) return true;
  return Date.now() > until;
}

function hideForTwoWeeks(key: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, String(Date.now() + HIDE_MS));
}

export function ArticleMiniAppDesktopStickyCta() {
  const [visible, setVisible] = useState<boolean>(() => shouldShowFromStorage(DESKTOP_KEY));

  if (!visible) return null;

  return (
    <aside className="mh-article-sticky-cta" aria-label="Mi hiányzik nekem állapotfelmérés ajánló">
      <div className="mh-article-sticky-card">
        <button
          type="button"
          className="mh-article-cta-close"
          aria-label="Ajánló bezárása"
          onClick={() => {
            hideForTwoWeeks(DESKTOP_KEY);
            setVisible(false);
          }}
        >
          ×
        </button>
        <div className="mh-article-sticky-eyebrow">2 perces állapotfelmérés</div>
        <h3>Nem áll össze, mi lehet a gond?</h3>
        <p>A személyre szabott állapotfelmérő gyorsan leszűkíti, mire lehet szüksége a szervezetednek.</p>
        <Link href="/mi-hianyzik-nekem" className="mh-article-sticky-link">
          Kitöltöm
        </Link>
      </div>
    </aside>
  );
}

export function ArticleMiniAppFloatingCta() {
  const [visible, setVisible] = useState<boolean>(() => shouldShowFromStorage(MOBILE_KEY));

  if (!visible) return null;

  return (
    <div className="mh-article-floating-cta" aria-label="Mi hiányzik nekem állapotfelmérés gyorsgomb">
      <button
        type="button"
        className="mh-article-cta-close mh-article-cta-close-mobile"
        aria-label="Mobil ajánló bezárása"
        onClick={() => {
          hideForTwoWeeks(MOBILE_KEY);
          setVisible(false);
        }}
      >
        ×
      </button>
      <Link href="/mi-hianyzik-nekem" className="mh-article-floating-link">
        Mi hiányzik nekem? <span>2 perces állapotfelmérés</span>
      </Link>
    </div>
  );
}

export function ArticleMiniAppInlinePromo() {
  return (
    <section className="mh-article-inline-promo" aria-label="Mi hiányzik nekem cikkközi ajánló">
      <p>Lehet, hogy a tested már jelez neked, csak még nem tudod hogyan értelmezd. Próbáld ki a 2 perces állapotfelmérést, ami segít a szervezeted által adott jelek értelmezésében.</p>
      <Link href="/mi-hianyzik-nekem">Kipróbálom</Link>
    </section>
  );
}
