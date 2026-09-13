-- Meetap – business-owned venues: a business account can create and manage
-- exactly one venue (its own restaurant/café/bar), add photos, and manage a
-- menu. Purely additive: no existing column, table, policy, or the OSM/
-- Overture pipeline is touched.
--
-- Business-created venues start with is_active = false (a draft, not shown
-- in Explore/recommendations) until reviewed — this keeps the existing
-- recommendation flow, which already filters on is_active, unaffected.

alter table public.venues
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;
create index if not exists venues_owner_idx on public.venues (owner_id);

drop policy if exists "owner manages own venue" on public.venues;
create policy "owner manages own venue" on public.venues for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ---------------------------------------------------------------------------
create table if not exists public.venue_photos (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid not null references public.venues(id) on delete cascade,
  url         text not null,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists venue_photos_venue_idx on public.venue_photos (venue_id, sort_order);

alter table public.venue_photos enable row level security;
drop policy if exists "venue photos are public" on public.venue_photos;
create policy "venue photos are public" on public.venue_photos for select using (true);
drop policy if exists "owner manages own venue photos" on public.venue_photos;
create policy "owner manages own venue photos" on public.venue_photos for all
  using (exists (select 1 from public.venues v where v.id = venue_photos.venue_id and v.owner_id = auth.uid()))
  with check (exists (select 1 from public.venues v where v.id = venue_photos.venue_id and v.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
create table if not exists public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  venue_id      uuid not null references public.venues(id) on delete cascade,
  name          text not null,
  description   text,
  price         numeric,
  currency      text not null default 'TRY',
  category      text,                     -- free text, e.g. "Starters", "Mains"
  sort_order    integer not null default 0,
  is_available  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists menu_items_venue_idx on public.menu_items (venue_id, sort_order);

alter table public.menu_items enable row level security;
drop policy if exists "menu items are public" on public.menu_items;
create policy "menu items are public" on public.menu_items for select using (true);
drop policy if exists "owner manages own menu items" on public.menu_items;
create policy "owner manages own menu items" on public.menu_items for all
  using (exists (select 1 from public.venues v where v.id = menu_items.venue_id and v.owner_id = auth.uid()))
  with check (exists (select 1 from public.venues v where v.id = menu_items.venue_id and v.owner_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage bucket for business-uploaded photos. Public read (they're shown in
-- the app); write/delete restricted to the authenticated owner's own folder
-- (object path "<user_id>/<file>").
insert into storage.buckets (id, name, public)
values ('venue-photos', 'venue-photos', true)
on conflict (id) do nothing;

drop policy if exists "venue photos public read" on storage.objects;
create policy "venue photos public read" on storage.objects for select
  using (bucket_id = 'venue-photos');

drop policy if exists "owner uploads to own venue folder" on storage.objects;
create policy "owner uploads to own venue folder" on storage.objects for insert
  with check (bucket_id = 'venue-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "owner deletes own venue photos" on storage.objects;
create policy "owner deletes own venue photos" on storage.objects for delete
  using (bucket_id = 'venue-photos' and (storage.foldername(name))[1] = auth.uid()::text);
