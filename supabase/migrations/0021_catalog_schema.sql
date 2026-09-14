-- Pilot catalog schema (decision 2026-09-14): a small, fully described set of
-- venues replaces the 87k open-data records for the recommender.
-- Closed vocabularies live in src/lib/catalog/taxonomy.ts; the database only
-- stores the keys.

alter table public.venues add column if not exists catalog_tier text not null default 'open_data'
  check (catalog_tier in ('pilot', 'open_data'));
alter table public.venues add column if not exists establishment_type text;   -- taxonomy ESTABLISHMENT_TYPES
alter table public.venues add column if not exists meals text[] not null default '{}';           -- breakfast, brunch, lunch, dinner, late_night
alter table public.venues add column if not exists features text[] not null default '{}';        -- private_room, karaoke, live_music, …
alter table public.venues add column if not exists signature_dishes text[] not null default '{}'; -- free text from reviews/menus, lowercase
alter table public.venues add column if not exists google_place_id text;
alter table public.venues add column if not exists google_maps_url text;
alter table public.venues add column if not exists editorial_summary text;
alter table public.venues add column if not exists catalog_notes text;        -- manual QA notes (Ali/Nihat)
alter table public.venues add column if not exists catalog_updated_at timestamptz;

create unique index if not exists venues_google_place_id_idx on public.venues (google_place_id) where google_place_id is not null;
create index if not exists venues_catalog_tier_idx on public.venues (catalog_tier);
create index if not exists venues_features_gin on public.venues using gin (features);
create index if not exists venues_signature_dishes_gin on public.venues using gin (signature_dishes);

-- venue_external already holds one row per (venue, source) with rating,
-- review_count, price_level, cuisines, features and the raw payload;
-- venue_reviews_external holds the individual reviews. Google joins the
-- allowed sources (it was already in the check constraint).
alter table public.venue_reviews_external add column if not exists author text;
alter table public.venue_reviews_external add column if not exists author_review_count integer;
alter table public.venue_reviews_external add column if not exists likes integer;
alter table public.venue_reviews_external add column if not exists raw jsonb;

-- venues_nearby: same filters as 0014 (+ photo columns from 0013), plus the
-- catalog columns in the result and an optional p_tier filter so the
-- recommender can restrict itself to the pilot catalog. The return type
-- changes, so the old signature is dropped first.
drop function if exists public.venues_nearby(double precision, double precision, integer, text, text[], integer, text[], text[], text[]);
create or replace function public.venues_nearby(
  p_lat double precision, p_lon double precision, p_radius_m integer default 3000,
  p_city text default null, p_categories text[] default null, p_limit integer default 300,
  p_tags text[] default null, p_cuisines text[] default null, p_name_keywords text[] default null,
  p_tier text default null
) returns table (
  id uuid, slug text, name text, category text, cuisines text[],
  lat double precision, lon double precision, distance_m double precision,
  opening_hours text, outdoor_seating boolean, indoor_seating boolean, wifi text,
  price_band smallint, price_estimate numeric, currency text,
  ambiance_tags text[], ambiance_source text,
  rating_avg numeric, rating_count integer, website text, confidence real, district text,
  seaside boolean, raw_type text, photo_url text, photo_attribution text,
  establishment_type text, meals text[], features text[], signature_dishes text[],
  external_rating numeric, external_review_count integer, profile text, catalog_tier text
) language sql stable as $$
  select v.id, v.slug, v.name, v.category, v.cuisines, v.lat, v.lon,
         st_distance(v.location, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography) as distance_m,
         v.opening_hours, v.outdoor_seating, v.indoor_seating, v.wifi,
         v.price_band, v.price_estimate, v.currency,
         v.ambiance_tags, v.ambiance_source,
         v.rating_avg, v.rating_count, v.website, v.confidence, v.district, v.seaside, v.raw_type,
         v.photo_url, v.photo_attribution,
         v.establishment_type, v.meals, v.features, v.signature_dishes,
         v.external_rating, v.external_review_count, v.profile, v.catalog_tier
    from public.venues v
   where v.is_active
     and st_dwithin(v.location, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, p_radius_m)
     and (p_city is null or v.city = p_city)
     and (p_tier is null or v.catalog_tier = p_tier)
     and (p_categories is null or v.category = any(p_categories))
     and (p_tags is null or v.ambiance_tags && p_tags or ('seaside' = any(p_tags) and v.seaside))
     and (p_cuisines is null or v.cuisines && p_cuisines
          or exists (select 1 from unnest(p_cuisines) c where v.raw_type like c || '\_%'))
     and (p_name_keywords is null
          or exists (select 1 from unnest(p_name_keywords) k where unaccent(lower(v.name)) like '%' || unaccent(lower(k)) || '%'))
   order by distance_m
   limit p_limit;
$$;
