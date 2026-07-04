import "./globals.css";
import type { Metadata } from "next";
import type React from "react";

import RootShell from "@/components/RootShell";
import { getSiteUrl } from "@/lib/siteUrl";

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
  return (
    <html lang="hu">
      <head />
      <body className="bg-white text-gray-900 antialiased">
        <RootShell gtmId={process.env.NEXT_PUBLIC_GTM_ID}>
          {children}
        </RootShell>
      </body>
    </html>
  );
}
