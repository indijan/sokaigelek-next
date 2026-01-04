import { del, put } from "@vercel/blob";

const TOKEN = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || "";
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
  const { url } = await put(path, body, {
    access: "public",
    contentType,
    token: TOKEN,
  });
  return url;
}

export async function deleteVercelBlob(url: string) {
  if (!TOKEN || !isVercelBlobUrl(url)) return false;
  await del(url, { token: TOKEN });
  return true;
}
