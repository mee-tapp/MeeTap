-- Meetap – shore lines split into small pieces so the spatial index does the
-- heavy lifting; distance to a 60-vertex piece is cheap, to the whole Marmara
-- coastline it is not.
create table if not exists public.water_shore_pieces (
  id     bigserial primary key,
  city   text not null,
  geom   geography(Geometry, 4326) not null
);
create index if not exists water_shore_pieces_gix on public.water_shore_pieces using gist (geom);
create index if not exists water_shore_pieces_city_idx on public.water_shore_pieces (city);

create or replace function public.refresh_shorelines(p_city text) returns integer language plpgsql as $$
declare n integer;
begin
  delete from public.water_shore_pieces where city = p_city;
  insert into public.water_shore_pieces (city, geom)
  select p_city, st_subdivide(st_boundary(geom::geometry), 48)::geography
    from public.water_bodies where city = p_city;
  get diagnostics n = row_count;
  return n;
end $$;

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
             (select min(st_distance(v2.location, p.geom))
                from public.water_shore_pieces p
               where p.city = v2.city and st_dwithin(v2.location, p.geom, 1500)) as d
        from public.venues v2
       where v2.id = any(p_ids)
    ) s
   where v.id = s.id;
  get diagnostics n = row_count;
  return n;
end $$;
