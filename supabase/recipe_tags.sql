alter table public.articles
  add column if not exists recipe_tags text[] not null default '{}';

create index if not exists idx_articles_recipe_tags
  on public.articles using gin (recipe_tags);
