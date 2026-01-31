"use client";

import { useEffect } from "react";

type Props = {
  title?: string | null;
  excerpt?: string | null;
};

export default function ArticleChatTrigger({ title, excerpt }: Props) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = "sg_chat_auto_prompted";
    if (window.sessionStorage.getItem(key) === "1") return;

    const timer = window.setTimeout(() => {
      if (window.sessionStorage.getItem(key) === "1") return;
      window.sessionStorage.setItem(key, "1");
      const topic = String(title || "").trim();
      const teaser = String(excerpt || "").replace(/\s+/g, " ").trim();
      const firstSentence =
        teaser
          .split(/[.!?]/)
          .map((s) => s.trim())
          .find((s) => s.length > 24) || "";
      const baseSentence = firstSentence || teaser;
      const trimmedSentence =
        baseSentence.length > 160 ? `${baseSentence.slice(0, 157)}...` : baseSentence;
      const seedMessage = trimmedSentence
        ? `${trimmedSentence} Van ezzel kapcsolatban kérdésed?`
        : topic
          ? `Miben segíthetek a(z) "${topic}" témában?`
          : "Miben segíthetek a cikk témájában?";
      window.dispatchEvent(new CustomEvent("sg:chat:open", { detail: { seedMessage, source: "article_timer" } }));
    }, 60_000);

    return () => window.clearTimeout(timer);
  }, [title, excerpt]);

  return null;
}
