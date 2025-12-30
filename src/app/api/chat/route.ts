import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type ChatReq = {
    message: string;
    conversationId?: string;
    pageUrl?: string;
    pageType?: string;
    pageSlug?: string;
    visitorHash?: string;
    consent?: boolean;
};

export async function POST(req: Request) {
    const start = Date.now();
    const body = (await req.json()) as ChatReq;

    if (!body.message?.trim()) {
        return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    // 1) conversation
    let conversationId = body.conversationId;

    if (!conversationId) {
        const { data, error } = await supabase
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
        const { error } = await supabase.from("messages").insert({
            conversation_id: conversationId,
            role: "user",
            content: body.message,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 3) call OpenAI (egyszerű, első kör)
    const sys =
        "Te a sokaigelek.hu segítő asszisztense vagy. Röviden, barátságosan, edukatívan válaszolsz. " +
        "Fontos: a vásárlás a partner oldalon történik (affiliate). Ha orvosi kérdés, javasolj szakembert.";

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
                { role: "user", content: body.message },
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

    // 4) log assistant msg
    {
        const { error } = await supabase.from("messages").insert({
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
    });
}