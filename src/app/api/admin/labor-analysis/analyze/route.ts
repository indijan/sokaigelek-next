import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const maxDuration = 120;

type ProductRow = {
  name: string | null;
  slug: string | null;
  short: string | null;
  description: string | null;
  tags: string[] | null;
  affiliate_label_1: string | null;
  affiliate_url_1: string | null;
  affiliate_label_2: string | null;
  affiliate_url_2: string | null;
};

type NormalizedProduct = {
  name: string;
  reason: string;
  affiliateLabel1?: string | null;
  affiliateUrl1?: string | null;
  affiliateLabel2?: string | null;
  affiliateUrl2?: string | null;
};

function stripHtml(input: string) {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function productCardHtml(product: {
  name: string;
  reason: string;
  affiliateLabel1?: string | null;
  affiliateUrl1?: string | null;
  affiliateLabel2?: string | null;
  affiliateUrl2?: string | null;
}) {
  return `<div style="border:1px solid #e5e7eb;border-radius:16px;padding:16px;margin-bottom:12px;background:#ffffff;">
    <div style="font-size:18px;font-weight:800;color:#0f172a;margin-bottom:8px;">${product.name}</div>
    <div style="font-size:14px;line-height:1.6;color:#475569;margin-bottom:12px;">${product.reason}</div>
    ${
      product.affiliateUrl1
        ? `<div style="margin-bottom:8px;"><a href="${product.affiliateUrl1}" style="display:inline-block;padding:10px 14px;border-radius:999px;background:#16a34a;color:#fff;text-decoration:none;font-weight:700;">${product.affiliateLabel1 || "Megveszem Sokáig élek áron"}</a></div>`
        : ""
    }
    ${
      product.affiliateUrl2
        ? `<div><a href="${product.affiliateUrl2}" style="display:inline-block;padding:10px 14px;border-radius:999px;background:#ea580c;color:#fff;text-decoration:none;font-weight:700;">${product.affiliateLabel2 || "Klubtag leszek"}</a></div>`
        : ""
    }
  </div>`;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  if (cookieStore.get("admin_ok")?.value !== "1") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Tölts fel egy PDF fájlt." }, { status: 400 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

    const { data: products } = await supabaseServer
      .from("products")
      .select("name, slug, short, description, tags, affiliate_label_1, affiliate_url_1, affiliate_label_2, affiliate_url_2")
      .eq("status", "published")
      .order("name");

    const rows = (products || []) as ProductRow[];
    const byName = new Map(rows.filter((row) => row.name).map((row) => [String(row.name).toLowerCase(), row]));
    const catalog = rows.map((row) => ({
      name: row.name,
      slug: row.slug,
      tags: row.tags || [],
      description: stripHtml(`${row.short || ""} ${row.description || ""}`).slice(0, 1000),
      affiliateLabel1: row.affiliate_label_1,
      affiliateUrl1: row.affiliate_url_1,
      affiliateLabel2: row.affiliate_label_2,
      affiliateUrl2: row.affiliate_url_2,
    }));

    const bytes = Buffer.from(await file.arrayBuffer());
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Feladat: elemezd a feltöltött labor PDF-et magyarul, és adj vissza kizárólag JSON-t.

Kimenet:
{
  "subject": "email tárgy",
  "summaryTitle": "rövid cím",
  "summaryLead": "rövid bevezető",
  "markers": [
    { "name": "TSH", "value": "2,81", "referenceRange": "0,40-4,00", "status": "normal|borderline|low|high|unknown", "plainMeaning": "közérthető jelentés" }
  ],
  "adviceItems": ["használható életmódtanács 1", "használható életmódtanács 2", "használható életmódtanács 3"],
  "products": [
    { "name": "pontos terméknév a katalógusból", "reason": "miért ajánlható" }
  ]
}

Követelmények:
- ne diagnosztizálj
- ne ijesztgess
- közérthető, ténylegesen használható életmódtanácsokat adj
- a termékajánlás kizárólag ebből a katalógusból választhat:
${JSON.stringify(catalog).slice(0, 45000)}`,
              },
              {
                type: "input_file",
                filename: file.name || "labor.pdf",
                file_data: `data:${file.type || "application/pdf"};base64,${bytes.toString("base64")}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({ error: `OpenAI error: ${detail}` }, { status: 500 });
    }

    const json = await response.json();
    const outputText =
      json?.output_text ||
      json?.output?.map((o: { content?: Array<{ text?: string }> }) => (o.content || []).map((c) => c.text || "").join("")).join("") ||
      "";
    const parsed = extractJsonObject(outputText);
    if (!parsed) return NextResponse.json({ error: "Az AI nem adott vissza értelmezhető JSON-t." }, { status: 500 });

    const markers = Array.isArray(parsed.markers) ? parsed.markers.slice(0, 12) : [];
    const adviceItems = Array.isArray(parsed.adviceItems) ? parsed.adviceItems.slice(0, 5) : [];
    const pickedProducts = Array.isArray(parsed.products) ? parsed.products : [];
    const normalizedProducts: NormalizedProduct[] = pickedProducts
      .map((product: { name?: string; reason?: string }): NormalizedProduct | null => {
        const row = byName.get(String(product.name || "").toLowerCase());
        if (!row?.name) return null;
        return {
          name: row.name,
          reason: String(product.reason || "").trim(),
          affiliateLabel1: row.affiliate_label_1,
          affiliateUrl1: row.affiliate_url_1,
          affiliateLabel2: row.affiliate_label_2,
          affiliateUrl2: row.affiliate_url_2,
        };
      })
      .filter((product: NormalizedProduct | null): product is NormalizedProduct => Boolean(product))
      .slice(0, 4);

    const adviceHtml = `<section style="margin-top:28px;"><h2 style="font-size:24px;line-height:1.2;color:#0f172a;margin:0 0 14px;font-weight:900;">2. Gyakorlati tanácsok</h2><div style="display:grid;gap:12px;">${adviceItems
      .map(
        (item: string) =>
          `<div style="border:1px solid #e5e7eb;border-radius:16px;padding:14px 16px;background:#ffffff;font-size:15px;line-height:1.7;color:#334155;">${item}</div>`
      )
      .join("")}</div></section>`;

    const productsHtml = `<section style="margin-top:28px;"><h2 style="font-size:24px;line-height:1.2;color:#0f172a;margin:0 0 14px;font-weight:900;">3. Termékajánló</h2>${normalizedProducts
      .map((product: NormalizedProduct) => productCardHtml(product))
      .join("")}</section>`;

    const markersHtml = markers
      .map((marker: { name?: string; value?: string; referenceRange?: string; status?: string; plainMeaning?: string }) => {
        const status = String(marker.status || "unknown");
        const color =
          status === "high" ? "#ef4444" : status === "low" ? "#f97316" : status === "borderline" ? "#f59e0b" : "#22c55e";
        const width = status === "high" || status === "low" ? "84%" : status === "borderline" ? "58%" : "32%";
        return `<div style="border:1px solid #e5e7eb;border-radius:18px;padding:16px;background:#ffffff;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
            <div style="font-weight:800;color:#0f172a;">${marker.name || ""}</div>
            <div style="font-weight:900;color:${color};">${marker.value || ""}</div>
          </div>
          <div style="margin-top:10px;height:10px;border-radius:999px;background:#e2e8f0;overflow:hidden;">
            <div style="height:100%;width:${width};background:${color};border-radius:999px;"></div>
          </div>
          <div style="margin-top:10px;font-size:13px;line-height:1.6;color:#64748b;">${marker.referenceRange ? `Referencia: ${marker.referenceRange}. ` : ""}${marker.plainMeaning || ""}</div>
        </div>`;
      })
      .join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${parsed.subject || "Laboreredmény összefoglaló"}</title></head>
    <body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <div style="max-width:760px;margin:0 auto;padding:24px 16px;">
        <div style="border:1px solid #e5e7eb;border-radius:28px;background:linear-gradient(145deg,#ffffff,#fff7ed);padding:28px;">
          <h1 style="font-size:34px;line-height:1.05;margin:0 0 12px;font-weight:900;">${parsed.summaryTitle || "Laboreredmény összefoglaló"}</h1>
          <p style="margin:0;color:#475569;line-height:1.75;font-size:16px;">${parsed.summaryLead || ""}</p>
          <section style="margin-top:28px;">
            <h2 style="font-size:24px;line-height:1.2;color:#0f172a;margin:0 0 14px;font-weight:900;">1. Értékek elemzése</h2>
            ${markersHtml}
          </section>
          ${adviceHtml}
          ${productsHtml}
          <div style="margin-top:28px;border-top:1px solid #e5e7eb;padding-top:18px;font-size:12px;line-height:1.6;color:#64748b;">
            Ez az összefoglaló nem helyettesíti az orvosi diagnózist. Tartós panasz vagy jelentős eltérés esetén érdemes orvossal egyeztetni.
          </div>
        </div>
      </div>
    </body></html>`;

    try {
      await supabaseServer.from("miniapp_events").insert({
        source: "admin_labor_analysis",
        event_name: "admin_labor_analysis_completed",
        mode: "admin",
        payload: {
          filename: file.name,
          markerCount: markers.length,
          productCount: normalizedProducts.length,
          subject: String(parsed.subject || "Laboreredmény összefoglaló"),
        },
      });
    } catch {
      // Stat logging must not block the analysis flow.
    }

    return NextResponse.json({
      subject: String(parsed.subject || "Laboreredmény összefoglaló"),
      html,
      adviceHtml,
      productsHtml,
      markers,
      products: normalizedProducts,
    });
  } catch (error) {
    console.error("admin labor analyze failed", error);
    return NextResponse.json({ error: "Az admin labor elemzés nem sikerült." }, { status: 500 });
  }
}
