"use client";

import { useMemo, useState } from "react";

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

export default function SubscribeInline({ categorySlug, categoryLabel }: Props) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [error, setError] = useState("");

  const label = useMemo(() => {
    const raw = String(categoryLabel || "").trim();
    return raw ? raw : humanizeCategory(categorySlug);
  }, [categoryLabel, categorySlug]);

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
          source: "article-inline",
        }),
      });
      if (!res.ok) throw new Error("request_failed");
      setStatus("ok");
    } catch {
      setStatus("error");
      setError("Nem sikerült feliratkozni. Próbáld újra!");
    }
  };

  if (!categorySlug) return null;

  return (
    <section
      style={{
        marginTop: 18,
        border: "1px solid rgba(194,65,11,0.18)",
        borderRadius: 18,
        padding: "16px 18px",
        background: "rgba(255,255,255,0.92)",
        boxShadow: "0 12px 28px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Értesítést kérsz új cikkekről?</div>
      <div style={{ color: "#374151", fontSize: 14, marginBottom: 12 }}>
        Ha a(z) {label} témában szeretnél új cikkről értesítést, iratkozz fel.
      </div>
      {status === "ok" ? (
        <div style={{ fontWeight: 700, color: "#16a34a" }}>Köszönjük! Sikeres feliratkozás.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <input
              type="text"
              placeholder="Keresztnév (opcionális)"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
                fontSize: 14,
              }}
            />
            <input
              type="email"
              placeholder="Email címed"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(0,0,0,0.12)",
                fontSize: 14,
              }}
            />
          </div>
          {error ? <div style={{ color: "#dc2626", fontSize: 13 }}>{error}</div> : null}
          <button
            type="button"
            onClick={submit}
            disabled={status === "loading"}
            style={{
              alignSelf: "flex-start",
              borderRadius: 999,
              border: "1px solid rgba(194,65,11,0.35)",
              padding: "10px 16px",
              fontWeight: 800,
              background: "linear-gradient(180deg, rgba(255,255,255,1), rgba(255,247,242,0.98))",
              cursor: status === "loading" ? "default" : "pointer",
              transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease",
            }}
            onMouseEnter={(e) => {
              if (status === "loading") return;
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow = "0 10px 18px rgba(194,65,11,0.18)";
              e.currentTarget.style.borderColor = "rgba(194,65,11,0.6)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
              e.currentTarget.style.borderColor = "rgba(194,65,11,0.35)";
            }}
          >
            {status === "loading" ? "Küldöm..." : "Feliratkozom"}
          </button>
        </div>
      )}
    </section>
  );
}
