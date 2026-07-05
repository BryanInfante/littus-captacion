import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib'
import fontkit from 'npm:@pdf-lib/fontkit'
import QRCode from 'npm:qrcode'

const RESEND_API_URL = 'https://api.resend.com'
const CLAIMS_TABLE = 'eccia_masterclass_certificados'
const REGISTRATIONS_TABLE = 'eccia_taller_inscripciones'
const MASTERCLASS_CODE = 'ultrasonido-industrial-scan-a'
const FROM = 'ECCIA <gestioneccia@mail.littusgroup.com>'
const REPLY_TO = 'formanager@littusgroup.com'
const EVENT_TITLE = 'Seminario de Ultrasonido Industrial Nivel I'
// Static per-weight instances served directly by Google Fonts' CDN (not the
// variable-font files from the google/fonts source repo). Needed because
// pdf-lib/@pdf-lib/fontkit's glyph subsetting silently drops most of Inter's
// glyphs when subsetting its variable font; embedding a static weight avoids
// that specific glyph-table bug, and these URLs are stable production assets
// (the same ones browsers fetch), unlike the source repo's file layout.
const SPACE_GROTESK_BOLD_URL = 'https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj4PVksjNsdjTQ.ttf'
const INTER_REGULAR_URL = 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZhrj72A.ttf'
const INTER_SEMIBOLD_URL = 'https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZhrj72A.ttf'

const fetchFontBytes = async (url: string) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Font fetch failed (${response.status})`)
  return new Uint8Array(await response.arrayBuffer())
}

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

const MM_TO_PT = 72 / 25.4
const htmlMm = (value: number) => value * MM_TO_PT

const drawTextAt = (page: ReturnType<PDFDocument['addPage']>, text: string, params: {
  x: number
  y: number
  size: number
  font: Awaited<ReturnType<PDFDocument['embedFont']>>
  color: ReturnType<typeof rgb>
  characterSpacing?: number
}) => {
  page.drawText(text, {
    x: params.x,
    y: params.y,
    size: params.size,
    font: params.font,
    color: params.color,
    characterSpacing: params.characterSpacing,
  })
}

const drawWrappedText = (page: ReturnType<PDFDocument['addPage']>, text: string, params: {
  x: number
  y: number
  maxWidth: number
  size: number
  lineHeight: number
  font: Awaited<ReturnType<PDFDocument['embedFont']>>
  color: ReturnType<typeof rgb>
}) => {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''

  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (params.font.widthOfTextAtSize(next, params.size) <= params.maxWidth) {
      line = next
    } else {
      if (line) lines.push(line)
      line = word
    }
  }

  if (line) lines.push(line)

  lines.forEach((lineText, index) => {
    page.drawText(lineText, {
      x: params.x,
      y: params.y - index * params.lineHeight,
      size: params.size,
      font: params.font,
      color: params.color,
    })
  })

  return lines.length
}

const drawRightAlignedText = (page: ReturnType<PDFDocument['addPage']>, text: string, params: {
  rightX: number
  y: number
  size: number
  font: Awaited<ReturnType<PDFDocument['embedFont']>>
  color: ReturnType<typeof rgb>
  characterSpacing?: number
}) => {
  const width = params.font.widthOfTextAtSize(text, params.size)
  page.drawText(text, {
    x: params.rightX - width,
    y: params.y,
    size: params.size,
    font: params.font,
    color: params.color,
    characterSpacing: params.characterSpacing,
  })
}

const drawTopRuleGradient = (page: ReturnType<PDFDocument['addPage']>, params: {
  y: number
  width: number
  height: number
}) => {
  const steps = 96
  const start = { r: 0.04, g: 0.06, b: 0.08 }
  const end = { r: 0, g: 174 / 255, b: 239 / 255 }
  const stepWidth = params.width / steps

  for (let index = 0; index < steps; index += 1) {
    const t = index / (steps - 1)
    page.drawRectangle({
      x: index * stepWidth,
      y: params.y,
      width: stepWidth + 0.5,
      height: params.height,
      color: rgb(
        start.r + (end.r - start.r) * t,
        start.g + (end.g - start.g) * t,
        start.b + (end.b - start.b) * t,
      ),
    })
  }
}

export const renderCertificatePdf = async (params: {
  fullName: string
  certificateCode: string
  validationUrl: string
  qrCodeDataUri: string
  logoBytes: Uint8Array
}) => {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const page = pdf.addPage([842, 595])
  const [titleFontBytes, bodyFontBytes, bodySemiBoldFontBytes] = await Promise.all([
    fetchFontBytes(SPACE_GROTESK_BOLD_URL),
    fetchFontBytes(INTER_REGULAR_URL),
    fetchFontBytes(INTER_SEMIBOLD_URL),
  ])
  const titleFont = await pdf.embedFont(titleFontBytes, { subset: true })
  // Inter must NOT be subset: pdf-lib/@pdf-lib/fontkit's subsetter drops most
  // of its glyphs (confirmed by testing with subset: true vs false), leaving
  // certificates missing most lowercase letters. Space Grotesk subsets fine.
  const bodyFont = await pdf.embedFont(bodyFontBytes, { subset: false })
  const bodySemiBoldFont = await pdf.embedFont(bodySemiBoldFontBytes, { subset: false })
  const cyan = rgb(0, 174 / 255, 239 / 255)
  const black = rgb(0.04, 0.06, 0.08)
  const muted = rgb(0.32, 0.38, 0.45)
  const lightBorder = rgb(0.91, 0.93, 0.94)
  const white = rgb(1, 1, 1)

  const layout = {
    pageWidth: 842,
    pageHeight: 595,
    topRuleHeight: htmlMm(3),
    contentX: htmlMm(22),
    contentTop: htmlMm(12),
    contentBottom: htmlMm(14),
    logoHeight: htmlMm(30),
    logoShiftY: 12,
    qrCardSize: htmlMm(43),
    qrCardPadding: htmlMm(3),
    qrImageSize: htmlMm(31),
    qrCaptionBottomPadding: htmlMm(3),
    mainTop: 184 - htmlMm(12.5),
    signatureSpaceHeight: htmlMm(18),
    signatureLineWidth: htmlMm(72),
    cornerSize: htmlMm(130),
  }

  const logo = await pdf.embedPng(params.logoBytes)
  const logoWidth = layout.logoHeight * (logo.width / logo.height)

  page.drawRectangle({ x: 0, y: 0, width: layout.pageWidth, height: layout.pageHeight, color: white })
  drawTopRuleGradient(page, { y: layout.pageHeight - layout.topRuleHeight, width: layout.pageWidth, height: layout.topRuleHeight })

  const cornerCenterX = layout.pageWidth - htmlMm(25)
  const cornerCenterY = htmlMm(42)
  page.drawEllipse({ x: cornerCenterX, y: cornerCenterY, xScale: htmlMm(72), yScale: htmlMm(72), borderColor: lightBorder, borderWidth: 2.2 })
  page.drawEllipse({ x: cornerCenterX, y: cornerCenterY, xScale: htmlMm(54), yScale: htmlMm(54), borderColor: lightBorder, borderWidth: 2.2 })
  page.drawEllipse({ x: cornerCenterX, y: cornerCenterY, xScale: htmlMm(36), yScale: htmlMm(36), borderColor: rgb(0.95, 0.96, 0.97), borderWidth: 1.2 })
  page.drawSvgPath('M 40 118 Q 62 62 100 118 Q 138 174 160 118', {
    x: layout.pageWidth - htmlMm(75),
    y: htmlMm(15),
    scale: 1.6,
    borderColor: rgb(0.58, 0.85, 0.95),
    borderWidth: 4,
  })

  page.drawImage(logo, {
    x: layout.contentX,
    y: layout.pageHeight - layout.contentTop - layout.logoHeight + layout.logoShiftY,
    width: logoWidth,
    height: layout.logoHeight,
  })

  const qrBase64 = params.qrCodeDataUri.split(',')[1]
  const qrBytes = Uint8Array.from(atob(qrBase64), (char) => char.charCodeAt(0))
  const qr = await pdf.embedPng(qrBytes)
  const qrCardX = layout.pageWidth - layout.contentX - layout.qrCardSize
  const qrCardY = layout.pageHeight - layout.contentTop - htmlMm(10) - layout.qrCardSize
  const qrX = qrCardX + (layout.qrCardSize - layout.qrImageSize) / 2
  const qrY = qrCardY + layout.qrCardSize - layout.qrCardPadding - layout.qrImageSize
  const qrCenterX = qrCardX + layout.qrCardSize / 2
  // The card must enclose the QR image plus all four caption lines below it
  // (the last one drawn at `qrY - 52`). Sizing the card to `qrCardSize` alone
  // left the caption spilling past the border, so the card grows downward
  // from the same top edge to fit the full caption block with real padding.
  const qrCardBottomY = qrY - 52 - layout.qrCaptionBottomPadding
  const qrCardHeight = qrCardY + layout.qrCardSize - qrCardBottomY

  drawRightAlignedText(page, 'LITTUS GROUP AMERICA - ECCIA', {
    rightX: layout.pageWidth - htmlMm(4),
    y: qrCardY + layout.qrCardSize + 8,
    size: 8,
    font: bodySemiBoldFont,
    color: muted,
    characterSpacing: 1.25,
  })

  page.drawRectangle({
    x: qrCardX,
    y: qrCardBottomY,
    width: layout.qrCardSize,
    height: qrCardHeight,
    color: white,
    opacity: 0.92,
    borderColor: lightBorder,
    borderWidth: 1,
  })
  page.drawImage(qr, { x: qrX, y: qrY, width: layout.qrImageSize, height: layout.qrImageSize })
  centerTextUnderQr(page, 'VALIDACIÓN DEL', { centerX: qrCenterX, y: qrY - 22, size: 6.6, font: bodySemiBoldFont, color: black })
  centerTextUnderQr(page, 'CERTIFICADO', { centerX: qrCenterX, y: qrY - 30, size: 6.6, font: bodySemiBoldFont, color: black })
  centerTextUnderQr(page, 'Escanea para validar', { centerX: qrCenterX, y: qrY - 42, size: 6.1, font: bodyFont, color: muted })
  centerTextUnderQr(page, `Código: ${params.certificateCode}`, { centerX: qrCenterX, y: qrY - 52, size: 5.6, font: bodyFont, color: muted })

  const mainX = layout.contentX
  const eyebrowY = layout.pageHeight - layout.mainTop
  page.drawLine({ start: { x: mainX, y: eyebrowY + 5 }, end: { x: mainX + htmlMm(8), y: eyebrowY + 5 }, thickness: 2, color: black })
  drawTextAt(page, 'CERTIFICADO DE ASISTENCIA', { x: mainX + htmlMm(11), y: eyebrowY, size: 9.5, font: bodySemiBoldFont, color: cyan, characterSpacing: 2 })

  drawTextAt(page, 'Seminario de Ultrasonido', { x: mainX, y: eyebrowY - 49, size: 32, font: titleFont, color: black })
  drawTextAt(page, 'Industrial Nivel I', { x: mainX, y: eyebrowY - 86, size: 32, font: titleFont, color: black })
  drawTextAt(page, 'otorgado a', { x: mainX, y: eyebrowY - 127, size: 11, font: bodyFont, color: muted })

  const nameSize = params.fullName.length > 34 ? 22 : params.fullName.length > 26 ? 25 : 27
  drawTextAt(page, params.fullName, { x: mainX, y: eyebrowY - 163, size: nameSize, font: titleFont, color: black })
  page.drawRectangle({ x: mainX, y: eyebrowY - 176, width: htmlMm(44), height: 3, color: cyan })
  page.drawRectangle({ x: mainX + htmlMm(28), y: eyebrowY - 176, width: htmlMm(16), height: 3, color: black, opacity: 0.85 })

  drawWrappedText(
    page,
    'Por su participación en el seminario de Ultrasonido Industrial Nivel I, con enfoque en los fundamentos del ultrasonido y la interpretación del Scan-A.',
    { x: mainX, y: eyebrowY - 212, maxWidth: htmlMm(154), size: 11.5, lineHeight: 18, font: bodyFont, color: muted },
  )

  const detailY = eyebrowY - 250
  drawTextAt(page, 'DURACIÓN', { x: mainX, y: detailY, size: 7.6, font: bodySemiBoldFont, color: muted, characterSpacing: 1.2 })
  drawTextAt(page, '2h', { x: mainX, y: detailY - 20, size: 13, font: titleFont, color: black })
  drawTextAt(page, 'FECHA', { x: mainX + htmlMm(32), y: detailY, size: 7.6, font: bodySemiBoldFont, color: muted, characterSpacing: 1.2 })
  drawTextAt(page, '03 de julio de 2026', { x: mainX + htmlMm(32), y: detailY - 20, size: 13, font: titleFont, color: black })

  const footerY = layout.contentBottom
  const signatureLineY = footerY + 42
  const signatureLeftX = layout.contentX
  const signatureRightX = layout.contentX + htmlMm(90)
  const drawSignature = (x: number, name: string, role: string) => {
    page.drawLine({ start: { x, y: signatureLineY + layout.signatureSpaceHeight - layout.signatureSpaceHeight }, end: { x: x + layout.signatureLineWidth, y: signatureLineY }, thickness: 1.5, color: black })
    drawTextAt(page, name, { x, y: signatureLineY - 26, size: 12.5, font: titleFont, color: black })
    drawTextAt(page, role, { x, y: signatureLineY - 43, size: 8.8, font: bodySemiBoldFont, color: cyan })
  }

  drawSignature(signatureLeftX, 'Ing. Edison Mena', 'Gerente Técnico Ecuador')
  drawSignature(signatureRightX, 'Ing. Marco Aucancela', 'Gerente Regional')

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






