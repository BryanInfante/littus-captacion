-- Scopes the registration-confirmation trigger to the workshop its email is
-- actually about.
--
-- The trigger created in 20260904120000 fires `for each row` with no WHEN
-- clause, so EVERY insert into eccia_taller_inscripciones sends the same email:
-- subject 'Inscripción confirmada | Domina el Scan A', with the WhatsApp group
-- and the 03-jul-2026 YouTube live baked into the template
-- (send-registration-confirmation/index.ts:101 and template.ts). The function
-- reads taller_codigo only to tag the message in Resend
-- (send-registration-confirmation/index.ts:105); it never branches on it.
--
-- That was harmless while 'domina-scan-a' was the only workshop. Registering a
-- second course turns it into an incident: the new participants receive the
-- July workshop confirmation, with links to a session that already happened.
--
-- The gate belongs on the trigger, not inside the function, because the
-- template itself is single-workshop by construction. A course with its own
-- confirmation email gets its own trigger and its own WHEN clause, so no course
-- can ever inherit another course's email by default. Adding a row must never
-- be able to send the wrong message.
--
-- `create or replace trigger` (PostgreSQL 14+) rather than drop + create: the
-- replacement is atomic, so there is never an instant in which the table sits
-- without the trigger and an insert slips through unconfirmed.
--
-- sync-resend-contact is deliberately NOT scoped here: it self-gates on
-- marketing_consent inside the function, which 20260904120000 documents as the
-- single source of truth for consent. That gate stays where it is.

create or replace trigger eccia_send_registration_confirmation_after_insert
after insert on public.eccia_taller_inscripciones
for each row
when (new.taller_codigo = 'domina-scan-a')
execute function private.eccia_send_registration_confirmation();

comment on function private.eccia_send_registration_confirmation() is
  'Envía la confirmación del taller Domina el Scan A. Su plantilla es específica de ese taller, así que el trigger que la invoca filtra por taller_codigo = ''domina-scan-a''. Un curso nuevo necesita su propio trigger y su propia plantilla.';
