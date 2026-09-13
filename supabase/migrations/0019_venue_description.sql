-- Meetap – short free-text description a business can write for their own
-- venue (shown as a richer alternative to the auto-generated "detail" line).
-- Additive; null preserves the existing auto-generated detail text.
alter table public.venues add column if not exists description text;
