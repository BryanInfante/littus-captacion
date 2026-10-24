-- Local development data only: `supabase db reset` loads this file after the
-- migrations. Production event rows are operator data loaded with the service
-- role and recorded in PLAN-FUNNEL.md (FN-02-08), never through this file or a
-- migration.

-- Mirrors the production row of the course: active and listed in the public
-- catalog, with no registration window, so it stays closed. No certificate
-- prefix: certgen issues END course certificates.
insert into public.eccia_eventos (
  masterclass_codigo,
  event_title,
  tipo,
  resumen,
  fecha_texto,
  fecha_evento,
  duracion,
  activo,
  requiere_ficha_inspector
)
values (
  'ultrasonido-nivel-ii',
  'Ultrasonido Convencional Nivel II',
  'curso',
  'Curso de Ultrasonido Convencional Nivel II.',
  'Del 17 al 25 de octubre de 2026',
  '2026-10-17',
  '40 horas',
  true,
  true
)
on conflict (masterclass_codigo) do nothing;

-- Local-only event with an open window and no close, so registrations through
-- a locally served public-api succeed. It never exists in production.
insert into public.eccia_eventos (
  masterclass_codigo,
  event_title,
  tipo,
  resumen,
  fecha_texto,
  codigo_prefijo,
  activo,
  inscripcion_abre_en
)
values (
  'prueba-local',
  'Evento de prueba local',
  'webinar',
  'Evento abierto solo en el entorno local para probar la inscripción.',
  'Fecha de prueba',
  'ECCIA-PRUEBA-',
  true,
  '2026-01-01T00:00:00Z'
)
on conflict (masterclass_codigo) do nothing;
