alter table public.articles
  add column if not exists recipe_tags text[] not null default '{}',
  add column if not exists recipe_featured_category text,
  add column if not exists recipe_featured_diet text;

create index if not exists idx_articles_recipe_tags
  on public.articles using gin (recipe_tags);

create index if not exists idx_articles_recipe_featured_category
  on public.articles (recipe_featured_category);

create index if not exists idx_articles_recipe_featured_diet
  on public.articles (recipe_featured_diet);
