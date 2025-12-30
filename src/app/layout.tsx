import "./globals.css";
import type { Metadata } from "next";
import type React from "react";

import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ChatWidget from "@/components/ChatWidget";

export const metadata: Metadata = {
  title: "Sokáig élek",
  description: "Egészség, tudatosság, természetes megoldások – Sokáig élek.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="hu">
      <body className="bg-white text-gray-900 antialiased">
        <SiteHeader />

        <main className="min-h-screen container mx-auto px-4 py-6">{children}</main>

        <SiteFooter />

        {/* Globális chat widget – pontosan egyszer */}
        <ChatWidget />
      </body>
    </html>
  );
}
