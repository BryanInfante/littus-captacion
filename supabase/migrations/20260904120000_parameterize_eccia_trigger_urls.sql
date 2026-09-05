-- Makes the ECCIA notification triggers portable across Supabase projects and
-- restores the sync-resend-contact trigger, which had never been captured as a
-- migration.
--
-- Two problems this fixes:
--
-- 1. 20260621173138 hardcodes
--    https://qfbhyzynpyqqcpuuibod.supabase.co/functions/v1/... inside the
--    trigger function. That project was wiped and repurposed on 2026-07-25, so
--    the URL is dead. Hardcoding the ref is also what makes the schema
--    non-portable, which is the root lesson of that incident.
--
-- 2. private.eccia_sync_resend_contact and its trigger existed only in the live
--    database, never in a migration. The function body below was recovered with
--    pg_get_functiondef() from the old project before it was decommissioned.
--    Its trigger was lost with the DROP CASCADE and is recreated here.
--
-- REQUIRED ONE-TIME SETUP on every project, run once as owner:
--
--   alter database postgres
--     set app.eccia_functions_base_url = 'https://<project-ref>.supabase.co/functions/v1';
--
-- Then reconnect (the setting is read per-session). Without it the triggers do
-- not fire the HTTP calls: registrations still succeed, but a WARNING is
-- emitted to the Postgres logs. That is deliberate — a misconfiguration must be
-- visible rather than silently dropping confirmation emails.

create extension if not exists pg_net with schema extensions;

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
  base_url text := current_setting('app.eccia_functions_base_url', true);
begin
  if base_url is null or btrim(base_url) = '' then
    raise warning
      'ECCIA: app.eccia_functions_base_url is not set; skipping call to %. Registration was stored, but no notification was sent.',
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
  'Fires an ECCIA Edge Function webhook using the project-agnostic base URL in app.eccia_functions_base_url.';

create or replace function private.eccia_send_registration_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  perform private.eccia_post_to_edge_function(
    'send-registration-confirmation',
    new.id,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA
  );

  return new;
end;
$function$;

-- Recovered verbatim in behaviour from the decommissioned project. Note it does
-- NOT gate on marketing_consent: it always fires, and sync-resend-contact
-- re-reads the row and short-circuits with {status:'skipped', reason:'no_consent'}
-- (sync-resend-contact/index.ts:89). Keep the gate in the function, not here —
-- the function is the single source of truth for consent.
create or replace function private.eccia_sync_resend_contact()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  perform private.eccia_post_to_edge_function(
    'sync-resend-contact',
    new.id,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA
  );

  return new;
end;
$function$;

drop trigger if exists eccia_send_registration_confirmation_after_insert
  on public.eccia_taller_inscripciones;

create trigger eccia_send_registration_confirmation_after_insert
after insert on public.eccia_taller_inscripciones
for each row
execute function private.eccia_send_registration_confirmation();

drop trigger if exists eccia_sync_resend_contact_after_insert
  on public.eccia_taller_inscripciones;

create trigger eccia_sync_resend_contact_after_insert
after insert on public.eccia_taller_inscripciones
for each row
execute function private.eccia_sync_resend_contact();
