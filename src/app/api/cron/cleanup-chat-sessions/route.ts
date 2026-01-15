import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") || "";
  const expected = process.env.CRON_SECRET || "";
  const cronHeader = req.headers.get("x-vercel-cron");
  const isVercelCron = cronHeader === "1" || cronHeader === "true";
  const ua = req.headers.get("user-agent") || "";
  const isVercelCronUa = ua.toLowerCase().includes("vercel-cron/");
  if (!(isVercelCron || isVercelCronUa) && (!expected || secret !== expected)) {
    console.warn("cron_unauthorized", {
      hasCronHeader: Boolean(cronHeader),
      cronHeader,
      hasCronUa: isVercelCronUa,
      hasExpected: Boolean(expected),
      hasSecret: Boolean(secret),
    });
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const retentionDays = Math.max(1, Number(process.env.CHAT_RETENTION_DAYS || "30"));
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const { data: oldConvos, error: convoErr } = await supabaseServer
    .from("conversations")
    .select("id")
    .lt("created_at", cutoff);

  if (convoErr) {
    return NextResponse.json({ error: convoErr.message }, { status: 500 });
  }

  const ids = (oldConvos || []).map((c) => c.id);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, deleted_conversations: 0, deleted_messages: 0, cutoff });
  }

  const { error: msgErr, count: msgCount } = await supabaseServer
    .from("messages")
    .delete({ count: "exact" })
    .in("conversation_id", ids);

  if (msgErr) {
    return NextResponse.json({ error: msgErr.message }, { status: 500 });
  }

  const { error: delErr, count: convoCount } = await supabaseServer
    .from("conversations")
    .delete({ count: "exact" })
    .in("id", ids);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deleted_conversations: convoCount || 0,
    deleted_messages: msgCount || 0,
    cutoff,
  });
}
