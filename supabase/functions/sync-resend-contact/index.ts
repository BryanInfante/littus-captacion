import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API_URL = 'https://api.resend.com'
const SEGMENT_ID = '109cb30f-74b0-47d3-810b-aa7b18994166'
const TABLE_NAME = 'eccia_taller_inscripciones'

type WebhookPayload = {
  type?: string
  table?: string
  schema?: string
  record?: {
    id?: string
  }
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

const splitName = (fullName: string) => {
  const [firstName, ...rest] = fullName.trim().split(/\s+/)

  return {
    firstName,
    lastName: rest.join(' ') || undefined,
  }
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
    .select('id,nombre,correo,marketing_consent,resend_synced_at')
    .eq('id', registrationId)
    .maybeSingle()

  if (registrationError || !registration) {
    return jsonResponse({ error: 'No se encontró la inscripción.' }, 404)
  }

  if (!registration.marketing_consent) {
    return jsonResponse({ status: 'skipped', reason: 'no_consent' })
  }

  if (registration.resend_synced_at) {
    return jsonResponse({ status: 'already_synced' })
  }

  const { firstName, lastName } = splitName(registration.nombre)
  let resendContactId: string | null = null

  try {
    const createResponse = await fetch(`${RESEND_API_URL}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: registration.correo,
        firstName,
        lastName,
        unsubscribed: false,
        segments: [{ id: SEGMENT_ID }],
      }),
    })

    if (createResponse.ok) {
      const createdContact = await createResponse.json()
      resendContactId = createdContact.id ?? null
    } else if (createResponse.status === 409) {
      const encodedEmail = encodeURIComponent(registration.correo)
      const updateResponse = await fetch(`${RESEND_API_URL}/contacts/${encodedEmail}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          unsubscribed: false,
          properties: {
            first_name: firstName,
            last_name: lastName ?? '',
          },
        }),
      })

      const segmentResponse = await fetch(
        `${RESEND_API_URL}/contacts/${encodedEmail}/segments/${SEGMENT_ID}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendApiKey}` },
        },
      )

      if (!updateResponse.ok || !segmentResponse.ok) {
        throw new Error('No se pudo actualizar el contacto existente en Resend.')
      }
    } else {
      const resendError = await createResponse.text()
      throw new Error(`Resend rechazó el contacto: ${resendError}`)
    }

    const { error: syncUpdateError } = await supabaseAdmin
      .from(TABLE_NAME)
      .update({
        resend_contact_id: resendContactId,
        resend_synced_at: new Date().toISOString(),
        resend_sync_error: null,
      })
      .eq('id', registration.id)

    if (syncUpdateError) {
      throw syncUpdateError
    }

    return jsonResponse({ status: 'synced' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido.'

    await supabaseAdmin
      .from(TABLE_NAME)
      .update({ resend_sync_error: message.slice(0, 500) })
      .eq('id', registration.id)

    return jsonResponse({ error: 'No se pudo sincronizar el contacto.' }, 502)
  }
})
