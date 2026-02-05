import "./globals.css";
import type { Metadata } from "next";
import type React from "react";

import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ChatWidgetClient from "@/components/ChatWidgetClient";
import CookieNoticeClient from "@/components/CookieNoticeClient";
import GtmConsentLoader from "@/components/GtmConsentLoader";

export const metadata: Metadata = {
  title: "Sokáig élek",
  description: "Egészség, tudatosság, természetes megoldások – Sokáig élek.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.sokaigelek.hu"),
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
        <GtmConsentLoader gtmId={process.env.NEXT_PUBLIC_GTM_ID} />
        <SiteHeader />

        <main className="min-h-screen container mx-auto px-4 py-6">{children}</main>

        <SiteFooter />
        <CookieNoticeClient />

        {/* Globális chat widget – pontosan egyszer */}
        <ChatWidgetClient />
      </body>
    </html>
  );
}
