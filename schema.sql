-- Esquema para cuando migres del archivo JSON a Postgres (Supabase o Neon, ambos con tier gratis).
-- Reemplaza src/store.js por un cliente de Postgres que use estas tablas.

create table if not exists brands (
  id            text primary key,
  name          text not null,
  type          text,
  emoji         text,
  color         text,
  website       text,
  ga_id         text,
  logo          text,
  palette       jsonb default '[]',
  objective     text,
  goal_metric   text,
  audience      text,
  tone          text,
  offers        text,
  networks      jsonb default '{}',
  faceless      boolean default true,
  pillars       jsonb default '[]',
  cadence       text,
  last_audit    jsonb,
  meta          jsonb,        -- tokens de Meta por marca
  created_at    timestamptz default now()
);

create table if not exists posts (
  id          text primary key,
  brand_id    text references brands(id) on delete cascade,
  platform    text,
  type        text,
  title       text,
  caption     text,
  hashtags    jsonb default '[]',
  cta         text,
  visual_idea text,
  script      text,
  date        date,
  time        text,
  status      text default 'idea',
  objective   text,
  created_at  timestamptz default now()
);

create index if not exists idx_posts_brand on posts(brand_id);
create index if not exists idx_posts_date  on posts(date);
