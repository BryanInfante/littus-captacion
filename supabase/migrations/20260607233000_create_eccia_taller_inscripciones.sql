-- Creation migration for public.eccia_taller_inscripciones.
--
-- This table was originally created by hand (SQL editor / dashboard) and never
-- captured as a migration, so the repository could not build a fresh database:
-- 20260621173138 alters this table and 20260704120000 declares a foreign key
-- against it, and both fail against an empty schema. The timestamp deliberately
-- predates 20260621173138 to restore the real ordering.
--
-- The DDL below is NOT reconstructed. It was recovered verbatim from
-- C:\Users\bryan\backup_supabase.dump, a pg_dump custom-format backup taken
-- 2026-07-25 13:06:08, roughly two hours before
-- 20260725201428_wipe_public_schema_for_persisto_staging ran
-- `DROP SCHEMA public CASCADE`. See RECOVERY.md.
--
-- The confirmation_* columns and their CHECK are intentionally absent here:
-- 20260621173138 adds them, and keeping that split preserves the real history.

-- Supabase does not provision this schema; 20260621173138 already assumes it
-- exists, so it is created here (the earliest ECCIA migration) instead.
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists public.eccia_taller_inscripciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  correo text not null,
  taller_codigo text not null default 'domina-scan-a',
  creado_en timestamptz not null default now(),
  marketing_consent boolean not null default false,
  -- Generated, not trigger-maintained: the consent timestamp can never diverge
  -- from the row it belongs to, and the browser cannot forge it.
  marketing_consented_at timestamptz generated always as (
    case when marketing_consent then creado_en else null end
  ) stored,
  resend_contact_id text,
  resend_synced_at timestamptz,
  resend_sync_error text,
  constraint eccia_taller_inscripciones_nombre_check
    check (char_length(btrim(nombre)) >= 2 and char_length(btrim(nombre)) <= 120),
  constraint eccia_taller_inscripciones_correo_check
    check (
      char_length(btrim(correo)) >= 6
      and char_length(btrim(correo)) <= 254
      and correo ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    ),
  constraint eccia_taller_inscripciones_taller_codigo_check
    check (char_length(btrim(taller_codigo)) >= 3 and char_length(btrim(taller_codigo)) <= 80),
  constraint eccia_taller_inscripciones_resend_sync_error_length
    check (resend_sync_error is null or char_length(resend_sync_error) <= 500)
);

-- One registration per email per workshop. public/app.js:170 relies on this:
-- it maps 409 / SQLSTATE 23505 to "este correo ya está registrado".
create unique index if not exists eccia_taller_inscripciones_correo_taller_uidx
  on public.eccia_taller_inscripciones (lower(btrim(correo)), taller_codigo);

comment on table public.eccia_taller_inscripciones is
  'Inscripciones al taller ECCIA capturadas desde el formulario público.';
comment on column public.eccia_taller_inscripciones.taller_codigo is
  'Código del taller al que corresponde la inscripción.';

alter table public.eccia_taller_inscripciones enable row level security;

create policy publico_puede_registrar_inscripcion_eccia
  on public.eccia_taller_inscripciones
  for insert
  to authenticated, anon
  with check (
    taller_codigo = 'domina-scan-a'
    and char_length(btrim(nombre)) >= 2
    and char_length(btrim(nombre)) <= 120
    and char_length(btrim(correo)) >= 6
    and char_length(btrim(correo)) <= 254
  );

-- RECONSTRUCTED, not recovered: the backup was taken without ACLs (it contains
-- zero GRANT statements), so the original column-level privileges could not be
-- read back. This restores the invariant documented in CLAUDE.md — public roles
-- insert only, on an explicit column allow-list — so everything else
-- (timestamps, Resend tracking, confirmation state) stays writable only by the
-- service role used by the Edge Functions.
revoke all on table public.eccia_taller_inscripciones from anon, authenticated;
grant insert (nombre, correo, taller_codigo, marketing_consent)
  on table public.eccia_taller_inscripciones to anon, authenticated;
grant select, insert, update, delete
  on table public.eccia_taller_inscripciones to service_role;
