import Link from "next/link";
import "./SiteFooter.css";

function Icon({
                name,
                className = "w-4 h-4",
              }: {
  name: "mail" | "facebook" | "whatsapp" | "shield" | "file";
  className?: string;
}) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true,
  } as const;

  switch (name) {
    case "mail":
      return (
          <svg {...common}>
            <path
                d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
                stroke="currentColor"
                strokeWidth="1.7"
            />
            <path
                d="M6.5 7.2 12 11l5.5-3.8"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
          </svg>
      );
    case "facebook":
      return (
          <svg {...common}>
            <path
                d="M14 8.5V7.3c0-.8.3-1.3 1.4-1.3H17V3.2c-.3 0-1.3-.2-2.5-.2-2.4 0-4 1.5-4 4.2v1.3H8V11h2.5v10H14V11h2.7l.5-2.5H14Z"
                fill="currentColor"
            />
          </svg>
      );
    case "whatsapp":
      return (
          <svg {...common}>
            <path
                d="M12 3.5a8.5 8.5 0 0 0-7.3 12.9L4 21l4.8-1.6A8.5 8.5 0 1 0 12 3.5Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
            />
            <path
                d="M9.2 9.2c.2-.5.5-.5.8-.5h.7c.2 0 .5 0 .6.5l.8 1.8c.1.3.1.6-.1.8l-.6.7c.6 1.1 1.5 2 2.6 2.6l.7-.6c.2-.2.5-.2.8-.1l1.8.8c.5.2.5.4.5.6v.7c0 .3 0 .6-.5.8-.5.3-1.5.7-3.2.1-2-.7-3.7-2.4-4.5-4.5-.6-1.7-.2-2.7.1-3.2Z"
                fill="currentColor"
            />
          </svg>
      );
    case "shield":
      return (
          <svg {...common}>
            <path
                d="M12 3.5 19 6.5v6c0 4.5-3 7.7-7 9-4-1.3-7-4.5-7-9v-6l7-3Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
            />
            <path
                d="M9.2 12.2 11 14l3.8-4.2"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
          </svg>
      );
    case "file":
      return (
          <svg {...common}>
            <path
                d="M7 3.5h7l3 3v14A2.5 2.5 0 0 1 14.5 23h-7A2.5 2.5 0 0 1 5 20.5v-14A3 3 0 0 1 7 3.5Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
            />
            <path
                d="M14 3.5v3A2 2 0 0 0 16 8.5h3"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
            />
          </svg>
      );
    default:
      return null;
  }
}

function IconLink({
                    href,
                    children,
                    icon,
                    external,
                  }: {
  href: string;
  children: React.ReactNode;
  icon: "mail" | "facebook" | "whatsapp" | "shield" | "file";
  external?: boolean;
}) {
  const common = (
      <>
      <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: "1px solid var(--border)",
            background: "var(--card)",
            boxShadow: "var(--shadow-sm)",
          }}
      >
        <Icon name={icon} />
      </span>
        <span style={{ fontWeight: 600 }}>{children}</span>
      </>
  );

  const className =
      "footer-link row" /* row class exists in globals.css */;

  if (external) {
    return (
        <a
            className={className}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            style={{ gap: "0.65rem" }}
        >
          {common}
        </a>
    );
  }

  // internal
  return (
      <Link className={className} href={href} style={{ gap: "0.65rem" }}>
        {common}
      </Link>
  );
}

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div>
              <div className="footer-brand">Sokáig élek</div>
              <p className="footer-muted">
                Célzott tanácsok és válogatott ajánlások a hosszú,
                egészséges életért.
              </p>
            </div>

            <div>
              <h4>Hasznos</h4>
              <div className="stack" style={{ gap: "0.75rem" }}>
                <IconLink href="/adatvedelem" icon="shield">
                  Adatvédelem
                </IconLink>
                <IconLink href="/aszf" icon="file">
                  ÁSZF
                </IconLink>
              </div>
            </div>

            <div>
              <h4>Kapcsolat</h4>
              <div className="stack" style={{ gap: "0.75rem" }}>
                <a
                    className="footer-link row"
                    href="mailto:csakazertis@sokaigelek.hu"
                    style={{ gap: "0.65rem" }}
                >
                <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid var(--border)",
                      background: "var(--card)",
                      boxShadow: "var(--shadow-sm)",
                    }}
                >
                  <Icon name="mail" />
                </span>
                  <span style={{ fontWeight: 600 }}>csakazertis@sokaigelek.hu</span>
                </a>

                <IconLink
                    href="https://wa.me/64275665850"
                    icon="whatsapp"
                    external
                >
                  WhatsApp üzenet
                </IconLink>

                <IconLink
                    href="https://m.me/sokaigelek"
                    icon="facebook"
                    external
                >
                  Messenger üzenet
                </IconLink>

                <IconLink
                    href="https://www.facebook.com/sokaigelek"
                    icon="facebook"
                    external
                >
                  Facebook oldal
                </IconLink>
              </div>
            </div>
          </div>

          <div
              className="spread"
              style={{
                marginTop: "2rem",
                paddingTop: "1.25rem",
                borderTop: "1px solid var(--border)",
                flexWrap: "wrap",
                rowGap: "0.5rem",
              }}
          >
            <div className="footer-muted">© {year} Sokáig élek</div>
            <div className="footer-muted">
              Az oldalon található információk tájékoztató jellegűek.
            </div>
          </div>
        </div>
      </footer>
  );
}
