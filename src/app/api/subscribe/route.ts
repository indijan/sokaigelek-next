import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  const payload = await req.json().catch(() => null);
  const email = String(payload?.email || "").trim().toLowerCase();
  const firstName = String(payload?.first_name || "").trim();
  const categorySlug = String(payload?.category_slug || "").trim();
  const source = String(payload?.source || "article-exit").trim();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (!categorySlug) {
    return NextResponse.json({ error: "missing_category" }, { status: 400 });
  }

  const upsertData: Record<string, string> = {
    email,
    category_slug: categorySlug,
    status: "active",
    source,
  };
  if (firstName) {
    upsertData.first_name = firstName;
  }

  const { error } = await supabaseServer.from("subscriptions").upsert(upsertData, {
    onConflict: "email,category_slug",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
