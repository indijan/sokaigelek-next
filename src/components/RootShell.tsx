"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import ChatWidgetClient from "@/components/ChatWidgetClient";
import CookieNoticeClient from "@/components/CookieNoticeClient";
import GtmConsentLoader from "@/components/GtmConsentLoader";

export default function RootShell({
  children,
  gtmId,
}: {
  children: ReactNode;
  gtmId?: string;
}) {
  const pathname = usePathname() || "/";
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdmin) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <>
      <GtmConsentLoader gtmId={gtmId} />
      <SiteHeader />
      <main className="min-h-screen container mx-auto px-4 py-6">{children}</main>
      <SiteFooter />
      <CookieNoticeClient />
      <ChatWidgetClient />
    </>
  );
}
