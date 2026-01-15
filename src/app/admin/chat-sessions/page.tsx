import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";

type ConversationRow = {
  id: number | string;
  page_url: string | null;
  page_type: string | null;
  page_slug: string | null;
  visitor_hash: string | null;
  consent: boolean | null;
  created_at: string | null;
};

type MessageRow = {
  id: number | string;
  conversation_id: number | string;
  role: "user" | "assistant";
  content: string;
  created_at: string | null;
};

function formatTs(ts?: string | null) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("hu-HU");
  } catch {
    return ts;
  }
}

function snippet(text: string, max = 140) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max).replace(/\s+\S*$/, "").trim()}…`;
}

export default async function AdminChatSessionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) {
  const cookieStore = await cookies();
  const ok = cookieStore.get("admin_ok")?.value === "1";
  if (!ok) redirect("/admin");

  const params = (await searchParams) ?? {};
  const qParam = (params as any).q;
  const searchQ = Array.isArray(qParam) ? qParam[0] : qParam;
  const trimmedQ = String(searchQ || "").trim();
  const fromParam = (params as any).from;
  const toParam = (params as any).to;
  const fromValue = Array.isArray(fromParam) ? fromParam[0] : fromParam;
  const toValue = Array.isArray(toParam) ? toParam[0] : toParam;
  const fromDate = String(fromValue || "").trim();
  const toDate = String(toValue || "").trim();

  let query = supabaseServer
    .from("conversations")
    .select("id, page_url, page_type, page_slug, visitor_hash, consent, created_at")
    .order("id", { ascending: false })
    .limit(60);

  if (trimmedQ) {
    const like = `%${trimmedQ}%`;
    query = query.or(
      `page_url.ilike.${like},visitor_hash.ilike.${like},page_slug.ilike.${like},page_type.ilike.${like}`
    );
  }

  if (fromDate) {
    const fromIso = new Date(`${fromDate}T00:00:00Z`).toISOString();
    query = query.gte("created_at", fromIso);
  }

  if (toDate) {
    const toStart = new Date(`${toDate}T00:00:00Z`);
    const nextDay = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
    query = query.lt("created_at", nextDay.toISOString());
  }

  const { data: conversations, error } = await query;

  if (error) {
    return (
      <div style={{ color: "#b91c1c" }}>
        Hiba: {error.message}
      </div>
    );
  }

  const convoList = (conversations || []) as ConversationRow[];
  const convoIds = convoList.map((c) => c.id);

  let messages: MessageRow[] = [];
  if (convoIds.length > 0) {
    const { data: msgData, error: msgErr } = await supabaseServer
      .from("messages")
      .select("id, conversation_id, role, content, created_at")
      .in("conversation_id", convoIds)
      .order("created_at", { ascending: false });

    if (msgErr) {
      return (
        <div style={{ color: "#b91c1c" }}>
          Hiba: {msgErr.message}
        </div>
      );
    }

    messages = (msgData || []) as MessageRow[];
  }

  const summary = new Map<
    ConversationRow["id"],
    {
      count: number;
      lastMessage?: MessageRow;
    }
  >();
  const byConversation = new Map<ConversationRow["id"], MessageRow[]>();

  for (const m of messages) {
    const existing = summary.get(m.conversation_id);
    if (!existing) {
      summary.set(m.conversation_id, { count: 1, lastMessage: m });
    } else {
      existing.count += 1;
      if (!existing.lastMessage) {
        existing.lastMessage = m;
      }
    }

    const list = byConversation.get(m.conversation_id) || [];
    list.push(m);
    byConversation.set(m.conversation_id, list);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 20 }}>Chat sessionök</div>
        <div style={{ opacity: 0.7, fontSize: 13 }}>
          Legutóbbi beszélgetések a beépített chatből.
        </div>
      </div>

      <form
        action="/admin/chat-sessions"
        method="get"
        style={{ display: "flex", gap: 10, alignItems: "center" }}
      >
        <input
          name="q"
          defaultValue={trimmedQ}
          placeholder="Keresés: URL / visitor hash / slug / típus"
          style={{
            flex: 1,
            borderRadius: 12,
            border: "1px solid rgba(15,23,42,0.15)",
            padding: "10px 12px",
            fontSize: 13,
          }}
        />
        <input
          type="date"
          name="from"
          defaultValue={fromDate}
          style={{
            borderRadius: 12,
            border: "1px solid rgba(15,23,42,0.15)",
            padding: "10px 12px",
            fontSize: 13,
          }}
        />
        <input
          type="date"
          name="to"
          defaultValue={toDate}
          style={{
            borderRadius: 12,
            border: "1px solid rgba(15,23,42,0.15)",
            padding: "10px 12px",
            fontSize: 13,
          }}
        />
        <button
          type="submit"
          style={{
            borderRadius: 12,
            border: "1px solid rgba(15,23,42,0.15)",
            padding: "10px 12px",
            background: "#0f172a",
            color: "#ffffff",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Szűrés
        </button>
        {trimmedQ || fromDate || toDate ? (
          <Link
            href="/admin/chat-sessions"
            style={{
              fontSize: 12,
              textDecoration: "none",
              color: "#0f172a",
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(15,23,42,0.12)",
              background: "rgba(15,23,42,0.03)",
            }}
          >
            Törlés
          </Link>
        ) : null}
      </form>

      <div
        style={{
          display: "grid",
          gap: 12,
        }}
      >
        {convoList.length === 0 ? (
          <div style={{ color: "#64748b", fontSize: 13 }}>
            Nincs beszélgetés a feltételekkel.
          </div>
        ) : null}

        {convoList.map((c) => {
          const meta = summary.get(c.id);
          const last = meta?.lastMessage;
          const convoMessages = (byConversation.get(c.id) || []).slice().sort((a, b) => {
            const aTs = a.created_at ? Date.parse(a.created_at) : 0;
            const bTs = b.created_at ? Date.parse(b.created_at) : 0;
            return aTs - bTs;
          });
          return (
            <div
              key={String(c.id)}
              style={{
                borderRadius: 16,
                border: "1px solid rgba(15,23,42,0.08)",
                padding: 14,
                display: "grid",
                gap: 8,
                background: "rgba(15,23,42,0.02)",
              }}
            >
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>#{c.id}</span>
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  {formatTs(c.created_at)}
                </span>
                {c.page_type ? (
                  <span
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: "rgba(15,23,42,0.08)",
                    }}
                  >
                    {c.page_type}
                  </span>
                ) : null}
              </div>

              <div style={{ fontSize: 13, color: "#0f172a" }}>
                <div>
                  <strong>URL:</strong>{" "}
                  {c.page_url ? (
                    <a
                      href={c.page_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#0f172a", textDecoration: "underline" }}
                    >
                      {c.page_url}
                    </a>
                  ) : (
                    "—"
                  )}
                </div>
                <div>
                  <strong>Slug:</strong> {c.page_slug || "—"}
                </div>
                <div>
                  <strong>Visitor:</strong> {c.visitor_hash || "—"}
                </div>
                <div>
                  <strong>Üzenetek:</strong> {meta?.count || 0}
                </div>
              </div>

              {last ? (
                <div
                  style={{
                    borderTop: "1px solid rgba(15,23,42,0.08)",
                    paddingTop: 8,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    Utolsó üzenet ({last.role})
                  </div>
                  <div style={{ color: "#0f172a" }}>
                    {snippet(last.content)}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    {formatTs(last.created_at)}
                  </div>
                </div>
              ) : null}

              {convoMessages.length > 0 ? (
                <details
                  style={{
                    borderTop: "1px solid rgba(15,23,42,0.08)",
                    paddingTop: 8,
                    fontSize: 13,
                  }}
                >
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                    Teljes beszélgetés
                  </summary>
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {convoMessages.map((m) => (
                      <div key={String(m.id)} style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {m.role} · {formatTs(m.created_at)}
                        </div>
                        <div style={{ whiteSpace: "pre-wrap", color: "#0f172a" }}>
                          {m.content}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
