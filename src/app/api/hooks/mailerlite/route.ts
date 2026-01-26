import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function extractEmail(payload: any): string | null {
  const email =
    payload?.data?.email ||
    payload?.data?.subscriber?.email ||
    payload?.subscriber?.email ||
    payload?.email ||
    null;
  if (!email) return null;
  return String(email).trim().toLowerCase();
}

export async function POST(req: Request) {
  const secret = req.headers.get("x-webhook-secret") || "";
  const expected = process.env.MAILERLITE_WEBHOOK_SECRET || "";
  if (expected && secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const event = String(payload?.event || payload?.type || "").toLowerCase();
  const email = extractEmail(payload);
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  if (event.includes("unsubscribe")) {
    await supabaseServer
      .from("subscriptions")
      .update({ status: "unsubscribed", updated_at: new Date().toISOString() })
      .eq("email", email);
  }

  return NextResponse.json({ ok: true });
}
