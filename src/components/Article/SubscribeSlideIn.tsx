"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  categorySlug: string;
  categoryLabel?: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  "immunrendszer-erositese-es-altalanos-egeszsegmegorzes": "Immunrendszer erősítése és általános egészségmegőrzés",
  "csontok-izuletek-es-izomrendszer": "Csontok, ízületek és izomrendszer",
  "energia-es-mentalis-frissesseg": "Energia és mentális frissesség",
  "hidratacio-es-elektrolit-egyensuly-fenntartasa": "Hidratáció és elektrolit-egyensúly fenntartása",
  "sziv-es-errendszer-egeszsege": "Szív- és érrendszer egészsége",
  "optimalis-megoldas": "Optimális megoldás",
  "meregtelenites": "Méregtelenítés",
};

function humanizeCategory(slug: string): string {
  const mapped = CATEGORY_LABELS[slug];
  if (mapped) return mapped;
  return slug
    .split("-")
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : ""))
    .join(" ");
}

export default function SubscribeSlideIn({ categorySlug, categoryLabel }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  const label = useMemo(() => {
    const raw = String(categoryLabel || "").trim();
    return raw ? raw : humanizeCategory(categorySlug);
  }, [categoryLabel, categorySlug]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!categorySlug) return;
    const seenKey = "subscribeSlideInSeen";
    const subscribedKey = `subscribeSlideInSubscribed:${categorySlug}`;
    const subscribedAt = Number(localStorage.getItem(subscribedKey) || "0");
    const withinDays = subscribedAt && Date.now() - subscribedAt < 1000 * 60 * 60 * 24 * 30;
    if (sessionStorage.getItem(seenKey) === "1" || withinDays) return;
    const ref = document.referrer || "";
    const qs = window.location.search || "";
    const qsLower = qs.toLowerCase();
    const fromEmailUtm =
      qsLower.includes("utm_medium=email") ||
      qsLower.includes("utm_medium=newsletter") ||
      qsLower.includes("utm_source=mailerlite") ||
      qsLower.includes("utm_source=mailer") ||
      qsLower.includes("utm_source=email") ||
      qsLower.includes("utm_campaign=digest") ||
      qsLower.includes("utm_campaign=newsletter");
    if (ref.includes("mailerlite.com") || fromEmailUtm) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let hasProductClick = false;
    let canShow = false;
    let timeReached = false;

    timer = setTimeout(() => {
      canShow = true;
      timeReached = true;
    }, 60_000);

    const showOnce = () => {
      if (dismissed || visible || hasProductClick || !canShow) return;
      setVisible(true);
      sessionStorage.setItem(seenKey, "1");
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest?.("a");
      const href = link?.getAttribute?.("href") || "";
      if (href.includes("/termek/")) {
        hasProductClick = true;
      }
    };

    const onMouseOut = (event: MouseEvent) => {
      const related = event.relatedTarget as HTMLElement | null;
      const leavingWindow = !related && event.clientY <= 0;
      if (leavingWindow) {
        showOnce();
      }
    };

    const onVisibility = () => {
      if (!timeReached) return;
      if (!document.hidden) {
        showOnce();
      }
    };

    const onScroll = () => {
      if (!timeReached) return;
      if (window.scrollY <= 40) {
        showOnce();
      }
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScroll);
    };
  }, [categorySlug, dismissed, visible, mounted]);

  const submit = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("Kérlek add meg az email címed.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          first_name: firstName.trim(),
          category_slug: categorySlug,
          source: "article-exit",
        }),
      });
      if (!res.ok) throw new Error("request_failed");
      setStatus("ok");
      const subscribedKey = `subscribeSlideInSubscribed:${categorySlug}`;
      localStorage.setItem(subscribedKey, String(Date.now()));
    } catch {
      setStatus("error");
      setError("Nem sikerült feliratkozni. Próbáld újra!");
    }
  };

  if (!mounted || !categorySlug || dismissed) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "16px",
        right: "16px",
        bottom: "92px",
        zIndex: 50,
        transform: visible ? "translateY(0)" : "translateY(130%)",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "transform 300ms ease, opacity 200ms ease",
      }}
      aria-hidden={!visible}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.98)",
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 16,
          padding: "16px 16px 14px",
          boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Értesítést kérsz új cikkekről?</div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Bezárás"
            style={{
              background: "transparent",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              lineHeight: 1,
              opacity: 0.6,
            }}
          >
            ×
          </button>
        </div>
        <div style={{ marginTop: 6, color: "#374151", fontSize: 14 }}>
          Ha a(z) {label} témában szeretnél új cikkről értesítést, iratkozz fel.
        </div>
        {status === "ok" ? (
          <div style={{ marginTop: 12, fontWeight: 600, color: "#065f46" }}>
            Köszi! Hamarosan küldjük az új cikkeket.
          </div>
        ) : (
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Keresztnév (opcionális)"
              style={{
                flex: "1 1 160px",
                minWidth: 140,
                border: "1px solid rgba(0,0,0,0.16)",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 14,
              }}
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email címed"
              style={{
                flex: "1 1 220px",
                minWidth: 180,
                border: "1px solid rgba(0,0,0,0.16)",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 14,
              }}
            />
            <button
              type="button"
              onClick={submit}
              disabled={status === "loading"}
              style={{
                background: "#c2410c",
                color: "white",
                border: "none",
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {status === "loading" ? "Küldöm..." : "Feliratkozom"}
            </button>
          </div>
        )}
        {status === "error" ? (
          <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 13 }}>{error}</div>
        ) : null}
      </div>
    </div>
  );
}
