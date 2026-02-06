"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import ChatOpenButton from "@/components/ChatOpenButton";
import "./SiteHeader.css";

export default function SiteHeader() {
  const pathname = usePathname() || "/";
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <header
      className="site-header"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
      }}
    >
      <div className="container inner" style={{ display: "flex", alignItems: "center" }}>
        <Link href="/" className="brand" aria-label="sokaigelek.hu – főoldal">
          <Image
            src="/logo.png"
            alt="sokaigelek.hu"
            width={130}
            height={32}
            priority
            sizes="130px"
            quality={70}
            style={{ height: "auto", width: "auto", maxHeight: "65px" }}
          />
        </Link>

        <button
          type="button"
          className="nav-toggle"
          aria-label="Menü megnyitása"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>

        <nav className={`site-nav ${menuOpen ? "is-open" : ""}`} aria-label="Fő navigáció">
          <Link
            href="/"
            className={isActive("/") ? "is-active" : undefined}
            aria-current={isActive("/") ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            Főoldal
          </Link>

          <Link
            href="/cikkek"
            className={isActive("/cikkek") ? "is-active" : undefined}
            aria-current={isActive("/cikkek") ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            Jóllét Kalauz
          </Link>

          <Link
            href="/termek"
            className={isActive("/termek") ? "is-active" : undefined}
            aria-current={isActive("/termek") ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            Étrend-kiegészítők
          </Link>

          <Link
            href="/kereses"
            className={isActive("/kereses") ? "is-active" : undefined}
            aria-current={isActive("/kereses") ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            Keresés
          </Link>

          <ChatOpenButton
            className="header-cta"
            style={{ whiteSpace: "nowrap" }}
          >
            <span aria-hidden>💬</span>
            <span>Tanácsot kérek</span>
          </ChatOpenButton>
        </nav>
      </div>
    </header>
  );
}
