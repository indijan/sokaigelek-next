"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

const PROMPT_KEY = "sg_onesignal_prompt_ts";
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

function shouldSkipPath(pathname: string) {
  return pathname === "/termek" || pathname.startsWith("/termek/");
}

function isLocalhost() {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

function getLastPromptTs() {
  const raw = window.localStorage.getItem(PROMPT_KEY);
  const n = Number(raw || "");
  return Number.isFinite(n) ? n : 0;
}

function setLastPromptTs(ts: number) {
  window.localStorage.setItem(PROMPT_KEY, String(ts));
}

export default function OneSignalPrompt() {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);

  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || "";
  const safariWebId = process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID || "";

  const canRun = useMemo(() => {
    if (!appId) return false;
    if (!pathname) return false;
    if (shouldSkipPath(pathname)) return false;
    if (isLocalhost()) return false;
    return true;
  }, [appId, pathname]);

  useEffect(() => {
    if (!canRun) return;
    if (typeof window === "undefined") return;

    const lastTs = getLastPromptTs();
    if (lastTs && Date.now() - lastTs < COOLDOWN_MS) return;

    if (!document.getElementById("onesignal-sdk")) {
      const script = document.createElement("script");
      script.id = "onesignal-sdk";
      script.src = "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
      script.defer = true;
      script.onload = () => setReady(true);
      document.head.appendChild(script);
    } else {
      setReady(true);
    }
  }, [canRun]);

  useEffect(() => {
    if (!ready || !canRun) return;
    const w = window as any;
    w.OneSignalDeferred = w.OneSignalDeferred || [];
    w.OneSignalDeferred.push(async (OneSignal: any) => {
      try {
        const perm = OneSignal?.Notifications?.permission;
        if (perm === "denied") {
          setDenied(true);
        }
      } catch {}
    });
  }, [ready, canRun, appId, safariWebId]);

  useEffect(() => {
    if (!ready || !canRun || denied) return;
    const lastTs = getLastPromptTs();
    if (lastTs && Date.now() - lastTs < COOLDOWN_MS) return;

    const promptOnce = (retriesLeft: number) => {
      const w = window as any;
      const OneSignal = w.OneSignal || null;
      if (!OneSignal && retriesLeft > 0) {
        window.setTimeout(() => promptOnce(retriesLeft - 1), 500);
        return;
      }
      w.OneSignalDeferred = w.OneSignalDeferred || [];
      w.OneSignalDeferred.push(async (os: any) => {
        try {
          if (os?.Slidedown?.promptPush) {
            await os.Slidedown.promptPush();
          } else if (os?.Notifications?.requestPermission) {
            await os.Notifications.requestPermission();
          }
        } catch {}
        setLastPromptTs(Date.now());
      });
    };

    const timer = window.setTimeout(() => {
      promptOnce(20);
    }, 20000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [ready, canRun, denied]);

  return null;
}
