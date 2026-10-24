-- Public event catalog (FN-02-04). The generic registration page
-- (public/inscripcion.html?evento=<masterclass_codigo>) is its first reader.
--
-- tipo and resumen are page content, so they live on the event row. Both are
-- nullable with no default and no backfill: the existing rows predate the
-- catalog, a default would label a course as a webinar (or the reverse), and
-- writing per-event copy into a migration would turn event data into code. The
-- operator fills them when an event is prepared for publication; until then the
-- page shows the event without a type label or summary.
alter table public.eccia_eventos
  add column tipo text,
  add column resumen text,
  add constraint eccia_eventos_tipo_check
    check (tipo in ('webinar', 'curso')),
  -- One descriptive paragraph, stored trimmed so the page renders it as is.
  add constraint eccia_eventos_resumen_check
    check (
      resumen = btrim(resumen)
      and char_length(resumen) between 1 and 600
    );

comment on column public.eccia_eventos.tipo is
  'Tipo de evento mostrado en la página de inscripción: webinar o curso.';
comment on column public.eccia_eventos.resumen is
  'Párrafo descriptivo público de la página de inscripción. No es la redacción del certificado (descripcion).';

-- The only public read of the catalog. It runs with the owner's rights on
-- purpose: with security_invoker anon would need select on the base table,
-- which stays closed. The column list is explicit, so a new column on
-- eccia_eventos never becomes public by accident, and only active events are
-- listed. security_barrier keeps caller-supplied filters from being evaluated
-- on rows the activo predicate hides.
create view public.eccia_eventos_publicos
  with (security_invoker = false, security_barrier = true)
as
select
  masterclass_codigo,
  event_title,
  tipo,
  resumen,
  fecha_texto,
  fecha_evento,
  duracion,
  inscripcion_abre_en,
  inscripcion_cierra_en
from public.eccia_eventos
where activo = true;

comment on view public.eccia_eventos_publicos is
  'Catálogo público de eventos activos, con lista explícita de columnas. Única lectura pública del catálogo.';

-- The site has no signed-in users: browsers hold only the publishable key,
-- which maps to anon, so authenticated gets nothing. The view is read-only for
-- every public role even though a simple view is auto-updatable.
revoke all on table public.eccia_eventos_publicos
  from public, anon, authenticated;
grant select on table public.eccia_eventos_publicos to anon;
