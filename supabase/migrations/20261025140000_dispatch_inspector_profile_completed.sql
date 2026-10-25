-- Dispatch trigger "inspector profile completed".
--
-- For events that require an inspector profile, the profile claim inserts the
-- registration first, so the "registration created" trigger fires before the
-- photo is uploaded and the profile is marked complete. The confirmation use
-- case now treats such a registration as not ready (it sends nothing and spends
-- no attempt). This trigger delivers the other half: when the profile becomes
-- complete it asks db-events to run the same registration confirmation again.
--
-- Same contract as eccia_dispatch_registration_created: a single call to
-- private.eccia_post_to_edge_function, no per-event filter, owner execution with
-- an empty search path, closed to the API roles. The webhook body is the
-- registration id (the confirmation is keyed by registration, not by profile).
--
-- Deploy order: the db-events function with the readiness rule must be
-- deployed before this migration is applied.

create or replace function private.eccia_dispatch_inspector_profile_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.eccia_post_to_edge_function(
    'db-events/registration-created',
    new.inscripcion_id,
    'eccia_taller_inscripciones',
    'public'
  );

  return new;
end;
$function$;

comment on function private.eccia_dispatch_inspector_profile_completed() is
  'Dispatch trigger "ficha de inspector completada": una sola llamada a db-events/registration-created con el id de la inscripción, sin filtro por evento.';

revoke execute on function private.eccia_dispatch_inspector_profile_completed()
  from public, anon, authenticated;

create trigger eccia_dispatch_inspector_profile_completed_after_update
after update of estado on public.eccia_fichas_inspector
for each row
when (old.estado is distinct from new.estado and new.estado = 'completa')
execute function private.eccia_dispatch_inspector_profile_completed();

-- A profile may also be inserted already complete.
create trigger eccia_dispatch_inspector_profile_completed_after_insert
after insert on public.eccia_fichas_inspector
for each row
when (new.estado = 'completa')
execute function private.eccia_dispatch_inspector_profile_completed();
