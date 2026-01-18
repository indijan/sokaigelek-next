import { supabaseServer } from "@/lib/supabaseServer";
import { uploadVercelBlob } from "@/lib/blobStorage";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

async function openaiSummary(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: prompt,
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI error: ${t}`);
  }

  const data = await r.json();
  const text =
    data?.output_text ||
    data?.output?.map((o: any) => o?.content?.map((c: any) => c?.text).join("")).join("") ||
    "";

  const parsed = extractJsonObject(text);
  if (!parsed?.summary) throw new Error("OpenAI did not return summary");
  return String(parsed.summary || "").trim();
}

async function ttsMp3(text: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      format: "mp3",
      input: text,
    }),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI TTS error: ${t}`);
  }

  const arrayBuffer = await r.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;

    const { data: article, error } = await supabaseServer
      .from("articles")
      .select("id, slug, title, excerpt, content_html")
      .eq("slug", slug)
      .eq("status", "published")
      .single();

    if (error || !article) {
      return new Response("Article not found", { status: 404 });
    }

    const title = String(article.title || slug).trim();
    const excerpt = String(article.excerpt || "").trim();
    const rawHtml = String((article as any).content_html || "");
    const sourceText = stripHtml(rawHtml);
    const source = sourceText.slice(0, 7000);

    const contentHash = createHash("sha1")
      .update(`${title}\n${excerpt}\n${source}`)
      .digest("hex")
      .slice(0, 12);
    const blobPath = `article-summaries/${slug}/${contentHash}.mp3`;

    const hostRaw = process.env.VERCEL_BLOB_HOST || "";
    const host = hostRaw.replace(/\/$/, "");
    const cachedUrl = host
      ? (host.startsWith("http://") || host.startsWith("https://")
          ? `${host}/${blobPath}`
          : `https://${host}/${blobPath}`)
      : "";

    if (cachedUrl) {
      const head = await fetch(cachedUrl, { method: "HEAD" });
      if (head.ok) {
        return Response.json({ audioUrl: cachedUrl, summary: "" });
      }
    }

    const prompt = `
Adj vissza JSON-t ebben a formában:
{"summary":"..."}

Feladat: készíts magyar nyelvű, közérthető, 1-2 perces (kb. 150-220 szó) összefoglalót a cikkről.
Ne használj felsorolásjeleket. Legyen folyamatos beszédre optimalizált, barátságos hangvételű.

Cím: ${title}
Kivonat: ${excerpt || "nincs"}
Cikk (tisztított szöveg, részlet): ${source}
    `.trim();

    const summary = await openaiSummary(prompt);
    const audioBuffer = await ttsMp3(summary);
    const uploaded = await uploadVercelBlob(blobPath, audioBuffer, "audio/mpeg");
    if (!uploaded) {
      return new Response("Missing VERCEL_BLOB_READ_WRITE_TOKEN", { status: 500 });
    }

    return Response.json({ audioUrl: uploaded, summary });
  } catch (err: any) {
    console.error("Article summary error:", err);
    return new Response(err?.message || "Summary error", { status: 500 });
  }
}
