import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const source = String(body?.source || "").trim();
    const eventName = String(body?.eventName || "").trim();
    const mode = String(body?.mode || "").trim() || null;
    const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};

    if (!source || !eventName) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    await supabaseServer.from("miniapp_events").insert({
      source,
      event_name: eventName,
      mode,
      payload,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("miniapp event log failed", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
