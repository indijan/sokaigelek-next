export const RECIPE_CATEGORIES = [
  { slug: "magas-koleszterin", label: "Receptek magas koleszterinre" },
  { slug: "magas-vernyomas", label: "Receptek magas vérnyomásra" },
  { slug: "fogyokuras", label: "Fogyókúrás receptek" },
  { slug: "inzulinrezisztencia", label: "Receptek inzulinrezisztenciára" },
  { slug: "cukorbetegeknek", label: "Receptek cukorbetegeknek" },
  { slug: "vasban-gazdag", label: "Vasban gazdag receptek" },
  { slug: "feherjedus", label: "Fehérjedús receptek" },
  { slug: "rostban-gazdag", label: "Rostban gazdag receptek" },
  { slug: "immunerosito", label: "Immunerősítő receptek" },
  { slug: "gyulladascsokkento", label: "Gyulladáscsökkentő receptek" },
  { slug: "belbarat", label: "Bélbarát receptek" },
  { slug: "szivbarat", label: "Szívbarát receptek" },
  { slug: "magneziumban-gazdag", label: "Magnéziumban gazdag receptek" },
  { slug: "omega-3-ban-gazdag", label: "Omega-3-ban gazdag receptek" },
  { slug: "energiat-ado", label: "Energiát adó receptek" },
] as const;

export const RECIPE_MEAL_TYPES = [
  { slug: "reggeli", label: "Reggeli" },
  { slug: "ebed", label: "Ebéd" },
  { slug: "vacsora", label: "Vacsora" },
  { slug: "leves", label: "Leves" },
  { slug: "salata", label: "Saláta" },
  { slug: "smoothie", label: "Smoothie" },
  { slug: "snack", label: "Snack" },
  { slug: "desszert", label: "Desszert" },
] as const;

export const RECIPE_TIMES = [
  { slug: "15-perc-alatt", label: "15 perc alatt" },
  { slug: "30-perc-alatt", label: "30 perc alatt" },
  { slug: "1-ora-alatt", label: "1 óra alatt" },
] as const;

export const RECIPE_DIETS = [
  { slug: "vegetarianus", label: "Vegetáriánus" },
  { slug: "vegan", label: "Vegán" },
  { slug: "glutenmentes", label: "Gluténmentes" },
  { slug: "laktozmentes", label: "Laktózmentes" },
  { slug: "cukormentes", label: "Cukormentes" },
  { slug: "alacsony-szenhidrat", label: "Alacsony szénhidrát" },
] as const;

export function recipeLabel(
  items: ReadonlyArray<{ slug: string; label: string }>,
  slug?: string | null
) {
  return items.find((item) => item.slug === slug)?.label || "";
}

