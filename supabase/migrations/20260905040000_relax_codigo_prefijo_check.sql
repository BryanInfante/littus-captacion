-- Relaxes the certificate code prefix so it is not tied to the ECCIA brand.
--
-- 20260905020000 constrained codigo_prefijo to '^ECCIA-[A-Z0-9]{2,6}-$', which
-- assumed every course would issue codes under the ECCIA name. That assumption
-- was wrong: ECCIA is an internal brand that means nothing to whoever receives
-- a certificate, so some courses are issued under a different mark.
--
-- The shape is still enforced (uppercase letters, a segment, trailing hyphen)
-- because the prefix is concatenated with a random suffix to build the public
-- code, and a malformed prefix would produce codes that no longer look like
-- codes. Only the hardcoded brand is gone.

alter table public.eccia_eventos
  drop constraint if exists eccia_eventos_codigo_prefijo_check;

alter table public.eccia_eventos
  add constraint eccia_eventos_codigo_prefijo_check
  check (codigo_prefijo ~ '^[A-Z]{2,8}-[A-Z0-9]{2,6}-$');

comment on column public.eccia_eventos.codigo_prefijo is
  'Prefijo del código de certificado, por ejemplo ECCIA-UT1- o LEYV-PMM-. La marca es por curso; debe terminar en guion.';
