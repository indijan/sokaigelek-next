import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getOrCreateGroupId, upsertSubscriber } from "@/lib/mailerlite";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") || "";
  const expected = process.env.CRON_SECRET || "";
  const cronHeader = req.headers.get("x-vercel-cron");
  const isVercelCron = cronHeader === "1" || cronHeader === "true";
  const ua = req.headers.get("user-agent") || "";
  const isVercelCronUa = ua.toLowerCase().includes("vercel-cron/");
  if (!(isVercelCron || isVercelCronUa) && (!expected || secret !== expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = Math.max(1, Math.min(500, Number(searchParams.get("limit") || "200")));

  const { data: subs, error } = await supabaseServer
    .from("subscriptions")
    .select("id, email, category_slug")
    .eq("status", "active")
    .is("mailerlite_synced_at", null)
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ id: string; email: string; ok: boolean; error?: string }> = [];
  for (const sub of subs || []) {
    try {
      const category = String(sub.category_slug || "").trim();
      if (!category) {
        throw new Error("Missing category_slug");
      }
      const email = String(sub.email || "").trim();
      if (!email) {
        throw new Error("Missing email");
      }
      const groupId = await getOrCreateGroupId(category);
      const ml = await upsertSubscriber(email, groupId);
      const subscriberId = ml.data?.id || null;

      await supabaseServer
        .from("subscriptions")
        .update({
          mailerlite_group_id: groupId,
          mailerlite_subscriber_id: subscriberId,
          mailerlite_synced_at: new Date().toISOString(),
        })
        .eq("id", sub.id);

      await supabaseServer.from("mailerlite_groups").upsert({
        group_id: groupId,
        category_slug: category,
        name: category,
      });

      results.push({ id: sub.id, email: sub.email, ok: true });
    } catch (err: any) {
      results.push({ id: sub.id, email: sub.email, ok: false, error: err?.message || "error" });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}
