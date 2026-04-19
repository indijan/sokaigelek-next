import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { cdnImageUrl } from "@/lib/cdn";

type ProductCardRow = {
  slug: string | null;
  image_url: string | null;
};

export async function GET() {
  const { data, error } = await supabaseServer
    .from("products")
    .select("slug, image_url")
    .eq("status", "published");

  if (error) return NextResponse.json([], { status: 200 });

  const rows = ((data || []) as ProductCardRow[])
    .filter((row) => row?.slug)
    .map((row) => ({
      slug: String(row.slug).toLowerCase(),
      image_url: row.image_url ? cdnImageUrl(String(row.image_url)) : null,
    }));

  return NextResponse.json(rows, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
