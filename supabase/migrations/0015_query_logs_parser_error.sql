-- Why the rule parser answered instead of the LLM ("llm_not_configured",
-- "timeout", an HTTP error). Lets us see parser fallbacks in production
-- without server logs. Null when the LLM parsed the sentence.
alter table public.query_logs add column if not exists parser_error text;
