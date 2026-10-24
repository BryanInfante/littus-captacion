-- Closes public access to the certificate table and stops new public tables
-- from being born open. Forward-only and idempotent: revoking an absent
-- privilege and dropping an absent policy are no-ops. Rows are not touched.
--
-- Root cause: the platform's default privileges in schema public (owners
-- postgres and supabase_admin) grant every table privilege to anon and
-- authenticated on each new table. eccia_taller_inscripciones and eccia_eventos
-- revoked them explicitly; 20260703145000 did not, and on top of that granted
-- INSERT to anon with a `with check (true)` policy, so anyone holding the
-- publishable key could insert a certificate that validates.

-- Revoking a table privilege also revokes the same privilege on every column,
-- so this clears both levels. service_role keeps its explicit grants.
revoke all on table public.eccia_masterclass_certificados from anon, authenticated;

drop policy if exists "Permitir registro público de nombres para certificados"
  on public.eccia_masterclass_certificados;

-- Migrations run as postgres, so this closes the defaults for every table a
-- migration creates. postgres cannot alter supabase_admin's defaults; tables
-- are never created as supabase_admin here, and the ratchet test checks the
-- resulting privileges of every table, whoever owns it.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
