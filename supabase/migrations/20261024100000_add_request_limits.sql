-- FN-02-05b: request limits for public endpoints with side effects. Rows hold
-- only a keyed HMAC-SHA-256 digest computed by the Edge Function (never an
-- email or IP), the attempt count, and the end of a fixed window that starts
-- at the first attempt. API roles never touch the table: service_role consumes
-- a key through eccia_consumir_limite, which runs as its owner.
create table public.eccia_limites_solicitud (
  clave_hash text primary key
    constraint eccia_limites_solicitud_clave_hash_check
    check (clave_hash ~ '^[a-f0-9]{64}$'),
  intentos integer not null
    constraint eccia_limites_solicitud_intentos_check check (intentos >= 1),
  vence_en timestamptz not null
);

-- Serves the expired-row cleanup that runs on every consumption.
create index eccia_limites_solicitud_vence_en_idx
  on public.eccia_limites_solicitud (vence_en);

-- No policies on purpose: only the definer function reads or writes rows.
alter table public.eccia_limites_solicitud enable row level security;

-- New tables are already born closed (20261018130000); this keeps the
-- invariant explicit for this table whatever the default privileges become.
revoke all on table public.eccia_limites_solicitud
  from public, anon, authenticated;

create function public.eccia_consumir_limite(
  p_clave_hash text,
  p_limite integer,
  p_ventana_segundos integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Database time only: a caller cannot move a window with its own clock.
  v_ahora timestamptz := clock_timestamp();
  v_intentos integer;
  v_vence_en timestamptz;
begin
  if p_clave_hash is null or p_clave_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid request limit key' using errcode = '22023';
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 10000 then
    raise exception 'invalid request limit' using errcode = '22023';
  end if;
  if p_ventana_segundos is null or p_ventana_segundos < 1
    or p_ventana_segundos > 86400 then
    raise exception 'invalid request limit window' using errcode = '22023';
  end if;

  -- Expired windows release their digests on the next consumption instead of
  -- being retained indefinitely. Rows locked by a concurrent call are left for
  -- a later one; the upsert below resets an expired window by itself.
  delete from public.eccia_limites_solicitud
  where clave_hash in (
    select expirado.clave_hash
    from public.eccia_limites_solicitud expirado
    where expirado.vence_en <= v_ahora
    for update skip locked
  );

  -- One statement decides under the row lock, so concurrent consumers cannot
  -- exceed the budget. Rejections neither extend the window nor grow the
  -- counter past limit + 1.
  insert into public.eccia_limites_solicitud as limite
    (clave_hash, intentos, vence_en)
  values (
    p_clave_hash,
    1,
    v_ahora + make_interval(secs => p_ventana_segundos)
  )
  on conflict (clave_hash) do update
  set intentos = case
        when limite.vence_en <= v_ahora then 1
        else least(limite.intentos + 1, p_limite + 1)
      end,
      vence_en = case
        when limite.vence_en <= v_ahora then excluded.vence_en
        else limite.vence_en
      end
  returning limite.intentos, limite.vence_en into v_intentos, v_vence_en;

  if v_intentos <= p_limite then
    return query select true, 0;
  else
    -- Whole seconds, rounded up, never zero: the HTTP Retry-After value.
    return query select false, greatest(
      1,
      ceil(extract(epoch from v_vence_en - v_ahora))::integer
    );
  end if;
end;
$$;

-- Definer functions must not be callable directly by the public API roles;
-- the platform's default privileges grant execute on new functions to them.
revoke all on function public.eccia_consumir_limite(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.eccia_consumir_limite(text, integer, integer)
  to service_role;
