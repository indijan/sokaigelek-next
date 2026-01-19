import "./globals.css";
import type { Metadata } from "next";
import type React from "react";
import Script from "next/script";

import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ChatWidgetClient from "@/components/ChatWidgetClient";
import CookieNotice from "@/components/CookieNotice";
import GtmConsentLoader from "@/components/GtmConsentLoader";
import OneSignalPrompt from "@/components/OneSignalPrompt";

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
        <Script
          src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
          strategy="afterInteractive"
        />
        <Script id="onesignal-init" strategy="afterInteractive">
          {`
            window.OneSignalDeferred = window.OneSignalDeferred || [];
            window.OneSignalDeferred.push(async function(OneSignal) {
              await OneSignal.init({
                appId: "${process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || ""}",
                safari_web_id: "${process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || ""}",
                notifyButton: { enable: false },
                allowLocalhostAsSecureOrigin: true,
              });
              try {
                if (OneSignal?.User?.setLanguage) {
                  await OneSignal.User.setLanguage("hu");
                }
              } catch {}
            });
          `}
        </Script>
        <GtmConsentLoader gtmId={process.env.NEXT_PUBLIC_GTM_ID} />
        <SiteHeader />

        <main className="min-h-screen container mx-auto px-4 py-6">{children}</main>

        <SiteFooter />
        <CookieNotice />
        <OneSignalPrompt />

        {/* Globális chat widget – pontosan egyszer */}
        <ChatWidgetClient />
      </body>
    </html>
  );
}
