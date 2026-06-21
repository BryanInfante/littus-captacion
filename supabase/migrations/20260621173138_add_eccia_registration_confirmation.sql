alter table public.eccia_taller_inscripciones
  add column if not exists confirmation_resend_email_id text,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists confirmation_error text;

alter table public.eccia_taller_inscripciones
  drop constraint if exists eccia_taller_inscripciones_confirmation_error_check;

alter table public.eccia_taller_inscripciones
  add constraint eccia_taller_inscripciones_confirmation_error_check
  check (confirmation_error is null or char_length(confirmation_error) <= 500);

comment on column public.eccia_taller_inscripciones.confirmation_resend_email_id is
  'Identificador del correo transaccional devuelto por Resend.';
comment on column public.eccia_taller_inscripciones.confirmation_sent_at is
  'Fecha en que Resend aceptó la confirmación individual de inscripción.';
comment on column public.eccia_taller_inscripciones.confirmation_error is
  'Último error del intento de confirmación, limitado a 500 caracteres.';

create or replace function private.eccia_send_registration_confirmation()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  perform net.http_post(
    url := 'https://qfbhyzynpyqqcpuuibod.supabase.co/functions/v1/send-registration-confirmation',
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', jsonb_build_object('id', new.id)
    ),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 5000
  );

  return new;
end;
$function$;

drop trigger if exists eccia_send_registration_confirmation_after_insert
  on public.eccia_taller_inscripciones;

create trigger eccia_send_registration_confirmation_after_insert
after insert on public.eccia_taller_inscripciones
for each row
execute function private.eccia_send_registration_confirmation();
