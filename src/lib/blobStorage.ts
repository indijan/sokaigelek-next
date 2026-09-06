import { del, put } from "@vercel/blob";

const TOKEN = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN || "";
const HOST = process.env.VERCEL_BLOB_HOST || "";

export function isVercelBlobUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (HOST) return u.hostname === HOST;
    return u.hostname.endsWith("blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export async function uploadVercelBlob(path: string, body: Buffer, contentType: string) {
  if (!TOKEN) return null;
  try {
    // Blob keeps the payload compatible with both Node and Cloudflare's fetch runtime.
    const payload = new Blob([new Uint8Array(body)], { type: contentType });
    const { url } = await put(path, payload, {
      access: "public",
      contentType,
      token: TOKEN,
    });
    return url;
  } catch {
    // Let callers fall back to Supabase Storage instead of failing the request.
    return null;
  }
}

export async function deleteVercelBlob(url: string) {
  if (!TOKEN || !isVercelBlobUrl(url)) return false;
  await del(url, { token: TOKEN });
  return true;
}
