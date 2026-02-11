import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { slugifyHu } from "@/lib/slugifyHu";

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

const ALLOWED_CATEGORY_SLUGS = new Set([
  "immunrendszer-erositese-es-altalanos-egeszsegmegorzes",
  "csontok-izuletek-es-izomrendszer",
  "energia-es-mentalis-frissesseg",
  "hidratacio-es-elektrolit-egyensuly-fenntartasa",
  "sziv-es-errendszer-egeszsege",
  "optimalis-megoldas",
  "meregtelenites",
]);

function extractGroups(payload: any): Array<{ id?: string; name?: string }> {
  const groups: Array<{ id?: string; name?: string }> = [];
  const data = payload?.data || payload || {};

  const list = data.groups || payload?.groups || null;
  if (Array.isArray(list)) {
    for (const g of list) {
      if (typeof g === "string") {
        groups.push({ id: g });
      } else if (g && typeof g === "object") {
        groups.push({ id: g.id ? String(g.id) : undefined, name: g.name ? String(g.name) : undefined });
      }
    }
  }

  const groupId =
    data.group_id ||
    data.groupId ||
    data.group?.id ||
    payload?.group_id ||
    payload?.groupId ||
    payload?.group?.id ||
    null;
  const groupName =
    data.group?.name ||
    payload?.group?.name ||
    data.group_name ||
    payload?.group_name ||
    null;

  if (groupId || groupName) {
    groups.push({
      id: groupId ? String(groupId) : undefined,
      name: groupName ? String(groupName) : undefined,
    });
  }

  return groups;
}

async function resolveCategory(group: { id?: string; name?: string }): Promise<{ slug: string; name?: string } | null> {
  if (group.id) {
    const { data } = await supabaseServer
      .from("mailerlite_groups")
      .select("category_slug, name")
      .eq("group_id", group.id)
      .maybeSingle();
    if (data?.category_slug) {
      return { slug: data.category_slug, name: data.name || group.name };
    }
  }

  const rawName = String(group.name || "").trim();
  if (rawName) {
    const direct = rawName.toLowerCase();
    if (ALLOWED_CATEGORY_SLUGS.has(direct)) {
      return { slug: direct, name: rawName };
    }
    const slug = slugifyHu(rawName);
    if (ALLOWED_CATEGORY_SLUGS.has(slug)) {
      return { slug, name: rawName };
    }
  }

  return null;
}

export async function POST(req: Request) {
  const reqUrl = new URL(req.url);
  const headerSecret = req.headers.get("x-webhook-secret") || "";
  const querySecret = reqUrl.searchParams.get("secret") || "";
  const expected = process.env.BREVO_WEBHOOK_SECRET || process.env.MAILERLITE_WEBHOOK_SECRET || "";
  if (expected && headerSecret !== expected && querySecret !== expected) {
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

    return NextResponse.json({ ok: true });
  }

  const groups = extractGroups(payload);
  if (groups.length === 0) {
    return NextResponse.json({ ok: true, note: "no_groups" });
  }

  const subscriberId =
    payload?.data?.id ||
    payload?.data?.subscriber?.id ||
    payload?.subscriber?.id ||
    payload?.id ||
    null;

  const upserts = [];
  for (const g of groups) {
    const resolved = await resolveCategory(g);
    if (!resolved) continue;

    if (g.id) {
      await supabaseServer.from("mailerlite_groups").upsert({
        group_id: String(g.id),
        category_slug: resolved.slug,
        name: resolved.name || null,
      });
    }

    upserts.push({
      email,
      category_slug: resolved.slug,
      status: "active",
      source: "brevo",
      mailerlite_group_id: g.id ? String(g.id) : null,
      mailerlite_subscriber_id: subscriberId ? String(subscriberId) : null,
      updated_at: new Date().toISOString(),
    });
  }

  if (upserts.length > 0) {
    await supabaseServer.from("subscriptions").upsert(upserts, {
      onConflict: "email,category_slug",
    });
  }

  return NextResponse.json({ ok: true, synced: upserts.length });
}
