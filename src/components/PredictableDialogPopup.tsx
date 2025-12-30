"use client";

import { useEffect, useRef, useState } from "react";

type AgentPopup = {
  open?: () => void;
};

let agentPromise: Promise<any> | null = null;

function loadAgent() {
  if (!agentPromise) {
    agentPromise = import(
      /* webpackIgnore: true */
      "https://cdn.jsdelivr.net/npm/@agent-embed/js@latest/dist/web.js"
    ).then((m) => (m as any).default || m);
  }
  return agentPromise;
}

function getOrCreateUserId() {
  try {
    const key = "sg_chat_user_id";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const next = `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    window.localStorage.setItem(key, next);
    return next;
  } catch {
    return `user_${Date.now()}`;
  }
}

export default function PredictableDialogPopup() {
  const popupRef = useRef<AgentPopup | null>(null);
  const openingRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const pollRef = useRef<number | null>(null);
  const hasSeenPopupRef = useRef(false);
  const startDelayRef = useRef<number | null>(null);
  const hintTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const openPopup = async () => {
      if (openingRef.current) return;
      openingRef.current = true;

      const Agent = await loadAgent();
      if (!popupRef.current) {
        popupRef.current = Agent.initPopup({
          agentName: "Chatbot-50e88",
          autoShowDelay: 0,
          user: {
            user_id: getOrCreateUserId(),
            user_name: "",
            user_email: "",
            user_segments: [],
          },
          filterResponse: function (response: string) {
            const citationRegex = /【\d+:\d+†[^【】]+】/g;
            return response.replace(citationRegex, "");
          },
        });
      }

      popupRef.current?.open?.();
      setIsOpen(true);
      setShowHint(true);
      if (hintTimeoutRef.current) window.clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = window.setTimeout(() => {
        setShowHint(false);
      }, 6000);
      openingRef.current = false;
    };

    const handler = () => {
      void openPopup();
    };

    const findPopupElement = () => {
      return document.querySelector(
        "[data-agent-embed], [id*='agent-embed'], [id*='predictable'], .agent-embed, [class*='agent'], [class*='predictable'], iframe[src*='agent'], iframe[src*='predictable']"
      ) as HTMLElement | null;
    };

    const isPopupVisible = (el: HTMLElement | null) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const startPoll = () => {
      if (pollRef.current) return;
      pollRef.current = window.setInterval(() => {
        const el = findPopupElement();
        const visible = isPopupVisible(el);
        if (visible) hasSeenPopupRef.current = true;
        if (hasSeenPopupRef.current && !visible) {
          setIsOpen(false);
          if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }, 500);
    };

    const onDocClick = () => {
      if (!isOpen) return;
      window.setTimeout(() => {
        const el = findPopupElement();
        const visible = isPopupVisible(el);
        if (!visible) {
          setIsOpen(false);
        }
      }, 200);
    };

    window.addEventListener("sg:chat:open", handler);
    document.addEventListener("click", onDocClick, true);
    (window as any).__sg_openChat = handler;
    if (isOpen) {
      hasSeenPopupRef.current = false;
      startDelayRef.current = window.setTimeout(() => {
        startPoll();
      }, 800);
    } else {
      setShowHint(false);
    }

    return () => {
      window.removeEventListener("sg:chat:open", handler);
      document.removeEventListener("click", onDocClick, true);
      if ((window as any).__sg_openChat === handler) {
        delete (window as any).__sg_openChat;
      }
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (startDelayRef.current) {
        window.clearTimeout(startDelayRef.current);
        startDelayRef.current = null;
      }
      if (hintTimeoutRef.current) {
        window.clearTimeout(hintTimeoutRef.current);
        hintTimeoutRef.current = null;
      }
    };
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="chat-heart"
        onClick={() => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("sg:chat:open"));
          }
        }}
        aria-label="Chat megnyitása"
      >
        ❤
      </button>

      {isOpen && showHint ? (
        <div
          className="chat-close-hint"
          onAnimationEnd={() => {
            setShowHint(false);
          }}
        >
          Kattints bárhová a bezáráshoz
        </div>
      ) : null}
    </>
  );
}
