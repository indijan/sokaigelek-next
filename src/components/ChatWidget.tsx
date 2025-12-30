"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type SearchResult = {
  id: string | number;
  type: "post" | "product";
  title: string;
  url: string | null;
  snippet: string;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SearchResult[];
};

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

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("sg:chat:open", handler);
    return () => window.removeEventListener("sg:chat:open", handler);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  const submit = async (evt?: React.FormEvent) => {
    evt?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    setInput("");
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content: text,
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversationId,
          pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
          visitorHash: typeof window !== "undefined" ? getOrCreateUserId() : undefined,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "Chat request failed.");
      }

      const json = await res.json();
      setConversationId(json.conversationId ?? conversationId ?? null);
      const assistantMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: json.answer || "Sajnálom, most nem sikerült válaszolnom.",
        sources: Array.isArray(json.sources) ? json.sources : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setError(err?.message || "Hiba történt a chat indításakor.");
    } finally {
      setLoading(false);
    }
  };

  const resetChat = () => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    setInput("");
  };

  const ui = useMemo(() => {
    // NOTE: we intentionally render into document.body (portal)
    // so that parent layout CSS (e.g. transform/overflow) can’t push it off-screen.

    if (!open) {
      return (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Chat megnyitása"
          className="chat-heart"
        >
          ❤
        </button>
      );
    }

    return (
      <div className="sg-chat-overlay">
        <button
          type="button"
          aria-label="Chat bezárása"
          onClick={() => setOpen(false)}
          className="sg-chat-backdrop"
        />

        <div className="sg-chat-panel">
          <div className="sg-chat-hero">
            <div className="sg-chat-hero-icon" aria-hidden>
              <img src="/chat-logo.png" alt="" />
            </div>
            <div className="sg-chat-hero-bubble">Mitől éreznéd magad jobban?</div>
            <button
              type="button"
              className="sg-chat-close"
              onClick={() => setOpen(false)}
              aria-label="Chat bezárása"
            >
              ×
            </button>
          </div>

          <div className="sg-chat-body" ref={scrollRef}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`sg-chat-message ${m.role === "user" ? "is-user" : "is-assistant"}`}
              >
                <div className="sg-chat-bubble">
                  {m.content}
                  {m.role === "assistant" && m.sources && m.sources.length > 0 ? (
                    <div className="sg-chat-sources">
                      <div className="sg-chat-sources-title">Források</div>
                      {m.sources.map((s) => (
                        <div key={`${m.id}_${s.id}`} className="sg-chat-source">
                          {s.url ? (
                            <a href={s.url} target="_blank" rel="noreferrer">
                              {s.title}
                            </a>
                          ) : (
                            <span>{s.title}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="sg-chat-status">
                <span className="sg-chat-typing" aria-label="Gondolkodom">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            ) : null}
            {error ? <div className="sg-chat-error">{error}</div> : null}
          </div>

          <form onSubmit={submit} className="sg-chat-inputbar">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ide írd a kérdésed..."
              className="sg-chat-input"
            />
            <button type="submit" disabled={loading} className="sg-chat-send">
              ELKÜLD
            </button>
          </form>

          <div className="sg-chat-footer">
            <button type="button" className="sg-chat-reset" onClick={resetChat} aria-label="Új beszélgetés">
              ↻
            </button>
          </div>
        </div>
      </div>
    );
  }, [open, messages, loading, input, error, conversationId]);

  if (!mounted) return null;
  return createPortal(ui, document.body);
}
