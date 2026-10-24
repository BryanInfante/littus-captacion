-- Inspector profiles are captured with the event registration. The private
-- profile table keeps certificate-specific data out of the general funnel.
alter table public.eccia_eventos
  add column requiere_ficha_inspector boolean not null default false;

create or replace view public.eccia_eventos_publicos
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
  inscripcion_cierra_en,
  requiere_ficha_inspector
from public.eccia_eventos
where activo = true;

revoke all on table public.eccia_eventos_publicos
  from public, anon, authenticated;
grant select on table public.eccia_eventos_publicos to anon;

create table public.eccia_fichas_inspector (
  id uuid primary key default gen_random_uuid(),
  masterclass_codigo text not null
    references public.eccia_eventos (masterclass_codigo) on delete cascade,
  inscripcion_id uuid not null unique
    references public.eccia_taller_inscripciones (id) on delete cascade,
  nombres text not null,
  apellidos text not null,
  nombre_completo text not null,
  documento text not null,
  correo text not null,
  pais text not null,
  experiencia_anios integer not null,
  empleador_declarado text,
  sin_empleador boolean not null default false,
  consentimiento_datos_en timestamptz not null,
  estado text not null default 'pendiente_foto',
  foto_path text not null,
  creado_en timestamptz not null default now(),
  constraint eccia_fichas_inspector_nombres_check check (
    nombres = upper(btrim(nombres)) and char_length(nombres) between 2 and 60
  ),
  constraint eccia_fichas_inspector_apellidos_check check (
    apellidos = upper(btrim(apellidos)) and char_length(apellidos) between 2 and 60
  ),
  constraint eccia_fichas_inspector_nombre_completo_check check (
    nombre_completo = apellidos || ' ' || nombres
    and nombre_completo = upper(btrim(nombre_completo))
    and char_length(nombre_completo) between 5 and 60
  ),
  constraint eccia_fichas_inspector_documento_check check (
    documento = upper(btrim(documento))
    and documento ~ '^[0-9A-Z-]{6,20}$'
  ),
  constraint eccia_fichas_inspector_correo_check check (
    char_length(btrim(correo)) between 6 and 254
    and correo ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ),
  constraint eccia_fichas_inspector_pais_check check (
    pais = btrim(pais) and char_length(pais) between 2 and 60
  ),
  constraint eccia_fichas_inspector_experiencia_check check (
    experiencia_anios between 0 and 60
  ),
  constraint eccia_fichas_inspector_empleador_check check (
    (sin_empleador and empleador_declarado is null)
    or (not sin_empleador and empleador_declarado is not null
      and empleador_declarado = btrim(empleador_declarado)
      and char_length(empleador_declarado) between 2 and 120)
  ),
  constraint eccia_fichas_inspector_estado_check check (
    estado in ('pendiente_foto', 'completa')
  ),
  constraint eccia_fichas_inspector_foto_path_check check (
    foto_path ~ '^[A-Za-z0-9_-]+( [A-Za-z0-9_-]+)*(/[A-Za-z0-9_-]+( [A-Za-z0-9_-]+)*)*/inscripciones/[a-z0-9-]+/fotos/[0-9A-Z-]+_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$'
  ),
  constraint eccia_fichas_inspector_evento_documento_key
    unique (masterclass_codigo, documento)
);

alter table public.eccia_fichas_inspector enable row level security;
revoke all on table public.eccia_fichas_inspector
  from public, anon, authenticated;
grant select, insert, update, delete on table public.eccia_fichas_inspector
  to service_role;

create or replace function private.eccia_ficha_crea_inscripcion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.eccia_taller_inscripciones
    (nombre, correo, taller_codigo, marketing_consent)
  values
    (new.nombre_completo, btrim(new.correo), new.masterclass_codigo, false)
  returning id into new.inscripcion_id;
  return new;
end;
$$;

revoke all on function private.eccia_ficha_crea_inscripcion()
  from public, anon, authenticated;

create trigger eccia_ficha_crea_inscripcion_before_insert
before insert on public.eccia_fichas_inspector
for each row execute function private.eccia_ficha_crea_inscripcion();

update public.eccia_eventos
set requiere_ficha_inspector = true
where masterclass_codigo = 'ultrasonido-nivel-ii';
