import { NextResponse } from "next/server";
import { cdnImageUrl } from "@/lib/cdn";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const maxDuration = 120;

type ProductRow = {
  slug: string | null;
  name: string | null;
  tags: string[] | null;
  short: string | null;
  description: string | null;
  ingredients: string | null;
  usage: string | null;
  warnings: string | null;
  image_url: string | null;
};

type LabProduct = {
  name: string;
  url: string;
  imageUrl?: string | null;
  reason: string;
};

type LabAnalysis = {
  summary: string;
  primaryFinding: {
    title: string;
    explanation: string;
  };
  secondaryFinding?: {
    title: string;
    explanation: string;
  };
  abnormalMarkers: Array<{
    name: string;
    value: string;
    referenceRange?: string;
    status: "low" | "high" | "borderline" | "normal" | "unknown";
    plainMeaning: string;
  }>;
  practicalAdvice: string[];
  products: LabProduct[];
  disclaimer: string;
};

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
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

function extractOutputText(data: unknown) {
  if (!data || typeof data !== "object") return "";
  const root = data as { output_text?: unknown; output?: unknown };
  if (typeof root.output_text === "string") return root.output_text;
  if (!Array.isArray(root.output)) return "";

  return root.output
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return "";
      return content
        .map((part) => {
          if (!part || typeof part !== "object") return "";
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        })
        .join("");
    })
    .join("");
}

function normalizeAnalysis(input: Partial<LabAnalysis>, productsByName: Map<string, ProductRow>): LabAnalysis {
  const productSeen = new Set<string>();
  const products = (input.products || [])
    .map((product): LabProduct | null => {
      const dbProduct = productsByName.get(String(product.name || "").toLowerCase());
      if (!dbProduct?.slug || !dbProduct.name) return null;
      const url = `/termek/${dbProduct.slug}`;
      if (productSeen.has(url)) return null;
      productSeen.add(url);
      return {
        name: dbProduct.name,
        url,
        imageUrl: dbProduct.image_url ? cdnImageUrl(dbProduct.image_url) : null,
        reason: String(product.reason || "").slice(0, 220),
      };
    })
    .filter((product): product is LabProduct => Boolean(product))
    .slice(0, 4);

  return {
    summary: String(input.summary || "").slice(0, 700),
    primaryFinding: {
      title: String(input.primaryFinding?.title || "A laboreredmény alapján óvatos értelmezés adható").slice(0, 160),
      explanation: String(
        input.primaryFinding?.explanation ||
          "A feltöltött leletből néhány érték kiemelhető, de az értelmezéshez mindig számít az életkor, tünetek, gyógyszerek és orvosi előzmények is."
      ).slice(0, 900),
    },
    secondaryFinding: input.secondaryFinding?.title
      ? {
          title: String(input.secondaryFinding.title).slice(0, 160),
          explanation: String(input.secondaryFinding.explanation || "").slice(0, 700),
        }
      : undefined,
    abnormalMarkers: (input.abnormalMarkers || [])
      .map((marker) => ({
        name: String(marker.name || "").slice(0, 80),
        value: String(marker.value || "").slice(0, 80),
        referenceRange: marker.referenceRange ? String(marker.referenceRange).slice(0, 80) : undefined,
        status: ["low", "high", "borderline", "normal", "unknown"].includes(String(marker.status))
          ? marker.status
          : "unknown",
        plainMeaning: String(marker.plainMeaning || "").slice(0, 260),
      }))
      .filter((marker) => marker.name && marker.value)
      .slice(0, 10),
    practicalAdvice: (input.practicalAdvice || [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 4),
    products,
    disclaimer:
      "Ez nem orvosi diagnózis és nem kezelési javaslat. Laboreredményt mindig orvossal érdemes értelmezni, különösen panasz, gyógyszerszedés, várandósság vagy tartós eltérés esetén.",
  };
}

async function loadProductCatalog() {
  const { data, error } = await supabaseServer
    .from("products")
    .select("slug,name,tags,short,description,ingredients,usage,warnings,image_url")
    .eq("status", "published")
    .order("name");

  if (error) throw new Error("products_not_found");

  const rows = (data || []) as ProductRow[];
  const productsByName = new Map(rows.filter((p) => p.name).map((p) => [String(p.name).toLowerCase(), p]));
  const catalog = rows
    .filter((p) => p.slug && p.name)
    .map((p) => ({
      name: p.name,
      slug: p.slug,
      tags: p.tags || [],
      description: stripHtml([p.short, p.description, p.ingredients, p.usage, p.warnings].filter(Boolean).join(" ")).slice(
        0,
        1300
      ),
    }));

  return { catalog, productsByName };
}

async function callOpenAiWithFile(file: File, productCatalog: unknown[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("missing_openai_key");

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type || "application/octet-stream";
  const isTextLike =
    contentType.startsWith("text/") ||
    file.name.toLowerCase().endsWith(".csv") ||
    file.name.toLowerCase().endsWith(".txt") ||
    file.name.toLowerCase().endsWith(".html");

  const prompt = `Feladat: magyar nyelvű, edukatív laboreredmény-értelmezés.

Nem adhatsz diagnózist, nem ijesztgethetsz, nem állíthatod, hogy étrend-kiegészítő betegséget kezel vagy gyógyít.
Ha valami orvosi kontrollt igényelhet, óvatosan fogalmazz: "érdemes orvossal egyeztetni".

Elemezd a feltöltött vérvizsgálati leletet:
1. Emeld ki a normától eltérő vagy határérték közeli értékeket.
2. Adj egy rövid elsődleges megállapítást.
3. Ha indokolt, adj egy kiegészítő megállapítást.
4. Adj 3-4 gyakorlati, nem ijesztgető tanácsot.
5. A termékajánlást KIZÁRÓLAG az alábbi termékkatalógusból válaszd. A termék leírását vesd össze a laborban látott mintával, és csak releváns terméket javasolj.
6. Ha nincs elég adat termékhez, adj üres products tömböt.

Termékkatalógus:
${JSON.stringify(productCatalog).slice(0, 45000)}

Válaszolj kizárólag érvényes JSON objektummal ebben a sémában:
{
  "summary": "2-4 mondatos közérthető összefoglaló",
  "primaryFinding": { "title": "rövid cím", "explanation": "magyarázat" },
  "secondaryFinding": { "title": "rövid cím", "explanation": "magyarázat" },
  "abnormalMarkers": [
    { "name": "marker neve", "value": "mért érték egységgel", "referenceRange": "referenciatartomány", "status": "low|high|borderline|normal|unknown", "plainMeaning": "közérthető jelentés" }
  ],
  "practicalAdvice": ["tanács 1", "tanács 2", "tanács 3"],
  "products": [
    { "name": "terméknév pontosan a katalógusból", "reason": "miért releváns, óvatos étrend-kiegészítő állítással" }
  ]
}`;

  const fileContent = isTextLike
    ? [
        {
          type: "input_text",
          text: `A feltöltött lelet szövege:\n\n${buffer.toString("utf8").slice(0, 60000)}`,
        },
      ]
    : [
        {
          type: "input_file",
          filename: file.name || "laboreredmeny",
          file_data: `data:${contentType};base64,${buffer.toString("base64")}`,
        },
      ];

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
          content: [{ type: "input_text", text: prompt }, ...fileContent],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`openai_error:${detail.slice(0, 500)}`);
  }

  const data = await response.json();
  const text = extractOutputText(data);
  const parsed = extractJsonObject(text);
  if (!parsed) throw new Error("invalid_ai_json");
  return parsed as Partial<LabAnalysis>;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Hiányzik a feltöltött laboreredmény." }, { status: 400 });
    }

    const maxSize = 12 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "A fájl túl nagy. Maximum 12 MB-os leletet tölts fel." }, { status: 400 });
    }

    const { catalog, productsByName } = await loadProductCatalog();
    const analysis = await callOpenAiWithFile(file, catalog);
    return NextResponse.json(normalizeAnalysis(analysis, productsByName));
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error("lab-check error", message);
    return NextResponse.json(
      { error: "Most nem sikerült elemezni a laboreredményt. Próbáld újra kisebb vagy olvashatóbb fájllal." },
      { status: 500 }
    );
  }
}
