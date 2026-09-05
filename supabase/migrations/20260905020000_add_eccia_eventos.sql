-- Per-event certificate metadata, so certificates from every course validate
-- correctly and permanently.
--
-- Until now these values were hardcoded in two places: validate-certificate
-- returned a fixed event_title/duration/event_date for ANY code, and
-- issue-certificate baked the title, description, duration, date, certificate
-- code prefix and Nextcloud folder into the source. A certificate from a second
-- course would have validated as "Seminario de Ultrasonido Industrial Nivel I".
--
-- Moving this to a table means adding a course is an INSERT, not a deploy, and
-- an old certificate keeps reporting the course it was actually issued for even
-- after new courses exist.

create table if not exists public.eccia_eventos (
  masterclass_codigo text primary key,
  event_title text not null,
  -- The PDF renders the title as two fixed lines (issue-certificate draws them
  -- separately at different baselines), so the split is stored rather than
  -- guessed at render time.
  event_title_linea_1 text,
  event_title_linea_2 text,
  descripcion text,
  duracion text,
  -- Human-readable date shown on the certificate and the validation page. Kept
  -- separate from fecha_evento so wording stays under editorial control.
  fecha_texto text,
  fecha_evento date,
  codigo_prefijo text not null,
  nextcloud_directorio text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  constraint eccia_eventos_codigo_prefijo_check
    check (codigo_prefijo ~ '^ECCIA-[A-Z0-9]{2,6}-$')
);

comment on table public.eccia_eventos is
  'Metadatos por curso para emisión y validación de certificados. Agregar un curso es un INSERT, no un despliegue.';
comment on column public.eccia_eventos.codigo_prefijo is
  'Prefijo del código de certificado, por ejemplo ECCIA-UT1-. Debe terminar en guion.';
comment on column public.eccia_eventos.fecha_texto is
  'Fecha tal como se muestra al validar y en el PDF. Se mantiene aparte de fecha_evento para conservar el control editorial de la redacción.';

alter table public.eccia_eventos enable row level security;

-- No policies: only the service role used by the Edge Functions reads this.
-- Public roles get nothing, not even select.
revoke all on table public.eccia_eventos from anon, authenticated;
grant select on table public.eccia_eventos to service_role;

-- Certificates issued manually (designed outside the platform, e.g. in Canva)
-- still need a validatable record. They have no Nextcloud PDF, so 'uploaded'
-- and 'emailed' would both be false claims about what the pipeline did.
alter table public.eccia_masterclass_certificados
  drop constraint if exists eccia_masterclass_certificados_status_check,
  add constraint eccia_masterclass_certificados_status_check
    check (
      certificate_status in (
        'pending',
        'rendering',
        'uploaded',
        'emailed',
        'failed',
        'external'
      )
    );

comment on column public.eccia_masterclass_certificados.certificate_status is
  'Estado operativo de emisión. `external` = certificado emitido fuera de la plataforma: es válido y verificable, pero no tiene PDF en Nextcloud.';

insert into public.eccia_eventos (
  masterclass_codigo, event_title, event_title_linea_1, event_title_linea_2,
  descripcion, duracion, fecha_texto, fecha_evento, codigo_prefijo, nextcloud_directorio
) values
  (
    'ultrasonido-industrial-scan-a',
    'Seminario de Ultrasonido Industrial Nivel I',
    'Seminario de Ultrasonido',
    'Industrial Nivel I',
    'Por su participación en el seminario de Ultrasonido Industrial Nivel I, con enfoque en los fundamentos del ultrasonido y la interpretación del Scan-A.',
    '2h',
    '03 de julio de 2026',
    '2026-07-03',
    'ECCIA-UT1-',
    'masterclass-ultrasonido-nivel-i/2026'
  ),
  (
    'preparador-muestras-metalograficas',
    'PREPARADOR DE MUESTRAS METALOGRÁFICAS',
    'Preparador de Muestras',
    'Metalográficas',
    null,
    '40h',
    '10 de julio de 2026',
    '2026-07-10',
    'ECCIA-PMM-',
    'curso-preparador-muestras-metalograficas/2026'
  )
on conflict (masterclass_codigo) do nothing;

-- Added only after the seed: the 19 certificates already in the table carry
-- 'ultrasonido-industrial-scan-a', so the row above must exist first or this
-- fails. From here on a certificate cannot name a course that does not exist,
-- which is what guarantees it keeps validating with the right title forever.
alter table public.eccia_masterclass_certificados
  drop constraint if exists eccia_masterclass_certificados_evento_fkey;

alter table public.eccia_masterclass_certificados
  add constraint eccia_masterclass_certificados_evento_fkey
  foreign key (masterclass_codigo)
  references public.eccia_eventos (masterclass_codigo)
  on update cascade
  on delete restrict;
