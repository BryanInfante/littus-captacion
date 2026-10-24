-- Authenticate database-to-Edge-Function dispatches with the secret also
-- required by the current receivers. Missing configuration fails closed.
create or replace function private.eccia_post_to_edge_function(
  function_slug text,
  record_id uuid,
  table_name text,
  schema_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  base_url text;
  webhook_secret text;
begin
  select value into webhook_secret
  from private.eccia_config
  where key = 'webhook_secret';

  if webhook_secret is null or btrim(webhook_secret, E' \t\n\r') = '' then
    raise warning
      'ECCIA: private.eccia_config has no webhook_secret; skipping call to %. Registration was stored, but no notification was sent.',
      function_slug;
    return;
  end if;

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
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-eccia-webhook-secret', btrim(webhook_secret, E' \t\n\r')
    ),
    timeout_milliseconds := 5000
  );
end;
$function$;

comment on function private.eccia_post_to_edge_function(text, uuid, text, text) is
  'Dispara webhooks ECCIA con el secreto compartido requerido por los receptores.';

revoke execute on function private.eccia_post_to_edge_function(text, uuid, text, text)
  from public, anon, authenticated;
