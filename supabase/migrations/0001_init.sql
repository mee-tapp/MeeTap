-- Meetap – initial schema (Supabase / Postgres)
-- Run in Supabase SQL editor or via `supabase db push`.

create extension if not exists postgis;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Venues: one row per real place. Every row must have at least one source.
-- ---------------------------------------------------------------------------
create table if not exists public.venues (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,
  name            text not null,
  name_en         text,
  category        text not null check (category in ('Cafés','Restaurants','Bars','Activities')),
  raw_type        text,                       -- osm amenity / overture category
  cuisines        text[] not null default '{}',
  city            text not null,
  district        text,
  address         jsonb not null default '{}',
  location        geography(Point, 4326) not null,
  lat             double precision not null,
  lon             double precision not null,

  opening_hours   text,                       -- OSM opening_hours syntax
  outdoor_seating boolean,
  indoor_seating  boolean,
  wifi            text,
  wheelchair      text,
  website         text,
  phone           text,
  instagram       text,
  brand           text,
  diet            jsonb not null default '{}', -- {vegetarian, vegan, halal}

  -- Price: 1 = cheap … 4 = expensive. Estimated until users report spend.
  price_band          smallint check (price_band between 1 and 4),
  price_band_source   text check (price_band_source in ('estimated','source','user')),
  price_estimate      numeric,                -- per person, local currency
  currency            text default 'TRY',

  -- Ambiance tags used by the scorer. Source tells the UI how much to trust them.
  ambiance_tags    text[] not null default '{}',
  ambiance_source  text check (ambiance_source in ('inferred','source','user','reviewed')),

  -- Community quality signal (no free external ratings exist).
  rating_avg    numeric,
  rating_count  integer not null default 0,

  confidence    real,                          -- overture confidence or our own
  is_active     boolean not null default true, -- false when reported closed
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists venues_location_gix on public.venues using gist (location);
create index if not exists venues_city_idx on public.venues (city);
create index if not exists venues_category_idx on public.venues (category);
create index if not exists venues_cuisines_gin on public.venues using gin (cuisines);
create index if not exists venues_ambiance_gin on public.venues using gin (ambiance_tags);
create index if not exists venues_name_trgm on public.venues using gin (name gin_trgm_ops);

-- Provenance: raw record from each open-data source. Keeps OSM (ODbL) separable.
create table if not exists public.venue_sources (
  id          bigserial primary key,
  venue_id    uuid not null references public.venues(id) on delete cascade,
  source      text not null check (source in ('osm','overture','user')),
  source_id   text not null,
  raw         jsonb not null,
  fetched_at  timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists venue_sources_venue_idx on public.venue_sources (venue_id);

-- ---------------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  home_city     text,
  created_at    timestamptz not null default now()
);

create table if not exists public.saved_venues (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  venue_id   uuid not null references public.venues(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);

-- History: what the user actually did. Feeds price + quality signals.
create table if not exists public.visits (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  venue_id      uuid not null references public.venues(id) on delete cascade,
  visited_at    date not null default current_date,
  spent_amount  numeric,                       -- per person
  rating        smallint check (rating between 1 and 5),
  note          text,
  purpose       text,
  created_at    timestamptz not null default now()
);
create index if not exists visits_user_idx on public.visits (user_id, visited_at desc);
create index if not exists visits_venue_idx on public.visits (venue_id);

-- Crowd corrections: "closed", "wrong info", ambiance votes.
create table if not exists public.venue_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  venue_id    uuid not null references public.venues(id) on delete cascade,
  type        text not null check (type in ('closed','wrong_info','ambiance_vote','price_report')),
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Recommendation telemetry: every query, what we understood, what was shown.
-- ---------------------------------------------------------------------------
create table if not exists public.query_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles(id) on delete set null,
  session_id       text,
  raw_query        text not null,
  parsed_intent    jsonb not null,
  parser           text not null check (parser in ('rules','llm')),
  city             text,
  user_location    geography(Point, 4326),
  weather          jsonb,
  results          jsonb not null,            -- [{venue_id, score, components}]
  clicked_venue_id uuid references public.venues(id),
  created_at       timestamptz not null default now()
);

-- Parsed-intent cache so identical sentences never hit the LLM twice.
create table if not exists public.intent_cache (
  query_hash    text primary key,
  raw_query     text not null,
  parsed_intent jsonb not null,
  parser        text not null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Rating rollup: keep venues.rating_* in sync with visits.
-- ---------------------------------------------------------------------------
create or replace function public.refresh_venue_rating() returns trigger language plpgsql as $$
begin
  update public.venues v
     set rating_avg   = s.avg_rating,
         rating_count = s.cnt,
         updated_at   = now()
    from (
      select venue_id, avg(rating)::numeric(3,2) as avg_rating, count(rating) as cnt
        from public.visits
       where venue_id = coalesce(new.venue_id, old.venue_id) and rating is not null
       group by venue_id
    ) s
   where v.id = s.venue_id;
  return null;
end $$;

drop trigger if exists visits_rating_rollup on public.visits;
create trigger visits_rating_rollup
after insert or update or delete on public.visits
for each row execute function public.refresh_venue_rating();

-- ---------------------------------------------------------------------------
-- Nearby candidates for the scorer (server-side distance filter).
-- ---------------------------------------------------------------------------
create or replace function public.venues_nearby(
  p_lat double precision,
  p_lon double precision,
  p_radius_m integer default 3000,
  p_city text default null,
  p_categories text[] default null,
  p_limit integer default 300
) returns table (
  id uuid, slug text, name text, category text, cuisines text[],
  lat double precision, lon double precision, distance_m double precision,
  opening_hours text, outdoor_seating boolean, indoor_seating boolean, wifi text,
  price_band smallint, price_estimate numeric, currency text,
  ambiance_tags text[], ambiance_source text,
  rating_avg numeric, rating_count integer, website text
) language sql stable as $$
  select v.id, v.slug, v.name, v.category, v.cuisines, v.lat, v.lon,
         st_distance(v.location, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography) as distance_m,
         v.opening_hours, v.outdoor_seating, v.indoor_seating, v.wifi,
         v.price_band, v.price_estimate, v.currency,
         v.ambiance_tags, v.ambiance_source,
         v.rating_avg, v.rating_count, v.website
    from public.venues v
   where v.is_active
     and st_dwithin(v.location, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, p_radius_m)
     and (p_city is null or v.city = p_city)
     and (p_categories is null or v.category = any(p_categories))
   order by distance_m
   limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.venues        enable row level security;
alter table public.venue_sources enable row level security;
alter table public.profiles      enable row level security;
alter table public.saved_venues  enable row level security;
alter table public.visits        enable row level security;
alter table public.venue_reports enable row level security;
alter table public.query_logs    enable row level security;
alter table public.intent_cache  enable row level security;

create policy "venues are public"        on public.venues        for select using (true);
create policy "sources are public"       on public.venue_sources for select using (true);

create policy "own profile"              on public.profiles      for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own saved"                on public.saved_venues  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own visits"               on public.visits        for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "insert reports"           on public.venue_reports for insert with check (auth.uid() = user_id or user_id is null);
create policy "own reports"              on public.venue_reports for select using (auth.uid() = user_id);
create policy "own query logs"           on public.query_logs    for select using (auth.uid() = user_id);
-- Writes to venues, venue_sources, query_logs, intent_cache happen with the service role from server functions.
