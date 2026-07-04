alter table public.articles
  add column if not exists recipe_meal_types text[] not null default '{}';

update public.articles
set recipe_meal_types = array[recipe_meal_type]
where recipe_meal_type is not null
  and recipe_meal_type <> ''
  and coalesce(array_length(recipe_meal_types, 1), 0) = 0;

create index if not exists idx_articles_recipe_meal_types
  on public.articles using gin (recipe_meal_types);
