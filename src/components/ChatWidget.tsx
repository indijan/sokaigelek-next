"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const ui = useMemo(() => {
    // NOTE: we intentionally render into document.body (portal)
    // so that parent layout CSS (e.g. transform/overflow) can’t push it off-screen.

    if (!open) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Chat megnyitása"
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            zIndex: 2147483647,
            background: "#111827", // near-black
            color: "#ffffff",
            borderRadius: 9999,
            padding: "12px 16px",
            fontSize: 14,
            lineHeight: "16px",
            boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.12)",
            cursor: "pointer",
            opacity: 1,
          }}
        >
          Chat
        </button>
      );
    }

    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483647,
        }}
      >
        <button
          type="button"
          aria-label="Chat bezárása"
          onClick={() => setOpen(false)}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            border: "none",
            padding: 0,
            margin: 0,
            cursor: "pointer",
          }}
        />

        <div
          style={{
            position: "absolute",
            right: 24,
            bottom: 24,
            width: 380,
            maxWidth: "calc(100vw - 48px)",
            height: 520,
            maxHeight: "calc(100vh - 48px)",
            borderRadius: 16,
            background: "#ffffff",
            boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
            overflow: "hidden",
            border: "1px solid rgba(17,24,39,0.10)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
              borderBottom: "1px solid rgba(17,24,39,0.08)",
              background: "#ffffff",
            }}
          >
            <div style={{ fontWeight: 700, color: "#111827", fontSize: 14 }}>
              Sokáig élek – Chat
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                border: "1px solid rgba(17,24,39,0.12)",
                background: "#ffffff",
                borderRadius: 10,
                padding: "6px 10px",
                fontSize: 12,
                cursor: "pointer",
                color: "#111827",
              }}
            >
              Bezár
            </button>
          </div>

          <div
            style={{
              padding: 14,
              fontSize: 13,
              color: "#374151",
              overflow: "auto",
              flex: 1,
            }}
          >
            <div style={{ marginBottom: 8, fontWeight: 600, color: "#111827" }}>
              Itt fog megjelenni a chat UI.
            </div>
            <div>
              Következő lépés: visszakötjük a meglévő /api/chat logikát és a
              beszélgetés-logolást.
            </div>
          </div>
        </div>
      </div>
    );
  }, [open]);

  if (!mounted) return null;
  return createPortal(ui, document.body);
}