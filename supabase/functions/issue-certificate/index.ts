import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib'
import QRCode from 'npm:qrcode'

const RESEND_API_URL = 'https://api.resend.com'
const CLAIMS_TABLE = 'eccia_masterclass_certificados'
const REGISTRATIONS_TABLE = 'eccia_taller_inscripciones'
const MASTERCLASS_CODE = 'ultrasonido-industrial-scan-a'
const FROM = 'ECCIA <gestioneccia@mail.littusgroup.com>'
const REPLY_TO = 'formanager@littusgroup.com'

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

const buildDownloadCertificateUrl = (supabaseUrl: string, code: string) =>
  `${supabaseUrl.replace(/\/$/, '')}/functions/v1/download-certificate?code=${encodeURIComponent(code)}`

export const renderCertificatePdf = async (params: {
  fullName: string
  certificateCode: string
  validationUrl: string
  qrCodeDataUri: string
}) => {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([842, 595])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const cyan = rgb(0, 174 / 255, 239 / 255)
  const black = rgb(0.04, 0.06, 0.08)
  const muted = rgb(0.32, 0.38, 0.45)

  page.drawRectangle({ x: 0, y: 585, width: 842, height: 10, color: cyan })
  page.drawText('ECCIA · Littus Group America', { x: 64, y: 525, size: 18, font: bold, color: black })
  page.drawText('Certificado de asistencia', { x: 64, y: 455, size: 12, font: bold, color: cyan })
  page.drawText('Curso de Ultrasonido Industrial Nivel I', { x: 64, y: 415, size: 30, font: bold, color: black })
  page.drawText('otorgado a', { x: 64, y: 365, size: 12, font, color: muted })
  page.drawText(params.fullName, { x: 64, y: 328, size: 28, font: bold, color: black })
  page.drawLine({ start: { x: 64, y: 312 }, end: { x: 220, y: 312 }, thickness: 3, color: cyan })
  page.drawText('Por su participación en el curso de Ultrasonido Industrial Nivel I, con enfoque en los', { x: 64, y: 270, size: 13, font, color: muted })
  page.drawText('fundamentos del ultrasonido y la interpretación del Scan-A.', { x: 64, y: 250, size: 13, font, color: muted })
  page.drawText('DURACIÓN', { x: 64, y: 205, size: 8, font: bold, color: muted })
  page.drawText('2h', { x: 64, y: 187, size: 13, font: bold, color: black })
  page.drawText('FECHA', { x: 160, y: 205, size: 8, font: bold, color: muted })
  page.drawText('03 de julio de 2026', { x: 160, y: 187, size: 13, font: bold, color: black })

  page.drawLine({ start: { x: 64, y: 105 }, end: { x: 260, y: 105 }, thickness: 1.5, color: black })
  page.drawText('Ing. Edison Mena', { x: 64, y: 78, size: 13, font: bold, color: black })
  page.drawText('Gerente Técnico Ecuador', { x: 64, y: 61, size: 9, font, color: cyan })

  page.drawLine({ start: { x: 410, y: 105 }, end: { x: 606, y: 105 }, thickness: 1.5, color: black })
  page.drawText('Ing. Marco Aucancela', { x: 410, y: 78, size: 13, font: bold, color: black })
  page.drawText('Gerente Regional', { x: 410, y: 61, size: 9, font, color: cyan })

  const qrBase64 = params.qrCodeDataUri.split(',')[1]
  const qrBytes = Uint8Array.from(atob(qrBase64), (char) => char.charCodeAt(0))
  const qr = await pdf.embedPng(qrBytes)
  page.drawImage(qr, { x: 700, y: 448, width: 82, height: 82 })
  page.drawText('Validación', { x: 708, y: 430, size: 8, font: bold, color: black })
  page.drawText(params.certificateCode, { x: 692, y: 416, size: 7, font, color: muted })

  return pdf.save()
}

const uploadCertificateToNextcloud = async (path: string, bytes: Uint8Array) => {
  const webdavUrl = requiredEnv('NEXTCLOUD_WEBDAV_URL').replace(/\/$/, '')
  const username = requiredEnv('NEXTCLOUD_USERNAME')
  const appPassword = requiredEnv('NEXTCLOUD_APP_PASSWORD')
  const targetUrl = `${webdavUrl}/${path}`
  const auth = btoa(`${username}:${appPassword}`)

  const response = await fetch(targetUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/pdf',
    },
    body: bytes,
  })

  if (!response.ok) {
    throw new Error(`Nextcloud upload failed (${response.status})`)
  }

  return path
}

const renderCertificateEmail = (fullName: string, certificateUrl: string, validationUrl: string) => `<!doctype html>
<html lang="es"><body style="font-family:Arial,sans-serif;color:#111318">
  <h1>Tu certificado está listo</h1>
  <p>Hola ${fullName.split(/\s+/)[0] || 'profesional'},</p>
  <p>Tu certificado de asistencia al curso de Ultrasonido Industrial Nivel I ya fue generado.</p>
  <p><a href="${certificateUrl}">Descargar certificado</a></p>
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

    const { data: existing } = await supabaseAdmin
      .from(CLAIMS_TABLE)
      .select('*')
      .eq('correo', email)
      .eq('masterclass_codigo', MASTERCLASS_CODE)
      .maybeSingle()

    if (existing?.codigo_certificado && ['uploaded', 'emailed'].includes(existing.certificate_status)) {
      const certificateUrl = buildDownloadCertificateUrl(supabaseUrl, existing.codigo_certificado)
      return jsonResponse({
        status: 'already_issued',
        codigo_certificado: existing.codigo_certificado,
        validation_url: existing.validation_url ?? buildValidationUrl(requiredEnv('CERTIFICATE_PUBLIC_BASE_URL'), existing.codigo_certificado),
        certificate_url: certificateUrl,
      })
    }

    const baseUrl = requiredEnv('CERTIFICATE_PUBLIC_BASE_URL')
    let claim = existing
    let createdClaim = false

    if (!claim) {
      const certificateCode = generateCertificateCode()
      const validationUrl = buildValidationUrl(baseUrl, certificateCode)
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from(CLAIMS_TABLE)
        .insert({
          nombre_completo: fullName,
          correo: email,
          masterclass_codigo: MASTERCLASS_CODE,
          registration_id: registration.id,
          codigo_certificado: certificateCode,
          validation_url: validationUrl,
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
        certificate_url: pendingCode ? buildDownloadCertificateUrl(supabaseUrl, pendingCode) : null,
      })
    }

    const certificateCode = claim.codigo_certificado ?? generateCertificateCode()
    const validationUrl = claim.validation_url ?? buildValidationUrl(baseUrl, certificateCode)
    const certificateUrl = buildDownloadCertificateUrl(supabaseUrl, certificateCode)

    if (claim.codigo_certificado && ['uploaded', 'emailed'].includes(claim.certificate_status)) {
      return jsonResponse({
        status: 'already_issued',
        codigo_certificado: claim.codigo_certificado,
        validation_url: claim.validation_url ?? validationUrl,
        certificate_url: buildDownloadCertificateUrl(supabaseUrl, claim.codigo_certificado),
      })
    }

    const renderingUpdate: Record<string, unknown> = {
      nombre_completo: fullName,
      registration_id: registration.id,
      certificate_status: 'rendering',
      certificate_attempts: (claim.certificate_attempts ?? 0) + 1,
      certificate_error: null,
    }

    if (!claim.codigo_certificado) renderingUpdate.codigo_certificado = certificateCode
    if (!claim.validation_url) renderingUpdate.validation_url = validationUrl

    const qrCodeDataUri = await QRCode.toDataURL(validationUrl, { margin: 1, width: 192 })
    const now = new Date().toISOString()

    const { data: renderingClaim, error: updateError } = await supabaseAdmin
      .from(CLAIMS_TABLE)
      .update(renderingUpdate)
      .eq('id', claim.id)
      .select('*')
      .single()

    if (updateError || !renderingClaim) return jsonResponse({ error: 'No se pudo registrar el certificado.' }, 500)
    claim = renderingClaim
    try {
      const pdfBytes = await renderCertificatePdf({ fullName, certificateCode, validationUrl, qrCodeDataUri })
      const nextcloudPath = `masterclass-ultrasonido-nivel-i/2026/${certificateCode}.pdf`
      await uploadCertificateToNextcloud(nextcloudPath, pdfBytes)

      await supabaseAdmin.from(CLAIMS_TABLE).update({
        nextcloud_path: nextcloudPath,
        public_certificate_url: certificateUrl,
        certificate_generated_at: now,
        certificate_uploaded_at: new Date().toISOString(),
        certificate_status: 'uploaded',
      }).eq('id', claim.id)

      const emailId = await sendCertificateEmail({ email, fullName, certificateCode, certificateUrl, validationUrl })

      await supabaseAdmin.from(CLAIMS_TABLE).update({
        certificate_resend_email_id: emailId,
        certificate_emailed_at: new Date().toISOString(),
        certificate_status: 'emailed',
      }).eq('id', claim.id)

      return jsonResponse({ status: 'issued', codigo_certificado: certificateCode, validation_url: validationUrl, certificate_url: certificateUrl })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido.'
      await supabaseAdmin.from(CLAIMS_TABLE).update({
        certificate_status: 'failed',
        certificate_error: message.slice(0, 500),
      }).eq('id', claim.id)

      return jsonResponse({ status: 'failed_retryable', error: 'No se pudo generar el certificado.' }, 502)
    }
  } catch (error) {
    console.error(error)
    return jsonResponse({ error: 'La función no está configurada.' }, 500)
  }
})


