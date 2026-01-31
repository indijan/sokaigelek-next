"use client";

import "./ChatWidget.css";
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
  visibleContent?: string;
  isTyping?: boolean;
};

type ChatOpenDetail = {
  seedMessage?: string;
  source?: string;
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
  const [closing, setClosing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const typingRef = useRef<{ id: string | null; timer: number | null }>({ id: null, timer: null });
  const recognitionRef = useRef<any>(null);
  const recognitionActiveRef = useRef(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const canSend = input.trim().length > 0 && !loading;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = window.localStorage.getItem("sg_chat_state");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.conversationId) setConversationId(String(parsed.conversationId));
      if (Array.isArray(parsed?.messages)) {
        setMessages(parsed.messages as ChatMessage[]);
      }
    } catch {
      // Ignore corrupted storage
    }
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    try {
      const storedMessages = messages
        .filter((m) => !m.isTyping)
        .map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          sources: m.sources,
        }));
      window.localStorage.setItem(
        "sg_chat_state",
        JSON.stringify({
          conversationId,
          messages: storedMessages,
        })
      );
    } catch {
      // Ignore storage issues
    }
  }, [mounted, messages, conversationId]);

  useEffect(() => {
    const handler = (evt?: Event) => {
      const detail = (evt as CustomEvent<ChatOpenDetail> | undefined)?.detail;
      setClosing(false);
      setOpen(true);
      const seed = String(detail?.seedMessage || "").trim();
      if (seed) {
        setMessages((prev) => {
          if (prev.length > 0) return prev;
          if (prev.some((m) => m.id === "sg_seed")) return prev;
          return [
            ...prev,
            {
              id: "sg_seed",
              role: "assistant",
              content: seed,
            },
          ];
        });
      }
    };
    window.addEventListener("sg:chat:open", handler);
    return () => window.removeEventListener("sg:chat:open", handler);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  useEffect(() => {
    const typingMsg = messages.find((m) => m.isTyping);
    if (!typingMsg) {
      if (typingRef.current.timer) {
        window.clearInterval(typingRef.current.timer);
        typingRef.current = { id: null, timer: null };
      }
      return;
    }

    if (typingRef.current.id === typingMsg.id && typingRef.current.timer) return;
    if (typingRef.current.timer) {
      window.clearInterval(typingRef.current.timer);
    }

    const full = typingMsg.content;
    typingRef.current.id = typingMsg.id;
    typingRef.current.timer = window.setInterval(() => {
      let done = false;
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== typingMsg.id) return msg;
          const visible = msg.visibleContent ?? "";
          const nextLen = Math.min(visible.length + 2, full.length);
          const next = full.slice(0, nextLen);
          if (nextLen >= full.length) done = true;
          return {
            ...msg,
            visibleContent: next,
            isTyping: !done,
          };
        })
      );
      if (done && typingRef.current.timer) {
        window.clearInterval(typingRef.current.timer);
        typingRef.current = { id: null, timer: null };
      }
    }, 18);
  }, [messages]);

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
        visibleContent: "",
        isTyping: true,
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

  const closeChat = () => {
    if (closing) return;
    setClosing(true);
    window.dispatchEvent(new CustomEvent("sg:chat:close"));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = window.navigator.userAgent || "";
    const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua);
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition || isSafari) {
      setHasSpeechSupport(false);
      return;
    }
    setHasSpeechSupport(true);
    const rec = new SpeechRecognition();
    rec.lang = "hu-HU";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (evt: any) => {
      const text = evt?.results?.[0]?.[0]?.transcript || "";
      if (text) setInput((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.onend = () => {
      recognitionActiveRef.current = false;
      setListening(false);
    };
    rec.onerror = () => {
      recognitionActiveRef.current = false;
      setListening(false);
    };
    recognitionRef.current = rec;
    synthRef.current = window.speechSynthesis;
  }, []);

  const toggleDictation = () => {
    const rec = recognitionRef.current;
    if (!rec) return;
    if (listening) {
      if (recognitionActiveRef.current) {
        rec.stop();
      }
      setListening(false);
      return;
    }
    if (recognitionActiveRef.current) return;
    try {
      recognitionActiveRef.current = true;
      setListening(true);
      rec.start();
    } catch {
      recognitionActiveRef.current = false;
      setListening(false);
    }
  };

  const speak = (text: string, id: string) => {
    if (typeof window === "undefined") return;
    const synth = synthRef.current || window.speechSynthesis;
    if (!synth) return;
    if (speakingId === id) {
      synth.cancel();
      setSpeakingId(null);
      return;
    }
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "hu-HU";
    utter.onend = () => setSpeakingId((current) => (current === id ? null : current));
    utter.onerror = () => setSpeakingId((current) => (current === id ? null : current));
    setSpeakingId(id);
    synth.speak(utter);
  };

  const ui = useMemo(() => {
    // NOTE: we intentionally render into document.body (portal)
    // so that parent layout CSS (e.g. transform/overflow) can’t push it off-screen.

    if (!open && !closing) {
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
          onClick={closeChat}
          className="sg-chat-backdrop"
        />

        <div
          className={`sg-chat-panel ${closing ? "is-closing" : "is-open"}`}
          onAnimationEnd={() => {
            if (closing) {
              setOpen(false);
              setClosing(false);
            }
          }}
        >
          <div className="sg-chat-hero">
            <div className="sg-chat-hero-icon" aria-hidden>
              <img src="/chat-logo.png" alt="" />
            </div>
            <div className="sg-chat-hero-bubble">Mitől éreznéd magad jobban?</div>
            <button
              type="button"
              className="sg-chat-close"
              onClick={closeChat}
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
                  {m.isTyping ? m.visibleContent : m.content}
                  {m.role === "assistant" && !m.isTyping && m.sources && m.sources.length > 0 ? (
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
                {m.role === "assistant" && !m.isTyping ? (
                  <button
                    type="button"
                    className="sg-chat-tts"
                    onClick={() => speak(m.content, m.id)}
                    aria-label="Válasz felolvasása"
                    title="Felolvasás"
                  >
                    {speakingId === m.id ? "⏹️" : "🔊"}
                  </button>
                ) : null}
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
            <button
              type="button"
              className={`sg-chat-mic ${listening ? "is-active" : ""}`}
              onClick={toggleDictation}
              aria-label="Diktálás"
              title={hasSpeechSupport ? "Diktálás" : "A diktálás Safari alatt nem érhető el. Chrome/Edge-ben működik."}
              disabled={!hasSpeechSupport}
            >
              🎙️
            </button>
            <button
              type="submit"
              disabled={!canSend}
              className={`sg-chat-send ${canSend ? "is-active" : ""}`}
            >
              ELKÜLD
            </button>
          </form>
          <div className="sg-chat-mic-hint" aria-live="polite">
            {!hasSpeechSupport
              ? "A diktálás Safari alatt nem érhető el. Chrome/Edge-ben működik."
              : listening
                ? "Hallgatlak — mondd el a kérdésed."
                : "Kattints a mikrofonra, ha diktálnál."}
          </div>

          <div className="sg-chat-footer">
            <button type="button" className="sg-chat-reset" onClick={resetChat} aria-label="Új beszélgetés">
              ↻
            </button>
          </div>
        </div>
      </div>
    );
  }, [open, messages, loading, input, error, conversationId, closing, listening, speakingId, hasSpeechSupport]);

  if (!mounted) return null;
  return createPortal(ui, document.body);
}
