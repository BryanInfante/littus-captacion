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

const buildDownloadCertificateUrl = (supabaseUrl: string, code: string) =>
  `${supabaseUrl.replace(/\/$/, '')}/functions/v1/download-certificate?code=${encodeURIComponent(code)}`

const buildLogoUrl = (baseUrl: string) =>
  `${baseUrl.replace(/\/$/, '')}/brand/assets/03%20logo_encabezado_derecha.png`

const buildWebDavUrl = (baseUrl: string, path: string) => {
  const cleanPath = path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
  return `${baseUrl.replace(/\/$/, '')}/${cleanPath}`
}

const fetchBrandLogo = async (baseUrl: string) => {
  const response = await fetch(buildLogoUrl(baseUrl))
  if (!response.ok) throw new Error(`Logo fetch failed (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}

const centerTextUnderQr = (page: ReturnType<PDFDocument['addPage']>, text: string, params: {
  centerX: number
  y: number
  size: number
  font: Awaited<ReturnType<PDFDocument['embedFont']>>
  color: ReturnType<typeof rgb>
}) => {
  const width = params.font.widthOfTextAtSize(text, params.size)
  page.drawText(text, {
    x: params.centerX - width / 2,
    y: params.y,
    size: params.size,
    font: params.font,
    color: params.color,
  })
}

export const renderCertificatePdf = async (params: {
  fullName: string
  certificateCode: string
  validationUrl: string
  qrCodeDataUri: string
  logoBytes: Uint8Array
}) => {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([842, 595])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const cyan = rgb(0, 174 / 255, 239 / 255)
  const black = rgb(0.04, 0.06, 0.08)
  const muted = rgb(0.32, 0.38, 0.45)

  const logo = await pdf.embedPng(params.logoBytes)
  page.drawRectangle({ x: 0, y: 585, width: 842, height: 10, color: cyan })
  page.drawImage(logo, { x: 60, y: 444, width: 214, height: 80 })
  page.drawText('LITTUS GROUP AMERICA - ECCIA', { x: 560, y: 510, size: 9, font: bold, color: black })
  page.drawText('CERTIFICADO DE ASISTENCIA', { x: 64, y: 405, size: 10, font: bold, color: cyan, characterSpacing: 2 })
  page.drawLine({ start: { x: 64, y: 392 }, end: { x: 100, y: 392 }, thickness: 2, color: black })
  page.drawText('Seminario de Ultrasonido', { x: 64, y: 350, size: 31, font: bold, color: black })
  page.drawText('Industrial Nivel I', { x: 64, y: 314, size: 31, font: bold, color: black })
  page.drawText('otorgado a', { x: 64, y: 270, size: 11, font, color: muted })
  page.drawText(params.fullName, { x: 64, y: 235, size: 28, font: bold, color: black })
  page.drawLine({ start: { x: 64, y: 219 }, end: { x: 220, y: 219 }, thickness: 3, color: cyan })
  page.drawText('Por su participación en el seminario de Ultrasonido Industrial Nivel I, con enfoque en', { x: 64, y: 182, size: 12, font, color: muted })
  page.drawText('los fundamentos del ultrasonido y la interpretación del Scan-A.', { x: 64, y: 164, size: 12, font, color: muted })
  page.drawText('DURACIÓN', { x: 64, y: 120, size: 8, font: bold, color: muted })
  page.drawText('2h', { x: 64, y: 102, size: 13, font: bold, color: black })
  page.drawText('FECHA', { x: 160, y: 120, size: 8, font: bold, color: muted })
  page.drawText('03 de julio de 2026', { x: 160, y: 102, size: 13, font: bold, color: black })

  page.drawLine({ start: { x: 64, y: 52 }, end: { x: 260, y: 52 }, thickness: 1.5, color: black })
  page.drawText('Ing. Edison Mena', { x: 64, y: 29, size: 12, font: bold, color: black })
  page.drawText('Gerente Técnico Ecuador', { x: 64, y: 15, size: 8, font, color: muted })

  page.drawLine({ start: { x: 410, y: 52 }, end: { x: 606, y: 52 }, thickness: 1.5, color: black })
  page.drawText('Ing. Marco Aucancela', { x: 410, y: 29, size: 12, font: bold, color: black })
  page.drawText('Gerente Regional', { x: 410, y: 15, size: 8, font, color: muted })

  const qrBase64 = params.qrCodeDataUri.split(',')[1]
  const qrBytes = Uint8Array.from(atob(qrBase64), (char) => char.charCodeAt(0))
  const qr = await pdf.embedPng(qrBytes)
  const qrX = 664
  const qrY = 358
  const qrSize = 104
  const qrCenterX = qrX + qrSize / 2
  page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize })
  centerTextUnderQr(page, 'Validación del certificado', { centerX: qrCenterX, y: 338, size: 8, font: bold, color: black })
  centerTextUnderQr(page, params.certificateCode, { centerX: qrCenterX, y: 324, size: 7, font, color: muted })

  return pdf.save()
}

const uploadCertificateToNextcloud = async (path: string, bytes: Uint8Array) => {
  const webdavUrl = requiredEnv('NEXTCLOUD_WEBDAV_URL').replace(/\/$/, '')
  const username = requiredEnv('NEXTCLOUD_USERNAME')
  const appPassword = requiredEnv('NEXTCLOUD_APP_PASSWORD')
  const auth = btoa(`${username}:${appPassword}`)
  const directoryPath = path.split('/').slice(0, -1).join('/')
  await ensureNextcloudDirectory(directoryPath)
  const targetUrl = buildWebDavUrl(webdavUrl, path)

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

const ensureNextcloudDirectory = async (path: string) => {
  if (!path) return

  const webdavUrl = requiredEnv('NEXTCLOUD_WEBDAV_URL').replace(/\/$/, '')
  const username = requiredEnv('NEXTCLOUD_USERNAME')
  const appPassword = requiredEnv('NEXTCLOUD_APP_PASSWORD')
  const auth = btoa(`${username}:${appPassword}`)
  const segments = path.split('/').filter(Boolean)
  let currentPath = ''

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment
    const response = await fetch(buildWebDavUrl(webdavUrl, currentPath), {
      method: 'MKCOL',
      headers: { Authorization: `Basic ${auth}` },
    })

    if (![201, 405].includes(response.status)) {
      throw new Error(`Nextcloud directory creation failed (${response.status})`)
    }
  }
}

const renderCertificateEmail = (fullName: string, certificateUrl: string, validationUrl: string) => `<!doctype html>
<html lang="es"><body style="font-family:Arial,sans-serif;color:#111318">
  <h1>Tu certificado está listo</h1>
  <p>Hola ${fullName.split(/\s+/)[0] || 'profesional'},</p>
  <p>Tu certificado de asistencia al ${EVENT_TITLE.toLowerCase()} ya fue generado.</p>
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
      const logoBytes = await fetchBrandLogo(baseUrl)
      const pdfBytes = await renderCertificatePdf({ fullName, certificateCode, validationUrl, qrCodeDataUri, logoBytes })
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


