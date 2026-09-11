-- Meetap – shore lines (polygon boundaries) make distance-to-sea cheap enough
-- to compute for 80k venues inside Supabase's statement timeout.
alter table public.water_bodies add column if not exists shore geography(Geometry, 4326);
create index if not exists water_bodies_shore_gix on public.water_bodies using gist (shore);

create or replace function public.refresh_shorelines(p_city text) returns integer language plpgsql as $$
declare n integer;
begin
  update public.water_bodies
     set shore = st_boundary(geom::geometry)::geography
   where city = p_city;
  get diagnostics n = row_count;
  return n;
end $$;

-- Chunked: caller passes a slice of venue ids.
create or replace function public.refresh_seaside_ids(p_ids uuid[], p_threshold_m integer default 150)
returns integer language plpgsql as $$
declare n integer;
begin
  update public.venues v
     set shore_distance_m = s.d,
         seaside = (s.d is not null and s.d <= p_threshold_m),
         updated_at = now()
    from (
      select v2.id,
             (select min(st_distance(v2.location, w.shore))
                from public.water_bodies w
               where w.city = v2.city and st_dwithin(v2.location, w.shore, 1500)) as d
        from public.venues v2
       where v2.id = any(p_ids)
    ) s
   where v.id = s.id;
  get diagnostics n = row_count;
  return n;
end $$;
