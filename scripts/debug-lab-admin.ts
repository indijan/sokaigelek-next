import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

async function main() {
  const filePath = "/Users/indijanmac/Documents/Webregator/Sokáig élek/Laboreredmeny_elemzesek/Féja Orsolya/2026_februar.pdf";
  const apiKey = process.env.OPENAI_API_KEY || "";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  const supabase = createClient(supabaseUrl, serviceKey);
  const bytes = await fs.readFile(filePath);
  const { data: products, error } = await supabase
    .from("products")
    .select("name, slug, short, description, image_url, tags, affiliate_label_1, affiliate_url_1, affiliate_label_2, affiliate_url_2")
    .eq("status", "published")
    .order("name");

  console.log("products_error", error?.message || null, "products_count", products?.length || 0);

  const catalog = (products || []).map((row: any) => ({
    name: row.name,
    slug: row.slug,
    tags: row.tags || [],
    description: `${row.short || ""} ${row.description || ""}`.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000),
    imageUrl: row.image_url,
    affiliateLabel1: row.affiliate_label_1,
    affiliateUrl1: row.affiliate_url_1,
    affiliateLabel2: row.affiliate_label_2,
    affiliateUrl2: row.affiliate_url_2,
  }));

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_LAB_ADMIN_MODEL || "gpt-5",
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
  "allMarkers": [
    { "name": "TSH", "value": "2,81", "referenceRange": "0,40-4,00", "status": "normal|borderline|low|high|unknown", "plainMeaning": "közérthető jelentés" }
  ],
  "adviceItems": ["használható életmódtanács 1", "használható életmódtanács 2", "használható életmódtanács 3"],
  "doctorFollowUpNote": "rövid, finom orvosi kontroll-javaslat vagy üres string",
  "referencedMarkerNames": ["minden marker neve, amit a summaryLead, adviceItems vagy doctorFollowUpNote mezőkben név szerint említesz"],
  "products": [
    { "name": "pontos terméknév a katalógusból", "reason": "miért ajánlható" }
  ]
}

Követelmények:
- ne diagnosztizálj
- ne ijesztgess
- közérthető, ténylegesen használható életmódtanácsokat adj
- minden low, high vagy borderline státuszú érték KÖTELEZŐEN szerepeljen az allMarkers tömbben
- normal értéket csak akkor tegyél az allMarkers tömbbe, ha közvetlenül segít értelmezni egy eltérő értéket
- a summaryLead, adviceItems és doctorFollowUpNote együtt ne hagyjon ki olyan eltérő értéket, ami az allMarkers tömbben szerepel
- ha a minta alapján finoman javasolt orvossal egyeztetni, ezt a doctorFollowUpNote mezőben add vissza 1 rövid, nyugodt mondatban
- ha egy markert név szerint említesz a summaryLead, adviceItems vagy doctorFollowUpNote mezőkben, annak KÖTELEZŐEN szerepelnie kell az allMarkers tömbben is
- a termékajánlás kizárólag ebből a katalógusból választhat:
${JSON.stringify(catalog).slice(0, 45000)}`,
            },
            {
              type: "input_file",
              filename: path.basename(filePath),
              file_data: `data:application/pdf;base64,${bytes.toString("base64")}`,
            },
          ],
        },
      ],
    }),
  });

  console.log("openai_status", response.status);
  const text = await response.text();
  console.log(text.slice(0, 4000));
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
