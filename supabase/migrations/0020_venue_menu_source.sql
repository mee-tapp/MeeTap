-- Meetap – simplest way for a business to attach their menu: a link to an
-- existing online menu, or an uploaded PDF. Additive; menu_items (0018)
-- stays in place for a future itemized view but isn't required.
alter table public.venues add column if not exists menu_url text;
alter table public.venues add column if not exists menu_pdf_url text;
