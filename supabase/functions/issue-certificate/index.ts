import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb, LineCapStyle } from 'npm:pdf-lib'
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

// Signatures are real handwritten signatures of company officers, so unlike
// the logo they must never be public (no GitHub Pages path, no anonymous
// URL). They live in the same private Nextcloud storage as the generated
// certificates and are fetched over authenticated WebDAV at render time.
const SIGNATURE_MENA_PATH = 'firmas/firma_mena.png'
const SIGNATURE_AUCANCELA_PATH = 'firmas/firma_aucancela.png'

// The base template (logo, signatures, decorations, and every static label
// already baked in) is built once via buildCertificateTemplate and stored
// here. Per-request rendering only loads this and stamps the 3 fields that
// actually vary (name, QR, certificate code) — it no longer re-embeds the
// logo, both signature PNGs, and two full non-subsetted Inter fonts on every
// single issuance, which was pushing the Edge Function's compute budget over
// the edge intermittently (WORKER_RESOURCE_LIMIT, HTTP 546).
const CERTIFICATE_TEMPLATE_PATH = 'templates/certificate-base.pdf'

const fetchNextcloudFile = async (path: string) => {
  const webdavUrl = requiredEnv('NEXTCLOUD_WEBDAV_URL').replace(/\/$/, '')
  const username = requiredEnv('NEXTCLOUD_USERNAME')
  const appPassword = requiredEnv('NEXTCLOUD_APP_PASSWORD')
  const auth = btoa(`${username}:${appPassword}`)
  const response = await fetch(buildWebDavUrl(webdavUrl, path), {
    headers: { Authorization: `Basic ${auth}` },
  })
  if (!response.ok) throw new Error(`Nextcloud file fetch failed (${response.status}): ${path}`)
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

const buildLayout = () => ({
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
})

// Builds everything that is IDENTICAL across every certificate of this event
// (logo, decorations, signature images, and every static label) into a base
// PDF. Run once as a one-off maintenance call and stored in Nextcloud —
// `stampCertificate` loads it and only draws the 3
// fields that actually vary per person (name, QR, certificate code).
export const buildCertificateTemplate = async (params: {
  logoBytes: Uint8Array
  signatureMenaBytes: Uint8Array
  signatureAucancelaBytes: Uint8Array
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

  const layout = buildLayout()

  const logo = await pdf.embedPng(params.logoBytes)
  const logoWidth = layout.logoHeight * (logo.width / logo.height)
  const signatureMena = await pdf.embedPng(params.signatureMenaBytes)
  const signatureAucancela = await pdf.embedPng(params.signatureAucancelaBytes)

  page.drawRectangle({ x: 0, y: 0, width: layout.pageWidth, height: layout.pageHeight, color: white })
  drawTopRuleGradient(page, { y: layout.pageHeight - layout.topRuleHeight, width: layout.pageWidth, height: layout.topRuleHeight })

  const cornerCenterX = layout.pageWidth - htmlMm(25)
  const cornerCenterY = htmlMm(42)
  page.drawEllipse({ x: cornerCenterX, y: cornerCenterY, xScale: htmlMm(72), yScale: htmlMm(72), borderColor: lightBorder, borderWidth: 2.2 })
  page.drawEllipse({ x: cornerCenterX, y: cornerCenterY, xScale: htmlMm(54), yScale: htmlMm(54), borderColor: lightBorder, borderWidth: 2.2 })
  page.drawEllipse({ x: cornerCenterX, y: cornerCenterY, xScale: htmlMm(36), yScale: htmlMm(36), borderColor: rgb(0.95, 0.96, 0.97), borderWidth: 1.2 })
  // drawSvgPath anchors the path's local (0,0) at (x, y) and SUBTRACTS local y
  // (SVG y grows downward) — the previous x/y/scale here were guessed and put
  // most of the wave off-page, so it never appeared. This derives x/y from the
  // path's own local center (100, 118) so the wave lands centered on the same
  // point as the decorative circles above, fully on the page.
  const cornerWaveScale = htmlMm(0.46)
  const cornerWaveLocalCenterX = 100
  const cornerWaveLocalCenterY = 118
  page.drawSvgPath('M 40 118 Q 62 62 100 118 Q 138 174 160 118', {
    x: cornerCenterX - cornerWaveLocalCenterX * cornerWaveScale,
    y: cornerCenterY + cornerWaveLocalCenterY * cornerWaveScale,
    scale: cornerWaveScale,
    borderColor: cyan,
    borderWidth: 5,
    borderOpacity: 0.35,
    borderLineCap: LineCapStyle.Round,
  })

  page.drawImage(logo, {
    x: layout.contentX,
    y: layout.pageHeight - layout.contentTop - layout.logoHeight + layout.logoShiftY,
    width: logoWidth,
    height: layout.logoHeight,
  })

  // QR card background/border and its static captions are baked in here; the
  // actual QR bitmap and the "Código: X" line vary per person and are drawn
  // later by `stampCertificate` directly on top of this same card area.
  const qrCardX = layout.pageWidth - layout.contentX - layout.qrCardSize
  const qrCardY = layout.pageHeight - layout.contentTop - htmlMm(10) - layout.qrCardSize
  const qrY = qrCardY + layout.qrCardSize - layout.qrCardPadding - layout.qrImageSize
  const qrCenterX = qrCardX + layout.qrCardSize / 2
  // The card must enclose the QR image plus all four caption lines below it
  // (the last one drawn at `qrY - 52`). Sizing the card to `qrCardSize` alone
  // left the caption spilling past the border, so the card grows downward
  // from the same top edge to fit the full caption block with real padding.
  const qrCardBottomY = qrY - 52 - layout.qrCaptionBottomPadding
  const qrCardHeight = qrCardY + layout.qrCardSize - qrCardBottomY

  drawRightAlignedText(page, 'LITTUS GROUP AMERICA - ECCIA', {
    rightX: layout.pageWidth - layout.contentX,
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
  centerTextUnderQr(page, 'VALIDACIÓN DEL', { centerX: qrCenterX, y: qrY - 22, size: 6.6, font: bodySemiBoldFont, color: black })
  centerTextUnderQr(page, 'CERTIFICADO', { centerX: qrCenterX, y: qrY - 30, size: 6.6, font: bodySemiBoldFont, color: black })
  centerTextUnderQr(page, 'Escanea para validar', { centerX: qrCenterX, y: qrY - 42, size: 6.1, font: bodyFont, color: muted })

  const mainX = layout.contentX
  const eyebrowY = layout.pageHeight - layout.mainTop
  page.drawLine({ start: { x: mainX, y: eyebrowY + 5 }, end: { x: mainX + htmlMm(8), y: eyebrowY + 5 }, thickness: 2, color: black })
  drawTextAt(page, 'CERTIFICADO DE ASISTENCIA', { x: mainX + htmlMm(11), y: eyebrowY, size: 9.5, font: bodySemiBoldFont, color: cyan, characterSpacing: 2 })

  drawTextAt(page, 'Seminario de Ultrasonido', { x: mainX, y: eyebrowY - 49, size: 32, font: titleFont, color: black })
  drawTextAt(page, 'Industrial Nivel I', { x: mainX, y: eyebrowY - 86, size: 32, font: titleFont, color: black })
  drawTextAt(page, 'otorgado a', { x: mainX, y: eyebrowY - 127, size: 11, font: bodyFont, color: muted })

  // The name itself is dynamic (content + size) and is drawn later by
  // `stampCertificate` at the same `eyebrowY - 163` baseline. The divider
  // rectangles below it are at a fixed position regardless of the name, so
  // they stay part of the static template.
  page.drawRectangle({ x: mainX, y: eyebrowY - 176, width: htmlMm(44), height: 3, color: cyan })
  page.drawRectangle({ x: mainX + htmlMm(28), y: eyebrowY - 176, width: htmlMm(16), height: 3, color: black, opacity: 0.85 })

  drawWrappedText(
    page,
    'Por su participación en el seminario de Ultrasonido Industrial Nivel I, con enfoque en los fundamentos del ultrasonido y la interpretación del Scan-A.',
    { x: mainX, y: eyebrowY - 212, maxWidth: htmlMm(154), size: 11.5, lineHeight: 18, font: bodyFont, color: muted },
  )

  const detailY = eyebrowY - 264
  drawTextAt(page, 'DURACIÓN', { x: mainX, y: detailY, size: 7.6, font: bodySemiBoldFont, color: muted, characterSpacing: 1.2 })
  drawTextAt(page, '2h', { x: mainX, y: detailY - 20, size: 13, font: titleFont, color: black })
  drawTextAt(page, 'FECHA', { x: mainX + htmlMm(32), y: detailY, size: 7.6, font: bodySemiBoldFont, color: muted, characterSpacing: 1.2 })
  drawTextAt(page, '03 de julio de 2026', { x: mainX + htmlMm(32), y: detailY - 20, size: 13, font: titleFont, color: black })

  const footerY = layout.contentBottom
  const signatureLineY = footerY + 42
  const signatureLeftX = layout.contentX
  const signatureRightX = layout.contentX + htmlMm(90)
  const drawSignature = (x: number, name: string, role: string, signatureImage: typeof signatureMena) => {
    const imageHeight = layout.signatureSpaceHeight
    const imageWidth = imageHeight * (signatureImage.width / signatureImage.height)
    page.drawImage(signatureImage, {
      x: x + (layout.signatureLineWidth - imageWidth) / 2,
      y: signatureLineY + 4,
      width: imageWidth,
      height: imageHeight,
    })
    page.drawLine({ start: { x, y: signatureLineY }, end: { x: x + layout.signatureLineWidth, y: signatureLineY }, thickness: 1.5, color: black })
    drawTextAt(page, name, { x, y: signatureLineY - 26, size: 12.5, font: titleFont, color: black })
    drawTextAt(page, role, { x, y: signatureLineY - 43, size: 8.8, font: bodySemiBoldFont, color: cyan })
  }

  drawSignature(signatureLeftX, 'Ing. Edison Mena', 'Gerente Técnico Ecuador', signatureMena)
  drawSignature(signatureRightX, 'Ing. Marco Aucancela', 'Gerente Regional', signatureAucancela)

  return pdf.save()
}

// Loads the pre-built template (see `buildCertificateTemplate`) and stamps
// only the 3 fields that vary per person: name, QR image, and the
// certificate code caption under it. Reuses `titleFont` (already needed for
// the name) for the code caption too, so this path never re-embeds the
// logo, signatures, or the two full Inter font files.
export const stampCertificate = async (params: {
  templateBytes: Uint8Array
  fullName: string
  certificateCode: string
  qrCodeDataUri: string
}) => {
  const pdf = await PDFDocument.load(params.templateBytes)
  pdf.registerFontkit(fontkit)
  const page = pdf.getPage(0)
  const black = rgb(0.04, 0.06, 0.08)
  const muted = rgb(0.32, 0.38, 0.45)
  const layout = buildLayout()

  const titleFontBytes = await fetchFontBytes(SPACE_GROTESK_BOLD_URL)
  const titleFont = await pdf.embedFont(titleFontBytes, { subset: true })

  const mainX = layout.contentX
  const eyebrowY = layout.pageHeight - layout.mainTop
  const nameSize = params.fullName.length > 34 ? 22 : params.fullName.length > 26 ? 25 : 27
  drawTextAt(page, params.fullName, { x: mainX, y: eyebrowY - 163, size: nameSize, font: titleFont, color: black })

  const qrBase64 = params.qrCodeDataUri.split(',')[1]
  const qrBytes = Uint8Array.from(atob(qrBase64), (char) => char.charCodeAt(0))
  const qr = await pdf.embedPng(qrBytes)
  const qrCardX = layout.pageWidth - layout.contentX - layout.qrCardSize
  const qrCardY = layout.pageHeight - layout.contentTop - htmlMm(10) - layout.qrCardSize
  const qrX = qrCardX + (layout.qrCardSize - layout.qrImageSize) / 2
  const qrY = qrCardY + layout.qrCardSize - layout.qrCardPadding - layout.qrImageSize
  const qrCenterX = qrCardX + layout.qrCardSize / 2
  page.drawImage(qr, { x: qrX, y: qrY, width: layout.qrImageSize, height: layout.qrImageSize })
  centerTextUnderQr(page, `Código: ${params.certificateCode}`, { centerX: qrCenterX, y: qrY - 52, size: 5.6, font: titleFont, color: muted })

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

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character] ?? character,
  )

// Matches the visual system used by send-registration-confirmation and
// send-workshop-reminder (dark header with logo, cyan eyebrow, bordered detail
// card, cyan primary CTA, dark footer) so all ECCIA transactional emails read
// as one product. This is an operational email (sent regardless of marketing
// consent) — it must stay a thank-you/delivery note, not a promotional pitch
// for other courses or offers; those only go out through the Resend
// segment/topic for contacts who opted in (see EMAIL_OPERATIONS.md).
const renderCertificateEmail = (fullName: string, certificateUrl: string, validationUrl: string, certificateCode: string) => {
  const firstName = escapeHtml(fullName.trim().split(/\s+/)[0] || 'profesional')
  const safeFullName = escapeHtml(fullName)
  const safeCode = escapeHtml(certificateCode)

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>Tu certificado ECCIA está listo</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f5f7;color:#111318;font-family:Arial,Helvetica,sans-serif">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Gracias por participar en el ${EVENT_TITLE}. Tu certificado de asistencia ya está disponible.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f5f7">
      <tr><td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;overflow:hidden;border:1px solid #d9dee3;border-radius:8px;background:#fff">
          <tr><td style="padding:24px 32px;background:#0A0E13">
            <img src="https://preinscripcion.littusgroup.com/brand/assets/logo-dark.png" width="190" alt="ECCIA, división de Littus Group America" style="display:block;width:190px;max-width:100%;height:auto;border:0" />
          </td></tr>
          <tr><td style="padding:40px 32px 16px">
            <p style="margin:0 0 12px;color:#00AEEF;font-size:12px;font-weight:700;line-height:1.4;letter-spacing:1.5px;text-transform:uppercase">Certificado de asistencia</p>
            <h1 style="margin:0;color:#111318;font-size:30px;font-weight:700;line-height:1.2;letter-spacing:-.6px">¡Gracias por acompañarnos, ${firstName}!</h1>
          </td></tr>
          <tr><td style="padding:16px 32px 40px;color:#2D333B;font-size:16px;line-height:1.7">
            <p style="margin:0 0 20px">Fue un gusto contar con tu participación en el <strong>${EVENT_TITLE}</strong>. Esperamos que los fundamentos del ultrasonido y la interpretación del Scan-A te sean de mucha utilidad en tu día a día.</p>
            <p style="margin:0 0 20px">Tu certificado ya está listo a nombre de <strong>${safeFullName}</strong>:</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;border:1px solid #D9DEE3;border-radius:8px"><tr><td style="padding:20px 22px">
              <p style="margin:0 0 8px"><strong>Duración:</strong> 2h</p>
              <p style="margin:0 0 8px"><strong>Fecha:</strong> 03 de julio de 2026</p>
              <p style="margin:0"><strong>Código:</strong> ${safeCode}</p>
            </td></tr></table>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px">
              <tr><td style="padding:0 0 12px">
                <a href="${certificateUrl}" target="_blank" rel="noopener noreferrer" style="display:block;padding:14px 20px;border-radius:8px;background:#00AEEF;color:#061018;font-weight:700;line-height:1.4;text-align:center;text-decoration:none">Descargar certificado</a>
              </td></tr>
              <tr><td>
                <a href="${validationUrl}" target="_blank" rel="noopener noreferrer" style="display:block;padding:13px 20px;border:1px solid #2D333B;border-radius:8px;color:#111318;font-weight:700;line-height:1.4;text-align:center;text-decoration:none">Validar certificado</a>
              </td></tr>
            </table>
            <p style="margin:0">Si necesitas ayuda con tu certificado, responde directamente a este correo.</p>
          </td></tr>
          <tr><td style="padding:28px 32px;border-top:1px solid #1E2329;background:#0A0E13">
            <p style="margin:0 0 8px;color:#F0F6FC;font-size:13px;font-weight:700;line-height:1.5">ECCIA · Littus Group America</p>
            <p style="margin:0;color:#C9D1D9;font-size:12px;line-height:1.6">Este es un mensaje operativo relacionado con tu certificado de asistencia.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

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
      subject: '¡Gracias por participar! Tu certificado ECCIA está listo',
      html: renderCertificateEmail(params.fullName, params.certificateUrl, params.validationUrl, params.certificateCode),
      tags: [{ name: 'email_type', value: 'certificate_delivery' }],
    }),
  })

  const body = await response.json().catch(() => ({}))
  if (response.status === 409) return `resend-idempotency-conflict/${params.certificateCode}`
  // Resend's free plan caps sending at 100 emails/day (429 once the quota is
  // hit). The PDF is already rendered and uploaded to Nextcloud by the time
  // this runs, so this must NOT be treated like a hard failure — the caller
  // checks for this sentinel and keeps the claim at 'uploaded' (certificate
  // still valid and downloadable) instead of demoting it to 'failed'.
  if (response.status === 429) return `resend-rate-limited/${params.certificateCode}`
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
      const templateBytes = await fetchNextcloudFile(CERTIFICATE_TEMPLATE_PATH)
      const pdfBytes = await stampCertificate({
        templateBytes,
        fullName,
        certificateCode,
        qrCodeDataUri,
      })
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

      if (emailId.startsWith('resend-rate-limited/')) {
        // Certificate stays 'uploaded' (already set above) — it's valid and
        // downloadable right now. Only the email didn't go out. Recording the
        // reason in certificate_error is informational only; it does not
        // change certificate_status, so a later retry from the same person
        // skips straight to "already_issued" with a working download link
        // instead of re-rendering the PDF.
        await supabaseAdmin.from(CLAIMS_TABLE).update({
          certificate_error: 'Email pendiente: se alcanzó el límite diario de envíos de Resend.',
        }).eq('id', claim.id)

        return jsonResponse({
          status: 'issued_email_delayed',
          codigo_certificado: certificateCode,
          validation_url: validationUrl,
          certificate_url: certificateUrl,
        })
      }

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






