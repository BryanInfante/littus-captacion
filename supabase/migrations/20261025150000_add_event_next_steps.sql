-- Event-owned "next steps" copy for the registration confirmation email (for
-- example how and when course participants receive their virtual classroom
-- access). It is event content, so it lives in the event row and is optional:
-- the template omits the block when it is null. Not part of
-- eccia_eventos_publicos (explicit column allow-list), so it stays private.
alter table public.eccia_eventos
  add column siguientes_pasos_texto text,
  add constraint eccia_eventos_siguientes_pasos_check check (
    siguientes_pasos_texto is null
    or char_length(btrim(siguientes_pasos_texto)) between 1 and 400
  );

comment on column public.eccia_eventos.siguientes_pasos_texto is
  'Próximos pasos tal como se muestran en el correo de confirmación, por ejemplo cómo y cuándo se recibe el acceso al aula virtual.';
