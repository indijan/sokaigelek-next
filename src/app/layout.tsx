import "./globals.css";
import type { Metadata } from "next";
import type React from "react";

import RootShell from "@/components/RootShell";
import { getSiteUrl } from "@/lib/siteUrl";
import { absoluteUrl, jsonLd } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Sokáig élek",
  description: "Egészség, tudatosság, természetes megoldások – Sokáig élek.",
  metadataBase: new URL(getSiteUrl()),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: "Sokáig élek",
    description: "Egészség, tudatosság, természetes megoldások – Sokáig élek.",
    siteName: "Sokáig élek",
    locale: "hu_HU",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sokáig élek",
    description: "Egészség, tudatosság, természetes megoldások – Sokáig élek.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const siteUrl = getSiteUrl();
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Sokáig élek",
    url: siteUrl,
    logo: absoluteUrl("/logo.png"),
  };
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Sokáig élek",
    url: siteUrl,
    inLanguage: "hu-HU",
    publisher: {
      "@type": "Organization",
      name: "Sokáig élek",
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/logo.png"),
      },
    },
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/kereses?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html lang="hu">
      <head />
      <body className="bg-white text-gray-900 antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd(websiteJsonLd) }}
        />
        <RootShell gtmId={process.env.NEXT_PUBLIC_GTM_ID}>
          {children}
        </RootShell>
      </body>
    </html>
  );
}
