-- Meetap – optional licensed photo per venue (Google Places Photos, matched
-- and fetched via scripts/enrich/google-photos-pilot.mjs). Purely additive:
-- two new nullable columns on venues, nothing else touched. NULL = no photo
-- yet, which is the current state for every existing row.
alter table public.venues add column if not exists photo_url text;
alter table public.venues add column if not exists photo_attribution text;
