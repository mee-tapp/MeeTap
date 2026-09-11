-- Meetap – venues_nearby can now pre-filter by ambiance tags / seaside / cuisines,
-- so a "seaside" request pulls shore venues into the candidate pool even when
-- the 600 nearest venues are all inland.
drop function if exists public.venues_nearby(double precision, double precision, integer, text, text[], integer);
create or replace function public.venues_nearby(
  p_lat double precision, p_lon double precision, p_radius_m integer default 3000,
  p_city text default null, p_categories text[] default null, p_limit integer default 300,
  p_tags text[] default null, p_cuisines text[] default null
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
     and (p_tags is null or v.ambiance_tags && p_tags or ('seaside' = any(p_tags) and v.seaside))
     and (p_cuisines is null or v.cuisines && p_cuisines)
   order by distance_m
   limit p_limit;
$$;
