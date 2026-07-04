alter table public.eccia_masterclass_certificados
  add column if not exists codigo_certificado text,
  add column if not exists certificate_status text not null default 'pending',
  add column if not exists registration_id uuid references public.eccia_taller_inscripciones(id),
  add column if not exists validation_url text,
  add column if not exists nextcloud_path text,
  add column if not exists public_certificate_url text,
  add column if not exists certificate_generated_at timestamptz,
  add column if not exists certificate_uploaded_at timestamptz,
  add column if not exists certificate_emailed_at timestamptz,
  add column if not exists certificate_resend_email_id text,
  add column if not exists certificate_error text,
  add column if not exists certificate_attempts integer not null default 0;

alter table public.eccia_masterclass_certificados
  drop constraint if exists eccia_masterclass_certificados_codigo_certificado_key,
  add constraint eccia_masterclass_certificados_codigo_certificado_key
    unique (codigo_certificado);

alter table public.eccia_masterclass_certificados
  drop constraint if exists eccia_masterclass_certificados_correo_masterclass_key,
  add constraint eccia_masterclass_certificados_correo_masterclass_key
    unique (correo, masterclass_codigo);

alter table public.eccia_masterclass_certificados
  drop constraint if exists eccia_masterclass_certificados_status_check,
  add constraint eccia_masterclass_certificados_status_check
    check (
      certificate_status in (
        'pending',
        'rendering',
        'uploaded',
        'emailed',
        'failed'
      )
    );

alter table public.eccia_masterclass_certificados
  drop constraint if exists eccia_masterclass_certificados_error_length_check,
  add constraint eccia_masterclass_certificados_error_length_check
    check (certificate_error is null or char_length(certificate_error) <= 500);

create index if not exists eccia_masterclass_certificados_codigo_idx
  on public.eccia_masterclass_certificados (codigo_certificado)
  where codigo_certificado is not null;

create index if not exists eccia_masterclass_certificados_status_idx
  on public.eccia_masterclass_certificados (certificate_status);

comment on column public.eccia_masterclass_certificados.codigo_certificado is
  'CÃ³digo pÃºblico, Ãºnico y no secuencial usado para validar el certificado.';
comment on column public.eccia_masterclass_certificados.certificate_status is
  'Estado operativo de emisiÃ³n del certificado.';
comment on column public.eccia_masterclass_certificados.nextcloud_path is
  'Ruta WebDAV del PDF generado en Nextcloud.';
comment on column public.eccia_masterclass_certificados.validation_url is
  'URL pÃºblica codificada en el QR del certificado.';

