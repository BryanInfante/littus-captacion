-- codigo_prefijo is the code prefix of the participation certificates this
-- system issues (issue-certificate). END course certificates are issued by
-- certgen with its own numbering, so a course event has no prefix here; the
-- course certificate is optional per event. The format check still applies to
-- every non-null value.
alter table public.eccia_eventos
  alter column codigo_prefijo drop not null;

comment on column public.eccia_eventos.codigo_prefijo is
  'Prefijo del código de los certificados de participación que emite este sistema. Nulo cuando el sistema no emite certificados para el evento (cursos END certificados por certgen).';

-- 20261019100100 gave the two past END courses invented prefixes. Idempotent:
-- it only clears the values that migration wrote.
update public.eccia_eventos
set codigo_prefijo = null
where (masterclass_codigo, codigo_prefijo) in (
  ('end-vt-pt-mt-2026-09', 'ECCIA-END09-'),
  ('end-vt-ii-pt-ii-ut-i-2026-10', 'ECCIA-END10-')
);
