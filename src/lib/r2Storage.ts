import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { R2Bucket } from "@cloudflare/workers-types";

const BUCKET_NAME = "sokaigelek-media";

type R2Env = {
  SOKAIGELEK_MEDIA?: R2Bucket;
};

async function getBucket() {
  const { env } = await getCloudflareContext<R2Env>({ async: true });
  const bucket = (env as unknown as R2Env).SOKAIGELEK_MEDIA;
  if (!bucket) throw new Error(`Missing R2 binding: SOKAIGELEK_MEDIA (${BUCKET_NAME})`);
  return bucket;
}

export function r2PublicUrl(path: string) {
  return `/media/${path.replace(/^\/+/, "")}`;
}

export async function uploadR2(path: string, body: Buffer, contentType: string) {
  const bucket = await getBucket();
  await bucket.put(path, body, {
    httpMetadata: {
      contentType,
      cacheControl: "public, max-age=31536000, immutable",
    },
  });
  return r2PublicUrl(path);
}

export async function deleteR2(path: string) {
  const bucket = await getBucket();
  await bucket.delete(path);
}
