import Link from "next/link";
import type { Metadata } from "next";
import { cdnImageUrl } from "@/lib/cdn";
import {
  RECIPE_CATEGORIES,
  RECIPE_DIETS,
  RECIPE_MEAL_TYPES,
  RECIPE_TIMES,
  recipeLabel,
} from "@/lib/recipeTaxonomy";
import { supabaseServer } from "@/lib/supabaseServer";

export const revalidate = 900;

type SearchParamsInput =
  | Promise<{ cat?: string | string[]; meal?: string | string[]; time?: string | string[]; diet?: string | string[]; page?: string | string[] }>
  | { cat?: string | string[]; meal?: string | string[]; time?: string | string[]; diet?: string | string[]; page?: string | string[] };

type RecipeArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  cover_image_url?: string | null;
  created_at?: string | null;
  recipe_categories?: string[] | null;
  recipe_meal_type?: string | null;
  recipe_time?: string | null;
  recipe_diets?: string[] | null;
};

function normalizeSingleParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function buildHref(params: Record<string, string | undefined>) {
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) urlParams.set(key, value);
  }
  const qs = urlParams.toString();
  return qs ? `/receptek?${qs}` : "/receptek";
}

export async function generateMetadata({ searchParams }: { searchParams?: SearchParamsInput }): Promise<Metadata> {
  const sp = searchParams ? await Promise.resolve(searchParams) : undefined;
  const activeCat = normalizeSingleParam(sp?.cat);
  const label = recipeLabel(RECIPE_CATEGORIES, activeCat);

  return {
    title: label ? `${label} | Receptek | Sokáig élek` : "Receptek | Sokáig élek",
    description: "Egészségtudatos receptek vérnyomásra, koleszterinre, inzulinrezisztenciára, rostbevitelre és napi energiaszintre szűrhetően.",
    alternates: { canonical: buildHref({ cat: activeCat }) },
    openGraph: {
      title: label ? `${label} | Receptek` : "Receptek",
      description: "Szűrhető receptgyűjtemény egészségtudatos célokhoz.",
      url: buildHref({ cat: activeCat }),
      type: "website",
    },
  };
}

export default async function RecipesPage({ searchParams }: { searchParams?: SearchParamsInput }) {
  const sp = searchParams ? await Promise.resolve(searchParams) : undefined;
  const activeCat = normalizeSingleParam(sp?.cat);
  const activeMeal = normalizeSingleParam(sp?.meal);
  const activeTime = normalizeSingleParam(sp?.time);
  const activeDiet = normalizeSingleParam(sp?.diet);
  const page = Math.max(1, Number.parseInt(String(normalizeSingleParam(sp?.page) ?? "1"), 10) || 1);

  const perPage = 12;
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = supabaseServer
    .from("articles")
    .select(
      "id, slug, title, excerpt, cover_image_url, created_at, recipe_categories, recipe_meal_type, recipe_time, recipe_diets",
      { count: "exact" }
    )
    .eq("status", "published")
    .eq("is_recipe", true)
    .order("created_at", { ascending: false });

  if (activeCat) query = query.contains("recipe_categories", [activeCat]);
  if (activeMeal) query = query.eq("recipe_meal_type", activeMeal);
  if (activeTime) query = query.eq("recipe_time", activeTime);
  if (activeDiet) query = query.contains("recipe_diets", [activeDiet]);

  const { data, error, count } = await query.range(from, to);
  const recipes = (data || []) as RecipeArticle[];
  const totalCount = Number(count || 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));

  const commonParams = { cat: activeCat, meal: activeMeal, time: activeTime, diet: activeDiet };

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-2xl font-bold">Receptek</h1>
        <p className="mt-2 text-red-600">Hiba: {error.message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Receptek</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
            Receptek cél, ételtípus, elkészítési idő és speciális étrend szerint szűrve.
          </p>
        </div>
        <Link href="/receptek" className="text-sm font-semibold text-amber-800 underline">
          Szűrés törlése
        </Link>
      </div>

      <section className="mt-7 space-y-5 border-y border-gray-200 py-5">
        <FilterGroup title="Recept kategória" items={RECIPE_CATEGORIES} active={activeCat} params={commonParams} field="cat" />
        <FilterGroup title="Étel típusa" items={RECIPE_MEAL_TYPES} active={activeMeal} params={commonParams} field="meal" />
        <FilterGroup title="Elkészítési idő" items={RECIPE_TIMES} active={activeTime} params={commonParams} field="time" />
        <FilterGroup title="Speciális étrend" items={RECIPE_DIETS} active={activeDiet} params={commonParams} field="diet" />
      </section>

      <div className="mt-6 text-sm text-gray-600">
        {totalCount} recept találat
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {recipes.map((recipe) => {
          const image = recipe.cover_image_url ? cdnImageUrl(recipe.cover_image_url) : "";
          const categoryBadges = (recipe.recipe_categories || [])
            .map((slug) => recipeLabel(RECIPE_CATEGORIES, slug))
            .filter(Boolean)
            .slice(0, 3);

          return (
            <Link
              key={recipe.id}
              href={`/cikkek/${recipe.slug}`}
              className="group overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="relative h-44 bg-gray-100">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt={recipe.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-emerald-50 via-white to-amber-50" />
                )}
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-2">
                  {recipe.recipe_meal_type ? (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                      {recipeLabel(RECIPE_MEAL_TYPES, recipe.recipe_meal_type)}
                    </span>
                  ) : null}
                  {recipe.recipe_time ? (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                      {recipeLabel(RECIPE_TIMES, recipe.recipe_time)}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 text-lg font-bold leading-snug group-hover:underline">{recipe.title}</h2>
                {recipe.excerpt ? (
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">{recipe.excerpt}</p>
                ) : null}
                {categoryBadges.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {categoryBadges.map((label) => (
                      <span key={label} className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-900">
                        {label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>

      {recipes.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-600">
          Nincs ilyen szűrésnek megfelelő recept.
        </div>
      ) : null}

      {totalPages > 1 ? (
        <div className="mt-8 flex items-center justify-center gap-3">
          {page > 1 ? (
            <Link className="rounded-full border px-4 py-2 text-sm" href={buildHref({ ...commonParams, page: String(page - 1) })}>
              Előző
            </Link>
          ) : null}
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link className="rounded-full border px-4 py-2 text-sm" href={buildHref({ ...commonParams, page: String(page + 1) })}>
              Következő
            </Link>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

function FilterGroup({
  title,
  items,
  active,
  params,
  field,
}: {
  title: string;
  items: ReadonlyArray<{ slug: string; label: string }>;
  active?: string;
  params: Record<string, string | undefined>;
  field: "cat" | "meal" | "time" | "diet";
}) {
  return (
    <div>
      <h2 className="text-sm font-bold text-gray-900">{title}</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        <Link
          href={buildHref({ ...params, [field]: undefined })}
          className={`rounded-full border px-3 py-1.5 text-sm ${
            !active ? "border-amber-300 bg-amber-50 text-amber-900" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          Összes
        </Link>
        {items.map((item) => (
          <Link
            key={item.slug}
            href={buildHref({ ...params, [field]: item.slug })}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              active === item.slug
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

