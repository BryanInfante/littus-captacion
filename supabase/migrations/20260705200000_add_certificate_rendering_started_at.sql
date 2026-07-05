alter table public.eccia_masterclass_certificados
  add column if not exists certificate_rendering_started_at timestamptz;

comment on column public.eccia_masterclass_certificados.certificate_rendering_started_at is
  'Marca de tiempo del inicio del intento de renderizado en curso. Permite detectar certificados atascados en rendering por una caída de plataforma y reintentar automáticamente pasado un umbral, en vez de quedar pendientes para siempre.';
