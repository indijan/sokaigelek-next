

import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Admin – Sokáig élek",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#0f172a",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "16px 16px 40px",
        }}
      >
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 16px",
            borderRadius: 16,
            background: "#ffffff",
            border: "1px solid rgba(15,23,42,0.08)",
            boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              aria-hidden
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background:
                  "radial-gradient(circle at 30% 30%, rgba(194,65,11,0.9), rgba(194,65,11,0.15) 55%, rgba(255,255,255,0.04) 100%)",
                border: "1px solid rgba(15,23,42,0.10)",
              }}
            />
            <div>
              <div style={{ fontWeight: 800, letterSpacing: "0.2px" }}>
                Admin
              </div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                Tartalmak és termékek kezelése
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <form
              action={async () => {
                "use server";
                const cs = await cookies();
                cs.set("admin_ok", "", {
                  httpOnly: true,
                  sameSite: "lax",
                  path: "/",
                  maxAge: 0,
                });
                redirect("/admin");
              }}
            >
              <button
                type="submit"
                style={{
                  fontSize: 13,
                  textDecoration: "none",
                  color: "#0f172a",
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(15,23,42,0.12)",
                  background: "rgba(15,23,42,0.03)",
                  cursor: "pointer",
                }}
              >
                Kijelentkezés
              </button>
            </form>
            <Link
              href="/"
              style={{
                fontSize: 13,
                textDecoration: "none",
                color: "#0f172a",
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid rgba(15,23,42,0.12)",
                background: "rgba(194,65,11,0.08)",
              }}
            >
              ← Vissza a weboldalra
            </Link>
          </div>
        </header>

        {/* Shell */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "260px 1fr",
            gap: 16,
            marginTop: 16,
          }}
        >
          {/* Sidebar */}
          <aside
            style={{
              position: "sticky",
              top: 16,
              alignSelf: "start",
              borderRadius: 16,
              border: "1px solid rgba(15,23,42,0.08)",
              background: "#ffffff",
              padding: 12,
            }}
          >
            <nav style={{ display: "grid", gap: 8 }}>
              <AdminNavLink href="/admin/articles" label="Cikkek" />
              <AdminNavLink href="/admin/products" label="Termékek" />
              <AdminNavLink href="/admin/categories" label="Kategóriák" />
              <AdminNavLink href="/admin/automation" label="Automata" />
              <AdminNavLink href="/admin/chat-sessions" label="Chat sessionök" />
            </nav>

            <div
              style={{
                height: 1,
                background: "rgba(15,23,42,0.10)",
                margin: "12px 0",
              }}
            />

            <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.4 }}>
              Tipp: ha a felső menü eddig kidobált a frontendbe, ez a layout már
              külön admin keretet ad (nincs SiteHeader/SiteFooter).
            </div>
          </aside>

          {/* Content */}
          <main
            style={{
              borderRadius: 16,
              border: "1px solid rgba(15,23,42,0.08)",
              background: "#ffffff",
              padding: 16,
              minHeight: 520,
            }}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function AdminNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 12,
        textDecoration: "none",
        color: "#0f172a",
        border: "1px solid rgba(15,23,42,0.10)",
        background: "rgba(15,23,42,0.03)",
      }}
    >
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span aria-hidden style={{ opacity: 0.6 }}>
        →
      </span>
    </Link>
  );
}
