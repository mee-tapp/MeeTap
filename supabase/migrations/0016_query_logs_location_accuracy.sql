-- Browser-reported accuracy (metres) of the user location used for a search.
-- Lets us tell a real GPS fix from an ISP-level guess when a user reports
-- "everything is far from me". Null when the city centre was used.
alter table public.query_logs add column if not exists user_location_accuracy_m double precision;
