create table if not exists public.eccia_masterclass_certificados (
  id uuid primary key default gen_random_uuid(),
  nombre_completo text not null,
  correo text not null,
  masterclass_codigo text not null default 'ultrasonido-industrial-scan-a',
  creado_en timestamptz not null default now(),
  constraint eccia_masterclass_certificados_nombre_completo_check
    check (
      char_length(btrim(nombre_completo)) between 5 and 160
      and btrim(nombre_completo) ~ '\s'
    ),
  constraint eccia_masterclass_certificados_correo_check
    check (
      correo = lower(btrim(correo))
      and correo ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    )
);

comment on table public.eccia_masterclass_certificados is
  'Registro operativo de nombres completos para regalos y certificados de la masterclass ECCIA.';
comment on column public.eccia_masterclass_certificados.nombre_completo is
  'Nombre completo declarado por el participante para emisión del certificado.';
comment on column public.eccia_masterclass_certificados.correo is
  'Correo de inscripción declarado por el participante para cruzar identidad operativa.';

alter table public.eccia_masterclass_certificados enable row level security;

grant insert on table public.eccia_masterclass_certificados to anon;
grant select, insert, update, delete on table public.eccia_masterclass_certificados to service_role;

drop policy if exists "Permitir registro público de nombres para certificados"
  on public.eccia_masterclass_certificados;

create policy "Permitir registro público de nombres para certificados"
  on public.eccia_masterclass_certificados
  for insert
  to anon
  with check (true);
