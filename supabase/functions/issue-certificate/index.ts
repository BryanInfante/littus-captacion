import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API_URL = 'https://api.resend.com'
const CLAIMS_TABLE = 'eccia_masterclass_certificados'
const REGISTRATIONS_TABLE = 'eccia_taller_inscripciones'
const MASTERCLASS_CODE = 'ultrasonido-industrial-scan-a'
const FROM = 'ECCIA <gestioneccia@mail.littusgroup.com>'
const REPLY_TO = 'formanager@littusgroup.com'
const EVENT_TITLE = 'Seminario de Ultrasonido Industrial Nivel I'

type IssueRequest = {
  nombre_completo?: string
  correo?: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const getSecretKey = () => {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (secretKeys) return JSON.parse(secretKeys).default as string
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
}

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing required secret: ${name}`)
  return value
}

const normalizeEmail = (value: string) => value.trim().toLowerCase()
const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ')

const generateCertificateCode = () => {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  const token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `ECCIA-UT1-${token.slice(0, 8)}`
}

const buildValidationUrl = (baseUrl: string, code: string) =>
  `${baseUrl.replace(/\/$/, '')}/validar-certificado.html?code=${encodeURIComponent(code)}`

const buildPrintableCertificateUrl = (baseUrl: string, code: string) =>
  `${baseUrl.replace(/\/$/, '')}/certificado.html?code=${encodeURIComponent(code)}`

const renderCertificateEmail = (fullName: string, certificateUrl: string, validationUrl: string) => `<!doctype html>
<html lang="es"><body style="font-family:Arial,sans-serif;color:#111318">
  <h1>Tu certificado está listo</h1>
  <p>Hola ${fullName.split(/\s+/)[0] || 'profesional'},</p>
  <p>Tu certificado de asistencia al ${EVENT_TITLE.toLowerCase()} ya está disponible.</p>
  <p><a href="${certificateUrl}">Abrir certificado imprimible</a></p>
  <p><a href="${validationUrl}">Validar certificado</a></p>
</body></html>`

const sendCertificateEmail = async (params: {
  email: string
  fullName: string
  certificateCode: string
  certificateUrl: string
  validationUrl: string
}) => {
  const resendApiKey = requiredEnv('RESEND_API_KEY')
  const response = await fetch(`${RESEND_API_URL}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `certificate/${params.certificateCode}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: [params.email],
      reply_to: REPLY_TO,
      subject: 'Tu certificado ECCIA está listo',
      html: renderCertificateEmail(params.fullName, params.certificateUrl, params.validationUrl),
      tags: [{ name: 'email_type', value: 'certificate_delivery' }],
    }),
  })

  const body = await response.json().catch(() => ({}))
  if (response.status === 409) return `resend-idempotency-conflict/${params.certificateCode}`
  if (!response.ok || typeof body.id !== 'string') {
    throw new Error(`Resend rejected certificate email (${response.status})`)
  }

  return body.id as string
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Método no permitido.' }, 405)

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL')
    const supabaseSecretKey = getSecretKey()
    if (!supabaseSecretKey) return jsonResponse({ error: 'La función no está configurada.' }, 500)

    const payload = (await request.json().catch(() => null)) as IssueRequest | null
    if (!payload?.nombre_completo || !payload?.correo) return jsonResponse({ error: 'Solicitud inválida.' }, 400)

    const fullName = normalizeName(payload.nombre_completo)
    const email = normalizeEmail(payload.correo)
    const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: registration } = await supabaseAdmin
      .from(REGISTRATIONS_TABLE)
      .select('id,correo')
      .eq('correo', email)
      .maybeSingle()

    if (!registration) return jsonResponse({ error: 'El correo no coincide con una inscripción.' }, 403)

    const baseUrl = requiredEnv('CERTIFICATE_PUBLIC_BASE_URL')
    const { data: existing } = await supabaseAdmin
      .from(CLAIMS_TABLE)
      .select('*')
      .eq('correo', email)
      .eq('masterclass_codigo', MASTERCLASS_CODE)
      .maybeSingle()

    if (existing?.codigo_certificado && ['uploaded', 'emailed'].includes(existing.certificate_status)) {
      const certificateUrl = buildPrintableCertificateUrl(baseUrl, existing.codigo_certificado)
      return jsonResponse({
        status: 'already_issued',
        codigo_certificado: existing.codigo_certificado,
        validation_url: existing.validation_url ?? buildValidationUrl(baseUrl, existing.codigo_certificado),
        certificate_url: certificateUrl,
      })
    }

    let claim = existing
    let createdClaim = false

    if (!claim) {
      const certificateCode = generateCertificateCode()
      const validationUrl = buildValidationUrl(baseUrl, certificateCode)
      const certificateUrl = buildPrintableCertificateUrl(baseUrl, certificateCode)
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from(CLAIMS_TABLE)
        .insert({
          nombre_completo: fullName,
          correo: email,
          masterclass_codigo: MASTERCLASS_CODE,
          registration_id: registration.id,
          codigo_certificado: certificateCode,
          validation_url: validationUrl,
          public_certificate_url: certificateUrl,
          certificate_status: 'rendering',
          certificate_attempts: 1,
          certificate_error: null,
        })
        .select('*')
        .single()

      if (insertError) {
        if (insertError.code !== '23505') return jsonResponse({ error: 'No se pudo registrar el certificado.' }, 500)

        const { data: conflicting } = await supabaseAdmin
          .from(CLAIMS_TABLE)
          .select('*')
          .eq('correo', email)
          .eq('masterclass_codigo', MASTERCLASS_CODE)
          .maybeSingle()

        if (!conflicting) return jsonResponse({ error: 'No se pudo registrar el certificado.' }, 500)
        claim = conflicting
      } else {
        claim = inserted
        createdClaim = true
      }
    }

    if (!claim) return jsonResponse({ error: 'No se pudo registrar el certificado.' }, 500)

    if (claim.certificate_status === 'rendering' && !createdClaim) {
      const pendingCode = claim.codigo_certificado
      return jsonResponse({
        status: 'pending',
        codigo_certificado: pendingCode,
        validation_url: claim.validation_url ?? (pendingCode ? buildValidationUrl(baseUrl, pendingCode) : null),
        certificate_url: pendingCode ? buildPrintableCertificateUrl(baseUrl, pendingCode) : null,
      })
    }

    const certificateCode = claim.codigo_certificado ?? generateCertificateCode()
    const validationUrl = claim.validation_url ?? buildValidationUrl(baseUrl, certificateCode)
    const certificateUrl = buildPrintableCertificateUrl(baseUrl, certificateCode)

    if (claim.codigo_certificado && ['uploaded', 'emailed'].includes(claim.certificate_status)) {
      return jsonResponse({
        status: 'already_issued',
        codigo_certificado: claim.codigo_certificado,
        validation_url: claim.validation_url ?? validationUrl,
        certificate_url: buildPrintableCertificateUrl(baseUrl, claim.codigo_certificado),
      })
    }

    const now = new Date().toISOString()
    const { data: renderingClaim, error: updateError } = await supabaseAdmin
      .from(CLAIMS_TABLE)
      .update({
        nombre_completo: fullName,
        registration_id: registration.id,
        codigo_certificado: certificateCode,
        validation_url: validationUrl,
        public_certificate_url: certificateUrl,
        certificate_generated_at: now,
        certificate_status: 'uploaded',
        certificate_attempts: (claim.certificate_attempts ?? 0) + 1,
        certificate_error: null,
      })
      .eq('id', claim.id)
      .select('*')
      .single()

    if (updateError || !renderingClaim) return jsonResponse({ error: 'No se pudo registrar el certificado.' }, 500)

    try {
      const emailId = await sendCertificateEmail({ email, fullName, certificateCode, certificateUrl, validationUrl })

      await supabaseAdmin.from(CLAIMS_TABLE).update({
        certificate_resend_email_id: emailId,
        certificate_emailed_at: new Date().toISOString(),
        certificate_status: 'emailed',
      }).eq('id', renderingClaim.id)

      return jsonResponse({ status: 'issued', codigo_certificado: certificateCode, validation_url: validationUrl, certificate_url: certificateUrl })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido.'
      await supabaseAdmin.from(CLAIMS_TABLE).update({
        certificate_status: 'uploaded',
        certificate_error: message.slice(0, 500),
      }).eq('id', renderingClaim.id)

      return jsonResponse({ status: 'issued', codigo_certificado: certificateCode, validation_url: validationUrl, certificate_url: certificateUrl, email_warning: 'No se pudo reenviar el correo.' })
    }
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: 'La función no está configurada.' }, 500)
  }
})
