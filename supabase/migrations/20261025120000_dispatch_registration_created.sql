-- Replaces the legacy registration-confirmation trigger with the single
-- dispatch trigger for the "registration created" event.
--
-- The legacy trigger (20260904120000, scoped by 20260921190000 with a WHEN
-- clause on taller_codigo = 'domina-scan-a') called the per-workshop
-- send-registration-confirmation function. Confirmation is now one generic use
-- case in the db-events group, parameterized by the event row, so the trigger
-- carries no per-event filter: a new webinar or course is a row, not a trigger.
--
-- Deploy order: the db-events function must be deployed (with its secrets)
-- before this migration is applied, otherwise registrations are stored but
-- their confirmation call is rejected until the function exists.
--
-- sync-resend-contact keeps its own trigger; it moves in a later task.

drop trigger if exists eccia_send_registration_confirmation_after_insert
  on public.eccia_taller_inscripciones;

drop function if exists private.eccia_send_registration_confirmation();

create or replace function private.eccia_dispatch_registration_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.eccia_post_to_edge_function(
    'db-events/registration-created',
    new.id,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA
  );

  return new;
end;
$function$;

comment on function private.eccia_dispatch_registration_created() is
  'Dispatch trigger "inscripción creada": una sola llamada a db-events/registration-created, sin filtro por evento.';

revoke execute on function private.eccia_dispatch_registration_created()
  from public, anon, authenticated;

create trigger eccia_dispatch_registration_created_after_insert
after insert on public.eccia_taller_inscripciones
for each row
execute function private.eccia_dispatch_registration_created();
