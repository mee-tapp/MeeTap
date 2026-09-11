-- Meetap – helper for the stat tiles: how many cities actually have venues.
create or replace function public.venue_city_count() returns integer language sql stable as $$
  select count(distinct city)::int from public.venues where is_active;
$$;
