# Operación de correos ECCIA

Esta guía separa la infraestructura técnica de la operación cotidiana. El
objetivo es que las campañas se editen y programen desde Resend sin modificar
el código de la landing.

## Arquitectura elegida

- **Supabase** conserva las inscripciones y el consentimiento.
- **Resend Contacts + Segments** administrará la audiencia promocional.
- **Resend Broadcasts** permitirá editar, probar y programar campañas.
- `emails/eccia-base.html` es la plantilla maestra de respaldo.
- La Edge Function `sync-resend-contact` sincroniza únicamente los contactos
  cuyo campo `marketing_consent` sea verdadero.
- La Edge Function `send-registration-confirmation` envía una confirmación
  individual mediante `POST /emails` a cada persona inscrita, sin depender del
  consentimiento promocional.

No se debe colocar `RESEND_API_KEY` en `public/app.js`, GitHub Pages ni ningún
archivo público. Esa credencial deberá guardarse como secreto de una Edge
Function.

## Qué puedes editar en la plantilla

Busca y reemplaza estos marcadores antes de importar o enviar una campaña:

| Marcador | Uso |
| --- | --- |
| `{{SUBJECT}}` | Asunto interno del documento |
| `{{PREHEADER}}` | Texto corto que aparece junto al asunto |
| `{{LOGO_URL}}` | URL HTTPS pública del logo ECCIA |
| `{{EYEBROW}}` | Categoría corta, por ejemplo “Taller técnico” |
| `{{TITLE}}` | Título principal |
| `{{BODY_HTML}}` | Contenido central |
| `{{CTA_URL}}` | Enlace completo del botón |
| `{{CTA_LABEL}}` | Texto del botón |

No reemplaces `{{{contact.first_name|profesional}}}` ni
`{{{RESEND_UNSUBSCRIBE_URL}}}`: Resend utiliza esos campos para personalizar el
saludo y gestionar las bajas.

## Configuración activa en Resend

- Cuenta de Resend creada.
- Dominio `mail.littusgroup.com` verificado.
- API key guardada como secreto `RESEND_API_KEY` en Supabase.
- Segmento `ECCIA · Talleres y actividades` creado.
- Topic `Talleres y actividades ECCIA` creado.
- Remitente: `ECCIA <gestioneccia@mail.littusgroup.com>`.
- Reply-To: `formanager@littusgroup.com`.
- Broadcast `PLANTILLA MAESTRA · ECCIA` creado y validado mediante Test email.
- Enlace de cancelación de suscripción verificado.

La sincronización automática usa el segmento:
`109cb30f-74b0-47d3-810b-aa7b18994166`.

El Broadcast maestro debe permanecer como borrador. Para cada campaña se crea
una copia y se edita esa copia.

## Lista de control

Nunca envíes una campaña sin comprobar:

- que el segmento contiene solo personas con consentimiento;
- que el asunto y el preheader describen el contenido;
- que todos los enlaces funcionan;
- que el botón lleva al destino correcto;
- que el correo incluye la opción de cancelar la suscripción;
- que se envió una prueba a escritorio y móvil;
- que el remitente y el dominio están verificados;
- que no se incluyeron destinatarios mediante copia visible.

## Regla operativa

Los mensajes necesarios para participar en un taller —confirmación, acceso,
recordatorio y certificado— son comunicaciones operativas. Las invitaciones a
otros talleres o promociones solo se envían a quienes marcaron el
consentimiento opcional.

La confirmación usa una clave de idempotencia vinculada al identificador de la
inscripción y registra en Supabase el ID de Resend, la fecha de envío y el
último error. No usa Contacts, Segments, Topics ni enlaces de baja promocional.
