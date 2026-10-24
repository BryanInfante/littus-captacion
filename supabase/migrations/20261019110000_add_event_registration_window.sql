-- Registration eligibility is event data, not a per-event function or flag.
-- No defaults or backfill: existing events must remain closed until an
-- operator explicitly sets an opening after the abuse protections are ready.
alter table public.eccia_eventos
  add column inscripcion_abre_en timestamptz,
  add column inscripcion_cierra_en timestamptz,
  add constraint eccia_eventos_inscripcion_ventana_check
    check (
      inscripcion_abre_en is null
      or inscripcion_cierra_en is null
      or inscripcion_cierra_en > inscripcion_abre_en
    );
