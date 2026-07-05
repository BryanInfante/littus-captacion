$ErrorActionPreference = "Stop"

$pagePath = Join-Path $PSScriptRoot "..\public\regalos.html"
$scriptPath = Join-Path $PSScriptRoot "..\public\certificados.js"
$stylesPath = Join-Path $PSScriptRoot "..\public\styles.css"
$migrationPath = Join-Path $PSScriptRoot "..\supabase\migrations\20260703145000_add_masterclass_certificate_claims.sql"
$glossaryPath = Join-Path $PSScriptRoot "..\public\descargas\glosario-terminos.pdf"
$guidePath = Join-Path $PSScriptRoot "..\public\descargas\guia-interpretacion-scan-a.pdf"
$brochurePath = Join-Path $PSScriptRoot "..\public\descargas\brochure-ultrasonido-nivel-i.pdf"

foreach ($path in @($pagePath, $scriptPath, $stylesPath, $migrationPath)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Falta archivo requerido: $path" }
}

$html = Get-Content -LiteralPath $pagePath -Raw -Encoding UTF8
$script = Get-Content -LiteralPath $scriptPath -Raw -Encoding UTF8
$styles = Get-Content -LiteralPath $stylesPath -Raw -Encoding UTF8
$migration = Get-Content -LiteralPath $migrationPath -Raw -Encoding UTF8

function Assert-Contains([string]$Source, [string]$Needle, [string]$Message) {
    if (-not $Source.Contains($Needle)) { throw $Message }
}

function Assert-NotContains([string]$Source, [string]$Needle, [string]$Message) {
    if ($Source.Contains($Needle)) { throw $Message }
}

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

Assert-Contains $html '<html lang="es">' "La página debe declararse en español."
Assert-Contains $html 'Masterclass Ultrasonido Industrial' "La página debe usar el nombre final de la masterclass."
Assert-Contains $html 'Entrega de regalos y certificados' "La página debe explicar el objetivo operativo."
Assert-Contains $html 'src="brand/assets/logo-dark2.png"' "La página debe usar el mismo logo de header que la landing principal."
Assert-Contains $html 'id="certificado-form"' "La página debe incluir el formulario de certificado."
Assert-Contains $html 'Certificado de asistencia' "El hero debe enfocarse en el certificado, no solo en confirmar el nombre."
Assert-NotContains $html 'Confirma tu nombre completo' "El hero no debe usar el título anterior de confirmación de nombre."
Assert-Contains $html 'name="nombre_completo"' "El formulario debe pedir nombre completo."
Assert-Contains $html 'autocomplete="name"' "El campo de nombre debe facilitar autocompletado correcto."
Assert-Contains $html 'name="correo"' "El formulario debe pedir correo."
Assert-Contains $html 'type="email"' "El correo debe usar input type email."
Assert-Contains $html 'autocomplete="email"' "El correo debe facilitar autocompletado correcto."
Assert-Contains $html 'mismo correo con el que te inscribiste' "La página debe indicar que el correo debe coincidir con la inscripción."
Assert-Contains $html 'required' "El nombre completo debe ser obligatorio."
Assert-NotContains $html 'marketing_consent' "Esta página no debe pedir consentimiento comercial."
Assert-Contains $html 'certificados.js' "La página debe cargar el script de certificados."
Assert-Contains $html 'role="status"' "El resultado del formulario debe ser una región de estado."
Assert-Contains $html 'id="recursos"' "La página debe dejar creada la sección de recursos descargables."
Assert-Contains $html 'Glosario de Ultrasonido Industrial' "La página debe incluir el recurso de glosario."
Assert-Contains $html 'descargas/glosario-terminos.pdf' "El glosario debe apuntar a un archivo descargable."
Assert-Contains $html 'guia-interpretacion-scan-a.pdf' "La guía debe apuntar a un archivo descargable."
Assert-Contains $html 'Obtener mi certificado' "El CTA del formulario debe enfocarse en obtener el certificado."
Assert-NotContains $html 'Registrar mi nombre' "El CTA del formulario no debe usar el texto anterior."
Assert-Contains $html 'src="src/glosario-terminos.webp"' "El recurso de glosario debe mostrar la portada real del PDF."
Assert-Contains $html 'src="src/guia-interpretacion-scan-a.webp"' "El recurso de guía debe mostrar la portada real del PDF."
Assert-Contains $html 'gift-feature__media' "Cada regalo debe tener su propia sección dedicada con imagen."
Assert-Contains $html '5% de descuento' "La sección de siguiente paso debe comunicar el descuento para asistentes."
Assert-Contains $html 'paso recomendado' "La página debe incluir una sección de siguiente paso."
Assert-Contains $html 'Entrenamiento de Ultrasonido Nivel I' "La página debe invitar al entrenamiento de Ultrasonido Nivel I."
Assert-Contains $html 'src="src/curso_ut.webp"' "La sección de siguiente paso debe usar la imagen del curso proporcionada."
Assert-Contains $html 'Descargar brochure' "La sección de siguiente paso debe tener CTA de brochure."
Assert-Contains $html 'descargas/brochure-ultrasonido-nivel-i.pdf' "El brochure debe apuntar a un archivo descargable."
Assert-Contains $html 'href="https://wa.me/593999766694"' "La sección debe enlazar al WhatsApp correcto para solicitar más información."
Assert-Contains $html '<footer aria-label="Información de ECCIA">' "La página debe incluir footer."
Assert-Contains $html 'class="footer-logo"' "El footer debe reutilizar el logo institucional."

Assert-Contains $script 'issue-certificate' "El script debe llamar la Edge Function de emisión de certificados."
Assert-Contains $script 'nombre_completo: form.elements.nombre_completo.value.trim()' "El script debe enviar el nombre completo normalizado."
Assert-Contains $script 'correo: form.elements.correo.value.trim().toLowerCase()' "El script debe enviar el correo normalizado."
Assert-NotContains $script 'marketing_consent' "El script no debe persistir consentimiento comercial."
Assert-Contains $script 'method: "POST"' "El script debe enviar mediante POST."
Assert-NotContains $script 'rest/v1/eccia_masterclass_certificados' "El navegador no debe insertar directo en la tabla de certificados."
Assert-Contains $script 'status.focus()' "El estado debe recibir foco tras el envío."
Assert-Contains $script 'prefers-reduced-motion: reduce' "El efecto de spotlight debe respetar movimiento reducido."
Assert-Contains $script 'spotlight.style.setProperty("--mx"' "El hero debe actualizar el spotlight con la posición del cursor."

Assert-Contains $styles '.claim-page' "Faltan estilos para la página de entrega."
Assert-Contains $styles '.claim-card' "Faltan estilos para la tarjeta del formulario."
Assert-Contains $styles '.claim-summary' "Faltan estilos para el resumen operativo."
Assert-Contains $styles '.claim-hero' "El hero de regalos debe tener superficie visual propia."
Assert-Contains $styles '.claim-hero.spotlight::before' "El hero debe reutilizar el efecto difuminado con acento."
Assert-Contains $styles '.gift-feature' "Faltan estilos para las secciones dedicadas de cada regalo."
Assert-Contains $styles '.gift-feature__media' "Falta el marco con acento cyan para que las portadas oscuras no se pierdan en el fondo."
Assert-Contains $styles '.course-next' "Faltan estilos para la sección de siguiente paso."
Assert-Contains $styles '.course-next__discount' "Faltan estilos para destacar el descuento del 5%."
Assert-Contains $styles '.course-next__media::after' "La imagen profesional debe tener overlay."
Assert-Contains $styles 'course-next__media::after { content: ""; position: absolute; z-index: 1;' "El overlay de la imagen del curso debe quedar encima de la imagen."
Assert-Contains $styles '.course-next__media img { position: relative; z-index: 0;' "La imagen del curso debe quedar debajo del overlay."
Assert-Contains $styles 'rgba(0,0,0,.88)' "El overlay de la imagen del curso debe terminar en negro degradado visible."
Assert-Contains $styles '.course-next__actions' "Faltan estilos para los CTAs del siguiente paso."

Assert-Contains $migration 'create table if not exists public.eccia_masterclass_certificados' "La migración debe crear la tabla."
Assert-Contains $migration 'nombre_completo text not null' "La tabla debe guardar nombre completo obligatorio."
Assert-Contains $migration 'correo text not null' "La tabla debe guardar el correo de inscripción."
Assert-Contains $migration 'lower(btrim(correo))' "La tabla debe normalizar el correo."
Assert-Contains $migration 'enable row level security' "La tabla debe tener RLS habilitado."
Assert-Contains $migration 'grant insert on table public.eccia_masterclass_certificados to anon' "El rol anon solo debe poder insertar."
Assert-Contains $migration 'with check (true)' "Debe existir política de inserción pública controlada por constraints."
Assert-True (Test-Path -LiteralPath $glossaryPath) "Falta el PDF descargable del glosario."
Assert-True (Test-Path -LiteralPath $guidePath) "Falta el PDF descargable de la guía Scan A."
Assert-True (Test-Path -LiteralPath $brochurePath) "Falta el PDF descargable del brochure."

Write-Output "Certificate claim checks: OK"
