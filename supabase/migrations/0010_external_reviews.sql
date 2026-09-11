-- Meetap – review data from official partner APIs (Tripadvisor Content API,
-- later Google Places) and the LLM-written venue profile built from it.

create table if not exists public.venue_external (
  venue_id      uuid not null references public.venues(id) on delete cascade,
  source        text not null check (source in ('tripadvisor','google','foursquare')),
  external_id   text not null,
  match_score   real,                     -- how sure we are it is the same place
  rating        numeric,
  review_count  integer,
  price_level   text,
  cuisines      text[] not null default '{}',
  features      text[] not null default '{}',
  ranking_text  text,
  web_url       text,
  raw           jsonb not null default '{}',
  fetched_at    timestamptz not null default now(),
  primary key (venue_id, source)
);
create index if not exists venue_external_source_idx on public.venue_external (source, external_id);

-- Partner reviews are a cache for profile generation (partner terms limit long
-- term storage); the derived profile below is what the product relies on.
create table if not exists public.venue_reviews_external (
  id            bigserial primary key,
  venue_id      uuid not null references public.venues(id) on delete cascade,
  source        text not null,
  external_id   text not null,
  rating        smallint,
  title         text,
  body          text,
  lang          text,
  trip_type     text,
  published_at  date,
  fetched_at    timestamptz not null default now(),
  unique (source, external_id)
);
create index if not exists venue_reviews_external_venue_idx on public.venue_reviews_external (venue_id);

alter table public.venues add column if not exists profile text;            -- "Good for fish, romantic, slow service…"
alter table public.venues add column if not exists good_for text[] not null default '{}'; -- free-form: 'fish','kebab','date night','study'
alter table public.venues add column if not exists profile_source text;     -- 'reviews' | 'website' | 'name_only'
alter table public.venues add column if not exists profile_updated_at timestamptz;
alter table public.venues add column if not exists external_rating numeric;
alter table public.venues add column if not exists external_review_count integer;
create index if not exists venues_good_for_gin on public.venues using gin (good_for);
