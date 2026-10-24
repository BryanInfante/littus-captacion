-- Unify the webinar key before enforcing event references, without losing rows.
do $$
declare
  source_before bigint;
  target_before bigint;
  moved bigint;
begin
  -- Keep the collision check and update consistent with concurrent writers.
  lock table public.eccia_taller_inscripciones in share row exclusive mode;

  select count(*) into source_before
  from public.eccia_taller_inscripciones
  where taller_codigo = 'domina-scan-a';

  select count(*) into target_before
  from public.eccia_taller_inscripciones
  where taller_codigo = 'ultrasonido-industrial-scan-a';

  if exists (
    select 1
    from public.eccia_taller_inscripciones source
    join public.eccia_taller_inscripciones target
      on lower(btrim(source.correo)) = lower(btrim(target.correo))
    where source.taller_codigo = 'domina-scan-a'
      and target.taller_codigo = 'ultrasonido-industrial-scan-a'
  ) then
    raise exception using
      errcode = '23505',
      message = 'Cannot move Scan A registrations: the same normalized email exists under both event codes. Resolve duplicates explicitly; no rows were changed.';
  end if;

  update public.eccia_taller_inscripciones
  set taller_codigo = 'ultrasonido-industrial-scan-a'
  where taller_codigo = 'domina-scan-a';
  get diagnostics moved = row_count;

  raise notice 'Scan A registrations: legacy before=%, canonical before=%, moved=%, legacy after=0, canonical after=%',
    source_before, target_before, moved, target_before + moved;
end;
$$;
