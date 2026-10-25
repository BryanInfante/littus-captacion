-- Schedules the registration-confirmation reconciler.
--
-- pg_net is fire and forget: a confirmation whose immediate webhook failed (or
-- never arrived) would stay pending forever. Every five minutes pg_cron asks
-- the db-events group to retry the rows that are still pending after the stale
-- timeout; the retry rule (timeout, attempt cap, 48-hour window) lives in the
-- domain and in the repository query, not here.
--
-- Deploy order: the db-events function (with its reconcile route) must be
-- deployed before this migration is applied. pg_cron must be available in the
-- project (Database > Extensions) for the extension to be created.

create extension if not exists pg_cron;

-- Supports the pending-confirmations query, which only ever looks at unsent
-- rows in creation order.
create index if not exists eccia_taller_inscripciones_confirmation_pending_idx
  on public.eccia_taller_inscripciones (creado_en)
  where confirmation_sent_at is null;

-- Dispatch function: a single call to the shared dispatcher, like the trigger
-- functions. The reconcile route ignores the record id, so none is passed.
create or replace function private.eccia_dispatch_confirmation_reconciliation()
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform private.eccia_post_to_edge_function(
    'db-events/reconcile',
    null,
    'eccia_taller_inscripciones',
    'public'
  );
end;
$function$;

comment on function private.eccia_dispatch_confirmation_reconciliation() is
  'Despacho del reconciliador de confirmaciones: una sola llamada a db-events/reconcile. La invoca pg_cron.';

revoke execute on function private.eccia_dispatch_confirmation_reconciliation()
  from public, anon, authenticated;

-- Idempotent: replace the job if a previous run of this migration created it.
do $schedule$
begin
  if exists (
    select 1 from cron.job
    where jobname = 'eccia-reconcile-registration-confirmations'
  ) then
    perform cron.unschedule('eccia-reconcile-registration-confirmations');
  end if;

  perform cron.schedule(
    'eccia-reconcile-registration-confirmations',
    '*/5 * * * *',
    'select private.eccia_dispatch_confirmation_reconciliation()'
  );
end;
$schedule$;
