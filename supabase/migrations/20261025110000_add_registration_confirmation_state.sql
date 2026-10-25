-- State for the generic registration confirmation (db-events group) and the
-- event-owned content it renders.
--
-- confirmation_sent_at, confirmation_resend_email_id and confirmation_error
-- already exist (20260621173138) and keep their meaning; confirmation_error
-- holds the last failure code. Only the attempt bookkeeping is new. No
-- constraint ties confirmation_sent_at to the attempt count, because the legacy
-- send-registration-confirmation function still sets it without counting until
-- it is retired.
alter table public.eccia_taller_inscripciones
  add column confirmation_attempts integer not null default 0,
  add column confirmation_last_attempt_at timestamptz,
  add constraint eccia_taller_inscripciones_confirmation_attempts_check
    check (confirmation_attempts >= 0);

comment on column public.eccia_taller_inscripciones.confirmation_attempts is
  'Intentos de envío de la confirmación, exitosos o fallidos. Los incrementa el caso de uso sendRegistrationConfirmation.';
comment on column public.eccia_taller_inscripciones.confirmation_last_attempt_at is
  'Momento del último intento de envío de la confirmación. El reconciliador usa este valor para reintentar filas vencidas.';

-- Copy and links that were hardcoded in the Scan A email template now belong to
-- the event, so a new webinar or course is a row and never new code. All are
-- optional: the template omits what an event does not define. They are not part
-- of eccia_eventos_publicos (explicit column allow-list) and stay private.
alter table public.eccia_eventos
  add column horario_texto text,
  add column modalidad_texto text,
  add column incluye_texto text,
  add column comunidad_url text,
  add column transmision_url text,
  add column aula_url text,
  add constraint eccia_eventos_texto_confirmacion_check check (
    (horario_texto is null or char_length(btrim(horario_texto)) between 1 and 120)
    and (modalidad_texto is null or char_length(btrim(modalidad_texto)) between 1 and 120)
    and (incluye_texto is null or char_length(btrim(incluye_texto)) between 1 and 200)
  ),
  add constraint eccia_eventos_enlaces_confirmacion_check check (
    (comunidad_url is null or comunidad_url ~ '^https://[^[:space:]]+$')
    and (transmision_url is null or transmision_url ~ '^https://[^[:space:]]+$')
    and (aula_url is null or aula_url ~ '^https://[^[:space:]]+$')
  );

comment on column public.eccia_eventos.horario_texto is
  'Horario tal como se muestra en el correo de confirmación, por ejemplo 15h00 a 17h00.';
comment on column public.eccia_eventos.modalidad_texto is
  'Modalidad tal como se muestra en el correo de confirmación.';
comment on column public.eccia_eventos.incluye_texto is
  'Qué incluye el evento (por ejemplo certificado) tal como se muestra en el correo de confirmación.';
comment on column public.eccia_eventos.comunidad_url is
  'Enlace HTTPS a la comunidad del evento, mostrado como botón en la confirmación.';
comment on column public.eccia_eventos.transmision_url is
  'Enlace HTTPS a la transmisión en vivo del evento, mostrado en la confirmación.';
comment on column public.eccia_eventos.aula_url is
  'Enlace HTTPS al aula virtual del evento, mostrado en el pie de la confirmación.';
