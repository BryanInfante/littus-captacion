-- DU-02 routes registrations through public-api after challenge and throttling.
alter table public.eccia_taller_inscripciones
  alter column taller_codigo drop default;

revoke insert (nombre, correo, taller_codigo, marketing_consent)
  on table public.eccia_taller_inscripciones from anon, authenticated;

drop policy if exists publico_puede_registrar_inscripcion_eccia
  on public.eccia_taller_inscripciones;

-- Retire the legacy-code dispatch rather than silently leaving it unmatched.
-- F3 replaces dispatch with the generic authenticated db-events pipeline;
-- keep the function for that cleanup and leave UT2 dispatch/integrity intact.
drop trigger if exists eccia_send_registration_confirmation_after_insert
  on public.eccia_taller_inscripciones;

-- Enforce new writes now; scan existing rows in the following migration.
alter table public.eccia_taller_inscripciones
  add constraint eccia_taller_inscripciones_evento_fkey
  foreign key (taller_codigo)
  references public.eccia_eventos (masterclass_codigo)
  not valid;
