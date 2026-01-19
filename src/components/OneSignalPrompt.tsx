"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const oneSignalRef = useRef<any>(null);
  const [open, setOpen] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");

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
      await OneSignal.init({
        appId,
        safari_web_id: safariWebId || undefined,
        notifyButton: { enable: false },
        allowLocalhostAsSecureOrigin: true,
      });
      oneSignalRef.current = OneSignal;

      try {
        if (OneSignal?.User?.setLanguage) {
          await OneSignal.User.setLanguage("hu");
        }
        const perm = OneSignal?.Notifications?.permission;
        if (perm === "denied") {
          setDenied(true);
        }
      } catch {}
    });
  }, [ready, canRun, appId, safariWebId]);

  useEffect(() => {
    if (!ready || !canRun || denied) return;
    if (open) return;
    const lastTs = getLastPromptTs();
    if (lastTs && Date.now() - lastTs < COOLDOWN_MS) return;

    const timer = window.setTimeout(() => {
      setLastPromptTs(Date.now());
      setOpen(true);
    }, 20000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [ready, canRun, denied, open]);

  if (!canRun || denied) return null;

  const close = () => {
    setLastPromptTs(Date.now());
    setOpen(false);
  };

  const subscribe = () => {
    if (!ready) {
      setError("A feliratkozás betöltése folyamatban van, próbáld újra.");
      return;
    }
    if (!oneSignalRef.current) {
      setError("A feliratkozás előkészítése még tart, próbáld újra pár másodperc múlva.");
      return;
    }
    setError("");
    try {
      if (oneSignalRef.current?.Slidedown?.promptPush) {
        void oneSignalRef.current.Slidedown.promptPush();
      } else if (oneSignalRef.current?.Notifications?.requestPermission) {
        void oneSignalRef.current.Notifications.requestPermission();
      }
    } catch {}
    close();
  };

  if (!open) return null;

  return (
    <div className="onesignal-prompt">
      <div className="onesignal-card">
        <div className="onesignal-title">Értesülni szeretnél hasonló tartalmak megjelenéséről az oldalon?</div>
        <div className="onesignal-sub">Akkor kérlek iratkozz fel.</div>
        {error ? <div className="onesignal-error">{error}</div> : null}
        <div className="onesignal-actions">
          <button type="button" className="onesignal-btn primary" onClick={subscribe}>
            Feliratkozom
          </button>
          <button type="button" className="onesignal-btn ghost" onClick={close}>
            Most nem
          </button>
        </div>
      </div>
    </div>
  );
}
