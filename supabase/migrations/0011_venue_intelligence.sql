-- Meetap – Venue Intelligence: structured, versioned evidence extracted by an
-- LLM from external reviews (see src/lib/recommend/venue-intelligence.ts for
-- the JS/TS schema this jsonb is expected to satisfy).
--
-- Purely additive: does not touch venues.profile / venues.good_for / any
-- existing column, table, or index. One row per venue (upserted whenever the
-- venue is re-profiled); "version" is the schema version of this row's shape
-- ("v1"), not a history of past profiles.

create table if not exists public.venue_intelligence (
  venue_id            uuid primary key references public.venues(id) on delete cascade,
  version             text not null default 'v1',
  summary             text not null,
  good_for            jsonb not null default '[]',   -- GoodForSignal[]
  aspects             jsonb not null default '{}',   -- Partial<Record<AspectKey, Signal>>
  cautions            jsonb not null default '[]',   -- CautionSignal[]
  overall_confidence  real not null check (overall_confidence between 0 and 1),
  review_count        integer not null default 0,
  review_date_min     date,
  review_date_max     date,
  source_summary      jsonb not null default '{}',   -- e.g. {"tripadvisor": 3}
  generated_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists venue_intelligence_updated_idx on public.venue_intelligence (updated_at desc);

alter table public.venue_intelligence enable row level security;
create policy "venue intelligence is public" on public.venue_intelligence for select using (true);
-- Writes happen with the service role from server-side scripts only (same
-- pattern as venues/venue_external/venue_reviews_external).
