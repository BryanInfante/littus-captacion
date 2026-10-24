-- Validate historical registrations only after their keys and events are fixed.
alter table public.eccia_taller_inscripciones
  validate constraint eccia_taller_inscripciones_evento_fkey;
