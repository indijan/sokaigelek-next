"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ChatWidget = dynamic(() => import("./ChatWidget"), { ssr: false, loading: () => null });

export default function ChatWidgetClient() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const show = () => {
      if (!cancelled) setReady(true);
    };

    if (typeof (window as any).requestIdleCallback === "function") {
      (window as any).requestIdleCallback(show, { timeout: 2000 });
    } else {
      setTimeout(show, 1200);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;

  return <ChatWidget />;
}
