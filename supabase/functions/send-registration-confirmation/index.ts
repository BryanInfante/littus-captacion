import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { renderConfirmationEmail } from './template.ts'

const RESEND_API_URL = 'https://api.resend.com'
const TABLE_NAME = 'eccia_taller_inscripciones'
const FROM = 'ECCIA <gestioneccia@mail.littusgroup.com>'
const REPLY_TO = 'formanager@littusgroup.com'

type WebhookPayload = {
  type?: string
  table?: string
  schema?: string
  record?: { id?: string }
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const getSecretKey = () => {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')

  if (secretKeys) {
    return JSON.parse(secretKeys).default as string
  }

  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido.' }, 405)
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseSecretKey = getSecretKey()

  if (!resendApiKey || !supabaseUrl || !supabaseSecretKey) {
    return jsonResponse({ error: 'La función no está configurada.' }, 500)
  }

  let payload: WebhookPayload

  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: 'El cuerpo debe ser JSON.' }, 400)
  }

  const registrationId = payload.record?.id
  const isExpectedWebhook =
    payload.type === 'INSERT' &&
    payload.schema === 'public' &&
    payload.table === TABLE_NAME &&
    typeof registrationId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registrationId)

  if (!isExpectedWebhook) {
    return jsonResponse({ error: 'Webhook inválido.' }, 400)
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: registration, error: registrationError } = await supabaseAdmin
    .from(TABLE_NAME)
    .select(
      'id,nombre,correo,taller_codigo,confirmation_sent_at,confirmation_resend_email_id',
    )
    .eq('id', registrationId)
    .maybeSingle()

  if (registrationError || !registration) {
    return jsonResponse({ error: 'No se encontró la inscripción.' }, 404)
  }

  if (registration.confirmation_sent_at) {
    return jsonResponse({
      status: 'already_sent',
      email_id: registration.confirmation_resend_email_id,
    })
  }

  try {
    const resendResponse = await fetch(`${RESEND_API_URL}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `registration-confirmation/${registration.id}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [registration.correo],
        reply_to: REPLY_TO,
        subject: 'Inscripción confirmada | Domina el Scan A',
        html: renderConfirmationEmail(registration.nombre),
        tags: [
          { name: 'email_type', value: 'registration_confirmation' },
          { name: 'workshop', value: registration.taller_codigo },
        ],
      }),
    })

    const resendBody = await resendResponse.json().catch(() => ({}))

    if (!resendResponse.ok || typeof resendBody.id !== 'string') {
      throw new Error(
        `Resend rechazó la confirmación (${resendResponse.status}): ${JSON.stringify(resendBody)}`,
      )
    }

    const { error: updateError } = await supabaseAdmin
      .from(TABLE_NAME)
      .update({
        confirmation_resend_email_id: resendBody.id,
        confirmation_sent_at: new Date().toISOString(),
        confirmation_error: null,
      })
      .eq('id', registration.id)
      .is('confirmation_sent_at', null)

    if (updateError) {
      throw updateError
    }

    return jsonResponse({ status: 'sent', email_id: resendBody.id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido.'

    await supabaseAdmin
      .from(TABLE_NAME)
      .update({ confirmation_error: message.slice(0, 500) })
      .eq('id', registration.id)

    return jsonResponse({ error: 'No se pudo enviar la confirmación.' }, 502)
  }
})
