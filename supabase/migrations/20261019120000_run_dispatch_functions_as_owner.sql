-- Registration inserts by the service role failed with "permission denied for
-- schema private": the dispatch trigger functions ran as the inserting role,
-- which has no usage on schema private (eccia_config, the edge-function
-- caller). They run as their owner instead; search_path is already empty, so
-- every reference stays schema-qualified. Only functions that exist in every
-- environment are listed; UT2 functions were never applied remotely.
alter function private.eccia_post_to_edge_function(text, uuid, text, text)
  security definer;
alter function private.eccia_send_registration_confirmation() security definer;
alter function private.eccia_sync_resend_contact() security definer;

-- Definer functions must not be callable directly by API roles.
revoke execute on function private.eccia_post_to_edge_function(text, uuid, text, text)
  from public, anon, authenticated;
revoke execute on function private.eccia_send_registration_confirmation()
  from public, anon, authenticated;
revoke execute on function private.eccia_sync_resend_contact()
  from public, anon, authenticated;

-- The UT2 trigger functions exist only where the unapplied UT2 migrations ran
-- (local stacks). Align them too while they exist; F2 replaces them.
do $$
declare
  fn regprocedure;
begin
  foreach fn in array array[
    to_regprocedure('private.eccia_ficha_crea_inscripcion()'),
    to_regprocedure('private.eccia_send_ut2_registration_confirmation()')
  ] loop
    if fn is not null then
      execute format('alter function %s security definer', fn);
      execute format(
        'revoke execute on function %s from public, anon, authenticated',
        fn
      );
    end if;
  end loop;
end;
$$;
