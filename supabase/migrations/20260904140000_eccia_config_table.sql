-- Replaces the app.eccia_functions_base_url GUC with a config table.
--
-- 20260904120000 read the Edge Function base URL from
-- current_setting('app.eccia_functions_base_url'), which assumed the value
-- could be installed with `alter database ... set`. On Supabase it cannot:
-- both `alter database postgres set` and `alter role postgres set` fail with
-- 42501 permission denied, because the platform does not grant superuser.
--
-- A table in `private` needs no elevated privileges, is visible to anyone
-- debugging the triggers, and still keeps the project ref out of the function
-- body — which was the original point, since hardcoding it is what made the
-- schema non-portable and left dead URLs behind after the 2026-07-25 move.
--
-- current_setting() is kept as a fallback so a local or self-hosted database
-- that *can* set the GUC keeps working.

create table if not exists private.eccia_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

comment on table private.eccia_config is
  'Configuración de los triggers ECCIA. En `private`, nunca expuesta por PostgREST.';

revoke all on table private.eccia_config from anon, authenticated;
grant select on table private.eccia_config to service_role;

create or replace function private.eccia_post_to_edge_function(
  function_slug text,
  record_id uuid,
  table_name text,
  schema_name text
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  base_url text;
begin
  select value into base_url
  from private.eccia_config
  where key = 'functions_base_url';

  if base_url is null or btrim(base_url) = '' then
    base_url := current_setting('app.eccia_functions_base_url', true);
  end if;

  if base_url is null or btrim(base_url) = '' then
    raise warning
      'ECCIA: private.eccia_config has no functions_base_url; skipping call to %. Registration was stored, but no notification was sent.',
      function_slug;
    return;
  end if;

  perform net.http_post(
    url := rtrim(base_url, '/') || '/' || function_slug,
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', table_name,
      'schema', schema_name,
      'record', jsonb_build_object('id', record_id)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 5000
  );
end;
$function$;

comment on function private.eccia_post_to_edge_function(text, uuid, text, text) is
  'Dispara un webhook de Edge Function ECCIA usando la URL base de private.eccia_config.';
