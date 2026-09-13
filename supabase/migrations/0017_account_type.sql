-- Meetap – account type (personal vs restaurant/business) + auto-provision a
-- profiles row on signup. Purely additive: no existing column, table, policy,
-- or trigger is touched.

alter table public.profiles
  add column if not exists account_type text not null default 'personal'
    check (account_type in ('personal', 'business'));
alter table public.profiles
  add column if not exists business_name text;

-- profiles.id has no default and "own profile" RLS requires auth.uid() = id,
-- which isn't set yet during the signup insert trigger — so provisioning the
-- row has to happen as a security-definer function that runs as the owner.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, account_type, business_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    coalesce(new.raw_user_meta_data ->> 'account_type', 'personal'),
    new.raw_user_meta_data ->> 'business_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
