-- Meetap – seaside as a geographic fact: distance from each venue to sea/ocean
-- polygons from Overture Maps (base/water). Loaded by scripts/data/load-water.mjs.

create table if not exists public.water_bodies (
  id        bigserial primary key,
  source_id text unique,
  city      text not null,
  subtype   text,
  name      text,
  geom      geography(Geometry, 4326) not null
);
create index if not exists water_bodies_gix on public.water_bodies using gist (geom);

alter table public.venues add column if not exists seaside boolean;
alter table public.venues add column if not exists shore_distance_m real;

-- Recompute for one city; 150 m = "you can see/walk to the water from the door".
create or replace function public.refresh_seaside(p_city text, p_threshold_m integer default 150)
returns integer language plpgsql as $$
declare n integer;
begin
  update public.venues v
     set shore_distance_m = s.d,
         seaside = (s.d <= p_threshold_m),
         updated_at = now()
    from (
      select v2.id,
             (select min(st_distance(v2.location, w.geom))
                from public.water_bodies w
               where w.city = p_city and st_dwithin(v2.location, w.geom, 2000)) as d
        from public.venues v2
       where v2.city = p_city
    ) s
   where v.id = s.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- venues_nearby now also returns seaside.
drop function if exists public.venues_nearby(double precision, double precision, integer, text, text[], integer);
create or replace function public.venues_nearby(
  p_lat double precision, p_lon double precision, p_radius_m integer default 3000,
  p_city text default null, p_categories text[] default null, p_limit integer default 300
) returns table (
  id uuid, slug text, name text, category text, cuisines text[],
  lat double precision, lon double precision, distance_m double precision,
  opening_hours text, outdoor_seating boolean, indoor_seating boolean, wifi text,
  price_band smallint, price_estimate numeric, currency text,
  ambiance_tags text[], ambiance_source text,
  rating_avg numeric, rating_count integer, website text, confidence real, district text,
  seaside boolean
) language sql stable as $$
  select v.id, v.slug, v.name, v.category, v.cuisines, v.lat, v.lon,
         st_distance(v.location, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography) as distance_m,
         v.opening_hours, v.outdoor_seating, v.indoor_seating, v.wifi,
         v.price_band, v.price_estimate, v.currency,
         v.ambiance_tags, v.ambiance_source,
         v.rating_avg, v.rating_count, v.website, v.confidence, v.district, v.seaside
    from public.venues v
   where v.is_active
     and st_dwithin(v.location, st_setsrid(st_makepoint(p_lon, p_lat), 4326)::geography, p_radius_m)
     and (p_city is null or v.city = p_city)
     and (p_categories is null or v.category = any(p_categories))
   order by distance_m
   limit p_limit;
$$;
