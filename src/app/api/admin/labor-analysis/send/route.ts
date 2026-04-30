import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_ok")?.value !== "1") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const to = String(body?.to || "").trim();
    const subject = String(body?.subject || "").trim();
    const html = String(body?.html || "").trim();
    if (!to || !subject || !html) return NextResponse.json({ error: "Hiányzó e-mail adat." }, { status: 400 });

    const apiKey = process.env.BREVO_API_KEY || process.env.MAILERLITE_API_KEY || "";
    const senderEmail = process.env.BREVO_FROM_EMAIL || process.env.MAILERLITE_FROM_EMAIL || "";
    const senderName = process.env.BREVO_FROM_NAME || process.env.MAILERLITE_FROM_NAME || "Sokáig Élek";
    if (!apiKey || !senderEmail) return NextResponse.json({ error: "Hiányzik a Brevo e-mail beállítás." }, { status: 500 });

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({ error: `Brevo hiba: ${detail}` }, { status: 500 });
    }

    try {
      await supabaseServer.from("miniapp_events").insert({
        source: "admin_labor_analysis",
        event_name: "admin_labor_email_sent",
        mode: "admin",
        payload: {
          to,
          subject,
        },
      });
    } catch {
      // Stat logging must not block the send flow.
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("admin labor send failed", error);
    return NextResponse.json({ error: "Az e-mail küldése nem sikerült." }, { status: 500 });
  }
}
