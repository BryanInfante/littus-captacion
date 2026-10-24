-- Preserve historical END registrations before enforcing event references.
-- Titles and certificate prefixes are provisional, derived from course codes.
-- Dates and duration are unknown and deliberately remain NULL.
do $$
begin
  if exists (
    select 1
    from public.eccia_eventos e
    join (values
      ('end-vt-pt-mt-2026-09', 'ECCIA-END09-'),
      ('end-vt-ii-pt-ii-ut-i-2026-10', 'ECCIA-END10-')
    ) proposed(code, prefix) on e.codigo_prefijo = proposed.prefix
    where e.masterclass_codigo <> proposed.code
  ) then
    raise exception 'Provisional END certificate prefix already belongs to another event; select an unused prefix before retrying.';
  end if;
end;
$$;

insert into public.eccia_eventos (
  masterclass_codigo, event_title, codigo_prefijo, activo,
  fecha_evento, fecha_texto, duracion
) values
  (
    'end-vt-pt-mt-2026-09',
    'Curso END VT/PT/MT (septiembre 2026)',
    'ECCIA-END09-', false, null, null, null
  ),
  (
    'end-vt-ii-pt-ii-ut-i-2026-10',
    'Curso END VT II/PT II/UT I (octubre 2026)',
    'ECCIA-END10-', false, null, null, null
  )
on conflict (masterclass_codigo) do nothing;
