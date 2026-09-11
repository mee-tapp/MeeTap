-- Meetap – public reviews ("Be the first to review", then anyone can post).
-- Reviews are written through a server function (service role) so we can
-- rate-limit and moderate; reading is public.

create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  venue_id     uuid not null references public.venues(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,
  author_name  text not null default 'Guest',
  rating       smallint not null check (rating between 1 and 5),
  comment      text,
  session_id   text,
  created_at   timestamptz not null default now()
);
create index if not exists reviews_venue_idx on public.reviews (venue_id, created_at desc);

alter table public.reviews enable row level security;
drop policy if exists "reviews are public" on public.reviews;
create policy "reviews are public" on public.reviews for select using (true);

-- Rating rollup now comes from reviews (visits keep their own rating for History).
create or replace function public.refresh_venue_rating_from_reviews() returns trigger language plpgsql as $$
declare
  vid uuid := coalesce(new.venue_id, old.venue_id);
begin
  update public.venues v
     set rating_avg   = s.avg_rating,
         rating_count = s.cnt,
         updated_at   = now()
    from (
      select avg(rating)::numeric(3,2) as avg_rating, count(*)::int as cnt
        from public.reviews where venue_id = vid
    ) s
   where v.id = vid;
  return null;
end $$;

drop trigger if exists reviews_rating_rollup on public.reviews;
create trigger reviews_rating_rollup
after insert or update or delete on public.reviews
for each row execute function public.refresh_venue_rating_from_reviews();

drop trigger if exists visits_rating_rollup on public.visits;
