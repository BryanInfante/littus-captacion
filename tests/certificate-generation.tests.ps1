$ErrorActionPreference = "Stop"

$migrationPath = Join-Path $PSScriptRoot "..\supabase\migrations\20260704120000_add_certificate_generation_flow.sql"
$issueFunctionPath = Join-Path $PSScriptRoot "..\supabase\functions\issue-certificate\index.ts"
$downloadFunctionPath = Join-Path $PSScriptRoot "..\supabase\functions\download-certificate\index.ts"
$validateFunctionPath = Join-Path $PSScriptRoot "..\supabase\functions\validate-certificate\index.ts"
$supabaseConfigPath = Join-Path $PSScriptRoot "..\supabase\config.toml"
$validationPagePath = Join-Path $PSScriptRoot "..\public\validar-certificado.html"
$certificateTemplatePath = Join-Path $PSScriptRoot "..\public\certificado.html"
$clientScriptPath = Join-Path $PSScriptRoot "..\public\certificados.js"

function Assert-Contains {
    param(
        [string]$Source,
        [string]$Needle,
        [string]$Message
    )

    if (-not $Source.Contains($Needle)) {
        throw $Message
    }
}

function Assert-NotContains {
    param(
        [string]$Source,
        [string]$Needle,
        [string]$Message
    )

    if ($Source.Contains($Needle)) {
        throw $Message
    }
}

function Assert-Path {
    param(
        [string]$Path,
        [string]$Message
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw $Message
    }
}

function Assert-Order {
    param(
        [string]$Source,
        [string]$Before,
        [string]$After,
        [string]$Message
    )

    $beforeIndex = $Source.IndexOf($Before)
    $afterIndex = $Source.IndexOf($After)

    if ($beforeIndex -lt 0 -or $afterIndex -lt 0 -or $beforeIndex -gt $afterIndex) {
        throw $Message
    }
}

function Assert-ContainsBlock {
    param(
        [string]$Source,
        [string]$Block,
        [string]$Message
    )

    $normalizedSource = $Source -replace "`r`n", "`n"
    $normalizedBlock = $Block -replace "`r`n", "`n"

    if (-not $normalizedSource.Contains($normalizedBlock)) {
        throw $Message
    }
}

Assert-Path $migrationPath "Falta la migración del flujo de generación de certificados."
Assert-Path $issueFunctionPath "Falta la Edge Function issue-certificate."
Assert-Path $downloadFunctionPath "Falta la Edge Function download-certificate para servir PDFs sin exponer WebDAV."
Assert-Path $validateFunctionPath "Falta la Edge Function validate-certificate."
Assert-Path $supabaseConfigPath "Falta supabase/config.toml con verify_jwt explícito para funciones públicas."
Assert-Path $validationPagePath "Falta la página pública validar-certificado.html."

$migration = Get-Content -LiteralPath $migrationPath -Raw -Encoding UTF8
$issueFunction = Get-Content -LiteralPath $issueFunctionPath -Raw -Encoding UTF8
$downloadFunction = Get-Content -LiteralPath $downloadFunctionPath -Raw -Encoding UTF8
$validateFunction = Get-Content -LiteralPath $validateFunctionPath -Raw -Encoding UTF8
$supabaseConfig = Get-Content -LiteralPath $supabaseConfigPath -Raw -Encoding UTF8
$validationPage = Get-Content -LiteralPath $validationPagePath -Raw -Encoding UTF8
$certificateTemplate = Get-Content -LiteralPath $certificateTemplatePath -Raw -Encoding UTF8
$clientScript = Get-Content -LiteralPath $clientScriptPath -Raw -Encoding UTF8

Assert-Contains $migration 'codigo_certificado text' "La tabla debe guardar código único de certificado."
Assert-Contains $migration 'certificate_status text' "La tabla debe guardar estado de emisión."
Assert-Contains $migration 'nextcloud_path text' "La tabla debe guardar ruta de Nextcloud."
Assert-Contains $migration 'validation_url text' "La tabla debe guardar URL de validación."
Assert-Contains $migration 'certificate_resend_email_id text' "La tabla debe guardar id de correo Resend."
Assert-Contains $migration 'unique (correo, masterclass_codigo)' "Debe haber idempotencia por correo y masterclass."
Assert-Contains $migration 'certificate_status in' "Debe existir constraint de estados de certificado."
Assert-NotContains $migration 'validate_certificate_public' "No debe existir RPC pública para validación; la Edge Function debe consultar con service role."
Assert-NotContains $migration 'security definer' "No deben crearse funciones security definer en el schema public expuesto."
Assert-NotContains $migration 'grant execute on function public.validate_certificate_public(text) to anon' "Anon no debe recibir EXECUTE sobre RPC pública de validación."

Assert-Contains $issueFunction 'NEXTCLOUD_WEBDAV_URL' "La función debe leer URL WebDAV desde secrets."
Assert-Contains $issueFunction 'NEXTCLOUD_USERNAME' "La función debe leer usuario Nextcloud desde secrets."
Assert-Contains $issueFunction 'NEXTCLOUD_APP_PASSWORD' "La función debe leer app password Nextcloud desde secrets."
Assert-Contains $issueFunction 'CERTIFICATE_PUBLIC_BASE_URL' "La función debe construir URL pública desde secret."
Assert-Contains $issueFunction "npm:pdf-lib" "La función debe generar PDF sin Chromium usando pdf-lib."
Assert-Contains $issueFunction "npm:fontkit" "La función debe registrar fuentes personalizadas para parecerse al HTML."
Assert-Contains $issueFunction "SpaceGrotesk-Bold.ttf" "Los títulos del PDF deben usar una fuente equivalente a la plantilla HTML."
Assert-Contains $issueFunction "Inter%5Bopsz,wght%5D.ttf" "El cuerpo del PDF debe usar Inter como en la plantilla HTML."
Assert-Contains $issueFunction "npm:qrcode" "La función debe generar QR con librería edge-compatible."
Assert-Contains $issueFunction 'renderCertificatePdf' "La función debe tener seam de render PDF."
Assert-Contains $issueFunction 'Seminario de Ultrasonido Industrial Nivel I' "El PDF debe usar Seminario, no Curso."
Assert-NotContains $issueFunction 'Curso de Ultrasonido Industrial Nivel I' "El PDF no debe usar Curso como tipo de evento."
Assert-Contains $issueFunction 'drawImage(logo' "El PDF debe incluir el logo, no solo texto."
Assert-Contains $issueFunction 'centerTextUnderQr' "El código debajo del QR debe centrarse respecto al QR."
Assert-Contains $issueFunction 'const MM_TO_PT = 72 / 25.4' "El renderer PDF debe convertir medidas del HTML en mm a puntos."
Assert-Contains $issueFunction 'const htmlMm = (value: number) => value * MM_TO_PT' "El renderer PDF debe declarar conversión explícita desde mm."
Assert-Contains $issueFunction 'const layout = {' "El renderer PDF debe usar una matriz de layout equivalente al HTML."
Assert-Contains $issueFunction 'topRuleHeight: htmlMm(3)' "El PDF debe igualar la regla superior de 3mm del HTML."
Assert-Contains $issueFunction 'contentX: htmlMm(22)' "El PDF debe usar el padding horizontal de 22mm del HTML."
Assert-Contains $issueFunction 'logoHeight: htmlMm(30)' "El logo del PDF debe respetar la altura de 30mm del HTML."
Assert-Contains $issueFunction 'qrCardSize: htmlMm(43)' "La tarjeta QR del PDF debe crecer al menos 25% respecto a la versión inicial."
Assert-Contains $issueFunction 'qrImageSize: htmlMm(31)' "El QR del PDF debe crecer junto con su bloque para mejorar legibilidad."
Assert-Contains $issueFunction 'drawRightAlignedText' "El texto superior del QR debe alinearse a la derecha."
Assert-Contains $issueFunction 'qrCardY = layout.pageHeight - layout.contentTop - htmlMm(10) - layout.qrCardSize' "El QR debe bajar respecto del encabezado para equilibrar el certificado."
Assert-Contains $issueFunction 'y: qrY - 52' "El bloque de validación debe quedar suficientemente separado del QR."
Assert-Contains $issueFunction 'rightX: layout.pageWidth - htmlMm(4)' "El rótulo superior del QR debe quedar más a la derecha."
Assert-Contains $issueFunction 'mainTop: 184 - htmlMm(12.5)' "El bloque principal debe subir al menos 1.25 cm para dejar espacio hacia las firmas."
Assert-Contains $issueFunction 'signatureSpaceHeight: htmlMm(18)' "Las firmas deben reservar 18mm antes de la línea, como el HTML."
Assert-Contains $issueFunction 'drawTopRuleGradient' "La banda superior del PDF debe simular gradiente, no dos bloques planos."
Assert-Contains $issueFunction 'const steps = 96' "El gradiente superior debe tener suficientes pasos para no verse cortado en dos colores."
Assert-Contains $issueFunction 'page.drawEllipse' "El PDF debe replicar los círculos decorativos del HTML."
Assert-Contains $issueFunction 'page.drawSvgPath(' "El PDF debe replicar la onda decorativa del HTML."
Assert-Contains $issueFunction 'xScale: htmlMm(72)' "El estampe decorativo debe tener presencia visual suficiente."
Assert-Contains $issueFunction 'borderWidth: 4' "La onda del estampe debe ser visible, no apenas decorativa."
Assert-Contains $issueFunction 'const signatureLineY = footerY + 42' "La línea de firma no debe cruzar los datos de duración y fecha."
Assert-Contains $issueFunction 'drawWrappedText' "El PDF debe envolver la descripción con una caja equivalente al HTML."
Assert-Contains $issueFunction 'uploadCertificateToNextcloud' "La función debe tener seam de upload WebDAV."
Assert-Contains $issueFunction 'ensureNextcloudDirectory' "La función debe crear carpetas WebDAV antes de subir el PDF."
Assert-Order $issueFunction 'await ensureNextcloudDirectory(directoryPath)' "method: 'PUT'" "La función debe crear la carpeta Nextcloud antes del PUT del PDF."
Assert-Contains $issueFunction 'sendCertificateEmail' "La función debe enviar correo solo después del upload."
Assert-Contains $issueFunction 'Idempotency-Key' "El correo debe usar idempotency key."
Assert-Contains $issueFunction 'response.status === 409' "Resend 409 por idempotency key repetida no debe invalidar un PDF ya subido."
Assert-Contains $issueFunction 'certificate_status' "La función debe actualizar estados de certificado."
Assert-Contains $issueFunction 'validation_url' "La función debe persistir URL de validación."
Assert-Contains $issueFunction 'buildDownloadCertificateUrl' "La función debe construir enlace público mediante download-certificate."
Assert-Contains $issueFunction '/functions/v1/download-certificate?code=' "El enlace de descarga debe apuntar al proxy download-certificate."
Assert-NotContains $issueFunction 'return targetUrl' "La función no debe devolver URL WebDAV directa como enlace público."
Assert-NotContains $issueFunction 'SUPABASE_PUBLISHABLE_KEY' "La función no debe usar publishable key server-side."
Assert-Order $issueFunction "if (existing?.codigo_certificado && ['uploaded', 'emailed'].includes(existing.certificate_status)" "certificate_status: 'rendering'" "La idempotencia exitosa debe retornar antes de sobrescribir el estado a rendering."
Assert-Contains $issueFunction "'Access-Control-Allow-Origin': '*'" "issue-certificate debe incluir CORS para llamadas desde navegador."
Assert-Contains $issueFunction "request.method === 'OPTIONS'" "issue-certificate debe responder preflight OPTIONS."
Assert-Contains $issueFunction "'Access-Control-Allow-Methods': 'POST, OPTIONS'" "issue-certificate debe permitir POST y OPTIONS."
Assert-Order $issueFunction "try {" "const supabaseUrl = requiredEnv('SUPABASE_URL')" "issue-certificate debe leer SUPABASE_URL dentro del try/catch de la solicitud para devolver errores JSON con CORS."
Assert-Order $issueFunction "try {" "const baseUrl = requiredEnv('CERTIFICATE_PUBLIC_BASE_URL')" "issue-certificate debe leer CERTIFICATE_PUBLIC_BASE_URL dentro del try/catch de la solicitud para devolver errores JSON con CORS."
Assert-Contains $issueFunction "return jsonResponse({ error: 'La función no está configurada.' }, 500)" "issue-certificate debe envolver errores de configuración en respuesta JSON con CORS."
Assert-NotContains $issueFunction '.upsert(' "issue-certificate no debe usar upsert porque puede sobrescribir codigo_certificado bajo concurrencia."
Assert-Contains $issueFunction '.insert({' "issue-certificate debe intentar INSERT primero para preservar códigos existentes."
Assert-Contains $issueFunction ".eq('id', claim.id)" "issue-certificate debe actualizar por id después de resolver el registro existente."
Assert-Contains $issueFunction "let createdClaim = false" "issue-certificate debe distinguir si esta invocación creó el claim."
Assert-Contains $issueFunction "claim.certificate_status === 'rendering' && !createdClaim" "issue-certificate debe devolver pendiente si otra invocación ya está renderizando."
Assert-Contains $issueFunction "status: 'pending'" "issue-certificate debe responder pending para claims en rendering de otra invocación."
Assert-Order $issueFunction "claim.certificate_status === 'rendering' && !createdClaim" "const pdfBytes = await renderCertificatePdf" "El claim rendering de otra invocación debe cortar antes de renderizar PDF."
Assert-Order $issueFunction "claim.certificate_status === 'rendering' && !createdClaim" "await uploadCertificateToNextcloud" "El claim rendering de otra invocación debe cortar antes de subir PDF."
Assert-Order $issueFunction "claim.certificate_status === 'rendering' && !createdClaim" "await sendCertificateEmail" "El claim rendering de otra invocación debe cortar antes de enviar correo."

Assert-Contains $downloadFunction 'NEXTCLOUD_WEBDAV_URL' "download-certificate debe leer WebDAV desde secrets server-side."
Assert-Contains $downloadFunction 'NEXTCLOUD_USERNAME' "download-certificate debe leer usuario Nextcloud desde secrets server-side."
Assert-Contains $downloadFunction 'NEXTCLOUD_APP_PASSWORD' "download-certificate debe leer app password Nextcloud desde secrets server-side."
Assert-Contains $downloadFunction "'uploaded', 'emailed'" "download-certificate solo debe servir certificados subidos o enviados."
Assert-Contains $downloadFunction "'Content-Type': 'application/pdf'" "download-certificate debe responder como PDF."
Assert-Contains $downloadFunction 'nextcloud_path' "download-certificate debe resolver la ruta privada desde base de datos."
Assert-NotContains $downloadFunction 'public_certificate_url' "download-certificate no debe depender de un enlace público de Nextcloud."
Assert-NotContains $downloadFunction 'SUPABASE_PUBLISHABLE_KEY' "download-certificate no debe usar publishable key server-side."

Assert-NotContains $validateFunction 'validate_certificate_public' "La validación no debe depender de una RPC pública security definer."
Assert-Contains $validateFunction 'eccia_masterclass_certificados' "La función de validación debe consultar la tabla con service role server-side."
Assert-Contains $validateFunction "'Access-Control-Allow-Origin': '*'" "validate-certificate debe incluir CORS para llamadas desde navegador."
Assert-Contains $validateFunction "request.method === 'OPTIONS'" "validate-certificate debe responder preflight OPTIONS."
Assert-Contains $validateFunction "'Access-Control-Allow-Methods': 'GET, OPTIONS'" "validate-certificate debe permitir GET y OPTIONS."
Assert-Contains $validateFunction 'code' "La función de validación debe aceptar código."
Assert-Contains $validateFunction 'valid' "La respuesta pública debe indicar si es válido."
Assert-Contains $validateFunction 'duration' "La validación debe devolver duración."
Assert-Contains $validateFunction 'event_date' "La validación debe devolver fecha."
Assert-NotContains $validateFunction 'NEXTCLOUD_APP_PASSWORD' "La función pública no debe leer secretos de Nextcloud."

Assert-Contains $supabaseConfig '[functions.validate-certificate]' "config.toml debe declarar validate-certificate."
Assert-Contains $supabaseConfig '[functions.download-certificate]' "config.toml debe declarar download-certificate."
Assert-Contains $supabaseConfig 'verify_jwt = false' "Las funciones públicas por código deben tener verify_jwt = false."
Assert-ContainsBlock $supabaseConfig "[functions.validate-certificate]`nverify_jwt = false" "validate-certificate debe desactivar verificación JWT."
Assert-ContainsBlock $supabaseConfig "[functions.download-certificate]`nverify_jwt = false" "download-certificate debe desactivar verificación JWT."
Assert-ContainsBlock $supabaseConfig "[functions.issue-certificate]`nverify_jwt = false" "issue-certificate debe desactivar verificación JWT porque usa validación server-side propia."

Assert-Contains $validationPage 'validar-certificado' "La página debe ser específica de validación."
Assert-Contains $validationPage 'code=' "La página debe leer código desde URL."
Assert-Contains $validationPage 'validate-certificate' "La página debe consultar la función validate-certificate."
Assert-Contains $validationPage 'Certificado v' "La página debe mostrar estado válido."
Assert-Contains $validationPage 'Seminario de Ultrasonido Industrial Nivel I' "La validación pública debe mostrar Seminario, no Curso."
Assert-Contains $validationPage 'Duración' "La validación pública debe mostrar duración."
Assert-Contains $validationPage 'Fecha' "La validación pública debe mostrar fecha."
Assert-NotContains $validationPage 'Curso de Ultrasonido Industrial Nivel I' "La validación pública no debe usar Curso como tipo de evento."

Assert-Contains $certificateTemplate '{{qr_code_data_uri}}' "El template debe conservar placeholder de QR."
Assert-Contains $certificateTemplate '{{codigo_certificado}}' "El template debe conservar placeholder de código."

Assert-Contains $clientScript 'issue-certificate' "El cliente debe llamar la Edge Function de emisión."
Assert-NotContains $clientScript 'eccia_masterclass_certificados' "El cliente ya no debe insertar directo en la tabla."
Assert-NotContains $validationPage 'SUPABASE_SERVICE_ROLE_KEY' "La página pública no debe exponer service role key."
Assert-NotContains $validationPage 'SUPABASE_SECRET_KEYS' "La página pública no debe exponer secretos Supabase."
Assert-NotContains $validationPage 'NEXTCLOUD_WEBDAV_URL' "La página pública no debe exponer URL WebDAV."
Assert-NotContains $validationPage 'NEXTCLOUD_USERNAME' "La página pública no debe exponer usuario Nextcloud."
Assert-NotContains $validationPage 'NEXTCLOUD_APP_PASSWORD' "La página pública no debe exponer app password Nextcloud."
Assert-NotContains $clientScript 'SUPABASE_SERVICE_ROLE_KEY' "El cliente público no debe exponer service role key."
Assert-NotContains $clientScript 'SUPABASE_SECRET_KEYS' "El cliente público no debe exponer secretos Supabase."
Assert-NotContains $clientScript 'NEXTCLOUD_WEBDAV_URL' "El cliente público no debe exponer URL WebDAV."
Assert-NotContains $clientScript 'NEXTCLOUD_USERNAME' "El cliente público no debe exponer usuario Nextcloud."
Assert-NotContains $clientScript 'NEXTCLOUD_APP_PASSWORD' "El cliente público no debe exponer app password Nextcloud."

Write-Output "Certificate generation checks: OK"

