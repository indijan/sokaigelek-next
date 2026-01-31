import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type ChatReq = {
    message: string;
    conversationId?: string;
    pageUrl?: string;
    pageType?: string;
    pageSlug?: string;
    visitorHash?: string;
    consent?: boolean;
};

type SearchResult = {
    id: string | number;
    type: "post" | "product";
    title: string;
    url: string | null;
    snippet: string;
};

type ChatHistoryItem = {
    role: "user" | "assistant";
    content: string | null;
};

function formatHistory(items: ChatHistoryItem[]): string {
    const lines = items
        .map((m) => {
            const role = m.role === "user" ? "Felhasználó" : "Asszisztens";
            const text = String(m.content || "").trim();
            if (!text) return "";
            return `${role}: ${text}`;
        })
        .filter(Boolean);
    return lines.join("\n");
}

function looksLikeFollowUp(message: string): boolean {
    const trimmed = message.trim().toLowerCase();
    if (trimmed.length <= 50) return true;
    return (
        trimmed.startsWith("és ") ||
        trimmed.startsWith("es ") ||
        trimmed.startsWith("mi a véleményed") ||
        trimmed.startsWith("mit gondolsz") ||
        trimmed.startsWith("és a") ||
        trimmed.startsWith("és az") ||
        trimmed.startsWith("mi van") ||
        trimmed.includes("erről") ||
        trimmed.includes("arról") ||
        trimmed.includes("ezekről")
    );
}

async function fetchSearchResults(query: string, reqUrl: string, limit = 5): Promise<SearchResult[]> {
    const url = new URL("/api/ai-search", reqUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
    });

    if (!res.ok) return [];
    const json = await res.json();
    if (!json?.results || !Array.isArray(json.results)) return [];
    return json.results as SearchResult[];
}

export async function POST(req: Request) {
    const start = Date.now();
    const body = (await req.json()) as ChatReq;

    if (!body.message?.trim()) {
        return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    // 1) conversation
    let conversationId = body.conversationId;

    if (!conversationId) {
        const { data, error } = await supabaseServer
            .from("conversations")
            .insert({
                page_url: body.pageUrl ?? null,
                page_type: body.pageType ?? null,
                page_slug: body.pageSlug ?? null,
                visitor_hash: body.visitorHash ?? null,
                consent: !!body.consent,
            })
            .select("id")
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        conversationId = data.id;
    }

    // 2) log user msg
    {
        const { error } = await supabaseServer.from("messages").insert({
            conversation_id: conversationId,
            role: "user",
            content: body.message,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let historyText = "";
    let lastUserMessage = "";
    if (conversationId) {
        const { data: historyRows } = await supabaseServer
            .from("messages")
            .select("role, content, created_at")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(8);

        if (Array.isArray(historyRows) && historyRows.length > 0) {
            const chronological = [...historyRows].reverse();
            const cleaned = chronological.filter((m) => (m.role === "user" || m.role === "assistant"));
            if (cleaned.length > 0) {
                const last = cleaned[cleaned.length - 1];
                if (last?.role === "user" && String(last?.content || "").trim() === body.message.trim()) {
                    cleaned.pop();
                }
            }
            const lastUser = [...cleaned].reverse().find((m) => m.role === "user");
            lastUserMessage = String(lastUser?.content || "").trim();
            historyText = formatHistory(cleaned.slice(-6));
        }
    }

    const searchQuery =
        lastUserMessage && looksLikeFollowUp(body.message)
            ? `${lastUserMessage}\n${body.message}`
            : body.message;

    const sources = await fetchSearchResults(searchQuery, req.url, 5);
    const sourcesText = sources
        .map((s, i) => {
            const url = s.url ? ` (${s.url})` : "";
            return `${i + 1}. ${s.title}${url}\n${s.snippet}`;
        })
        .join("\n\n");

    // 3) call OpenAI (egyszerű, első kör)
    const sys =
        "Te a sokaigelek.hu kedves, segítőkész asszisztense vagy. Magyarul, tegeződve válaszolsz. " +
        "Adj rövid, hasznos, gyakorlati tanácsot (2-4 mondat), barátságos hangnemben. " +
        "Ha a kérdés rövid vagy utaló, vizsgáld meg az előzményeket, és válaszolj ugyanabban a témában, ha van kapcsolat. " +
        "Mindig legyen a válasz végén egy finom, természetes termékajánlás, legfeljebb 1 rövid mondatban: lehetőleg 1 konkrét termék a forrásokból, " +
        "vagy ha nincs releváns termék a forrásokban, akkor egy általános, nem tolakodó javaslat a termékek böngészésére/keresésére az oldalon. " +
        "Kizárólag a megadott forrásokra támaszkodj, és ne találj ki információt vagy terméket. " +
        "Ha nincs releváns találat, kérj pontosítást egy barátságos kérdéssel. " +
        "Ha orvosi kérdés, javasolj szakembert.";

    const historyBlock = historyText ? `Előzmények:\n${historyText}\n\n` : "";
    const userContent = sources.length
        ? `${historyBlock}Kérdés: ${body.message}\n\nForrások:\n${sourcesText}`
        : `${historyBlock}Kérdés: ${body.message}\n\nForrások: nincs releváns találat. Kérj pontosítást röviden.`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "gpt-4.1-mini",
            messages: [
                { role: "system", content: sys },
                { role: "user", content: userContent },
            ],
            temperature: 0.4,
        }),
    });

    if (!openaiRes.ok) {
        const text = await openaiRes.text();
        return NextResponse.json({ error: text }, { status: 500 });
    }

    const json = await openaiRes.json();
    const answer = json.choices?.[0]?.message?.content?.trim() ?? "Sajnálom, most nem sikerült válaszolnom.";

    const answerLower = answer.toLowerCase();
    const citedSources = sources
        .filter((s) => answerLower.includes(String(s.title || "").toLowerCase()))
        .slice(0, 3);

    // 4) log assistant msg
    {
        const { error } = await supabaseServer.from("messages").insert({
            conversation_id: conversationId,
            role: "assistant",
            content: answer,
            model: "gpt-4.1-mini",
            latency_ms: Date.now() - start,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        conversationId,
        answer,
        sources: citedSources,
    });
}
