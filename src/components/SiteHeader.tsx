import Link from "next/link";
import Image from "next/image";
import ChatOpenButton from "@/components/ChatOpenButton";
import "./SiteHeader.css";

export default function SiteHeader() {
  const navToggleId = "site-nav-toggle";

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

        <input id={navToggleId} className="nav-toggle-input" type="checkbox" aria-hidden="true" />
        <label htmlFor={navToggleId} className="nav-toggle" aria-label="Menü megnyitása">
          ☰
        </label>

        <nav className="site-nav" aria-label="Fő navigáció">
          <Link
            href="/"
          >
            Főoldal
          </Link>

          <Link
            href="/cikkek"
          >
            Jóllét Kalauz
          </Link>

          <Link
            href="/termek"
          >
            Étrend-kiegészítők
          </Link>

          <Link
            href="/kereses"
          >
            Keresés
          </Link>

          <ChatOpenButton className="header-cta" style={{ whiteSpace: "nowrap" }}>
            <span aria-hidden>💬</span>
            <span>Tanácsot kérek</span>
          </ChatOpenButton>
        </nav>
      </div>
    </header>
  );
}
