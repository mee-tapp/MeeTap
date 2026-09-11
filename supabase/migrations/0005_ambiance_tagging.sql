-- Meetap – bookkeeping for LLM ambiance tagging and soft deactivation.
alter table public.venues add column if not exists ambiance_tagged_at timestamptz;
alter table public.venues add column if not exists deactivated_reason text;
alter table public.venues add column if not exists llm_notes text;
create index if not exists venues_untagged_idx on public.venues (city) where ambiance_tagged_at is null and is_active;
