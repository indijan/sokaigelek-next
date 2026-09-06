import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { R2Bucket } from "@cloudflare/workers-types";

export const dynamic = "force-dynamic";

type R2Env = {
  SOKAIGELEK_MEDIA?: R2Bucket;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = path.join("/");
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

  const { env } = await getCloudflareContext<R2Env>({ async: true });
  const object = await (env as unknown as R2Env).SOKAIGELEK_MEDIA?.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers as any);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  return new Response(object.body as any, { headers });
}
