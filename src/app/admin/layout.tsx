

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
      className="min-h-screen bg-slate-50 text-slate-900"
    >
      <div
        className="max-w-[1200px] mx-auto px-4 pb-10 pt-4"
      >
        {/* Header */}
        <header
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-4 rounded-2xl bg-white border border-slate-900/10 shadow-[0_10px_30px_rgba(15,23,42,0.08)]"
        >
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="w-9 h-9 rounded-xl border border-slate-900/10"
              style={{
                background:
                  "radial-gradient(circle at 30% 30%, rgba(194,65,11,0.9), rgba(194,65,11,0.15) 55%, rgba(255,255,255,0.04) 100%)",
              }}
            />
            <div>
              <div className="font-extrabold tracking-[0.2px]">Admin</div>
              <div className="text-xs opacity-75">Tartalmak és termékek kezelése</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
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
                className="text-[13px] text-slate-900 px-3 py-2 rounded-xl border border-slate-900/15 bg-slate-900/5"
              >
                Kijelentkezés
              </button>
            </form>
            <Link
              href="/"
              className="text-[13px] text-slate-900 px-3 py-2 rounded-xl border border-slate-900/15 bg-orange-700/10"
            >
              ← Vissza a weboldalra
            </Link>
          </div>
        </header>

        {/* Shell */}
        <div
          className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 mt-4"
        >
          {/* Sidebar */}
          <aside
            className="md:sticky md:top-4 md:self-start rounded-2xl border border-slate-900/10 bg-white p-3"
          >
            <nav className="grid gap-2">
              <AdminNavLink href="/admin/articles" label="Cikkek" />
              <AdminNavLink href="/admin/products" label="Termékek" />
              <AdminNavLink href="/admin/categories" label="Kategóriák" />
              <AdminNavLink href="/admin/automation" label="Automata" />
              <AdminNavLink href="/admin/chat-sessions" label="Chat sessionök" />
            </nav>

            <div
              className="h-px bg-slate-900/10 my-3"
            />

            <div className="text-xs opacity-80 leading-[1.4]">
              Tipp: ha a felső menü eddig kidobált a frontendbe, ez a layout már
              külön admin keretet ad (nincs SiteHeader/SiteFooter).
            </div>
          </aside>

          {/* Content */}
          <main
            className="rounded-2xl border border-slate-900/10 bg-white p-4 min-h-[520px]"
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
      className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-slate-900/10 bg-slate-900/5 text-slate-900 no-underline"
    >
      <span className="font-bold">{label}</span>
      <span aria-hidden className="opacity-60">
        →
      </span>
    </Link>
  );
}
