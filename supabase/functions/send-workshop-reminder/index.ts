import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { renderWorkshopReminderEmail } from '../send-registration-confirmation/template.ts'

const RESEND_API_URL = 'https://api.resend.com'
const TABLE_NAME = 'eccia_taller_inscripciones'
const FROM = 'ECCIA <gestioneccia@mail.littusgroup.com>'
const REPLY_TO = 'formanager@littusgroup.com'
const SUBJECT = 'Tu masterclass inicia en 30 minutos'
const APPROVAL_PHRASE = 'APROBAR ENVIO RECORDATORIO 30 MIN'

type ReminderPayload = {
  mode?: 'preview' | 'send'
  approval_phrase?: string
  registration_ids?: string[]
}

type Registration = {
  id: string
  nombre: string
  correo: string
  taller_codigo: string | null
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

const textBody = (firstName: string) => `Hola ${firstName},

Te recordamos que Masterclass Ultrasonido Industrial - Interpretación del Scan-A inicia en 30 minutos.

Ingresa a la transmisión:
https://youtube.com/live/yW3OQFl76kg?feature=share

Te recomendamos conectarte unos minutos antes para verificar tu audio y conexión.

Equipo ECCIA`

const getFirstName = (fullName: string) => fullName.trim().split(/\s+/)[0] || 'profesional'

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Método no permitido.' }, 405)
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseSecretKey = getSecretKey()

  if (!supabaseUrl || !supabaseSecretKey) {
    return jsonResponse({ error: 'La función no está configurada.' }, 500)
  }

  let payload: ReminderPayload

  try {
    payload = await request.json()
  } catch {
    payload = { mode: 'preview' }
  }

  const mode = payload.mode ?? 'preview'

  const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  let query = supabaseAdmin.from(TABLE_NAME)
    .select('id,nombre,correo,taller_codigo')

  if (payload.registration_ids && payload.registration_ids.length > 0) {
    query = query.in('id', payload.registration_ids)
  }

  const { data: registrations, error: registrationsError } = await query

  if (registrationsError) {
    return jsonResponse({ error: 'No se pudieron leer las inscripciones.' }, 500)
  }

  const recipients = (registrations ?? []) as Registration[]
  const sampleName = recipients[0]?.nombre ?? 'profesional'

  if (mode !== 'send') {
    return jsonResponse({
      status: 'preview',
      recipients_count: recipients.length,
      subject: SUBJECT,
      from: FROM,
      reply_to: REPLY_TO,
      approval_phrase: APPROVAL_PHRASE,
      sample_html: renderWorkshopReminderEmail(sampleName),
      sample_text: textBody(getFirstName(sampleName)),
    })
  }

  if (payload.approval_phrase !== APPROVAL_PHRASE) {
    return jsonResponse(
      {
        error: 'Aprobación requerida antes de enviar.',
        expected_approval_phrase: APPROVAL_PHRASE,
      },
      403,
    )
  }

  if (!resendApiKey) {
    return jsonResponse({ error: 'La API key de Resend no está configurada.' }, 500)
  }

  const sent: Array<{ registration_id: string; email: string; email_id: string }> = []
  const failed: Array<{ registration_id: string; email: string; error: string }> = []

  for (const registration of recipients) {
    try {
      const resendResponse = await fetch(`${RESEND_API_URL}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `workshop-reminder-30min/${registration.id}`,
        },
        body: JSON.stringify({
          from: FROM,
          to: [registration.correo],
          reply_to: REPLY_TO,
          subject: SUBJECT,
          html: renderWorkshopReminderEmail(registration.nombre),
          text: textBody(getFirstName(registration.nombre)),
          tags: [
            { name: 'email_type', value: 'workshop_reminder_30min' },
            { name: 'workshop', value: registration.taller_codigo ?? 'scan-a' },
          ],
        }),
      })

      const resendBody = await resendResponse.json().catch(() => ({}))

      if (!resendResponse.ok || typeof resendBody.id !== 'string') {
        throw new Error(
          `Resend rechazó el recordatorio (${resendResponse.status}): ${JSON.stringify(resendBody)}`,
        )
      }

      sent.push({
        registration_id: registration.id,
        email: registration.correo,
        email_id: resendBody.id,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido.'

      failed.push({
        registration_id: registration.id,
        email: registration.correo,
        error: message.slice(0, 500),
      })
    }

    await wait(150)
  }

  return jsonResponse(
    {
      status: failed.length > 0 ? 'partial' : 'sent',
      sent_count: sent.length,
      failed_count: failed.length,
      sent,
      failed,
    },
    failed.length > 0 ? 207 : 200,
  )
})
