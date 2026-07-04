alter table public.articles
  add column if not exists is_recipe boolean not null default false,
  add column if not exists recipe_categories text[] not null default '{}',
  add column if not exists recipe_meal_type text,
  add column if not exists recipe_meal_types text[] not null default '{}',
  add column if not exists recipe_time text,
  add column if not exists recipe_diets text[] not null default '{}';

create index if not exists idx_articles_is_recipe on public.articles (is_recipe);
create index if not exists idx_articles_recipe_categories on public.articles using gin (recipe_categories);
create index if not exists idx_articles_recipe_diets on public.articles using gin (recipe_diets);
create index if not exists idx_articles_recipe_meal_type on public.articles (recipe_meal_type);
create index if not exists idx_articles_recipe_meal_types on public.articles using gin (recipe_meal_types);
create index if not exists idx_articles_recipe_time on public.articles (recipe_time);
