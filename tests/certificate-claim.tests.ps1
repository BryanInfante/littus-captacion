$ErrorActionPreference = "Stop"

$pagePath = Join-Path $PSScriptRoot "..\public\regalos.html"
$scriptPath = Join-Path $PSScriptRoot "..\public\certificados.js"
$stylesPath = Join-Path $PSScriptRoot "..\public\styles.css"
$migrationPath = Join-Path $PSScriptRoot "..\supabase\migrations\20260703145000_add_masterclass_certificate_claims.sql"

if (-not (Test-Path -LiteralPath $pagePath)) {
    throw "Falta public/regalos.html"
}

if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Falta public/certificados.js"
}

if (-not (Test-Path -LiteralPath $migrationPath)) {
    throw "Falta la migración de certificados y regalos."
}

$html = Get-Content -LiteralPath $pagePath -Raw -Encoding UTF8
$script = Get-Content -LiteralPath $scriptPath -Raw -Encoding UTF8
$styles = Get-Content -LiteralPath $stylesPath -Raw -Encoding UTF8
$migration = Get-Content -LiteralPath $migrationPath -Raw -Encoding UTF8

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

Assert-Contains $html '<html lang="es">' "La página debe declararse en español."
Assert-Contains $html 'Masterclass Ultrasonido Industrial - Interpretación del Scan-A' "La página debe usar el nombre final de la masterclass."
Assert-Contains $html 'Entrega de regalos y certificados' "La página debe explicar el objetivo operativo."
Assert-Contains $html 'id="certificado-form"' "La página debe incluir el formulario de certificado."
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

Assert-Contains $script 'eccia_masterclass_certificados' "El script debe enviar datos a la tabla de certificados."
Assert-Contains $script 'nombre_completo: form.elements.nombre_completo.value.trim()' "El script debe persistir el nombre completo normalizado."
Assert-Contains $script 'correo: form.elements.correo.value.trim().toLowerCase()' "El script debe persistir el correo normalizado."
Assert-NotContains $script 'marketing_consent' "El script no debe persistir consentimiento comercial."
Assert-Contains $script 'method: "POST"' "El script debe insertar mediante POST."
Assert-Contains $script 'Prefer: "return=minimal"' "El envío no debe exponer datos de vuelta al navegador."
Assert-Contains $script 'status.focus()' "El estado debe recibir foco tras el envío."

Assert-Contains $styles '.claim-page' "Faltan estilos para la página de entrega."
Assert-Contains $styles '.claim-card' "Faltan estilos para la tarjeta del formulario."
Assert-Contains $styles '.claim-summary' "Faltan estilos para el resumen operativo."

Assert-Contains $migration 'create table if not exists public.eccia_masterclass_certificados' "La migración debe crear la tabla."
Assert-Contains $migration 'nombre_completo text not null' "La tabla debe guardar nombre completo obligatorio."
Assert-Contains $migration 'correo text not null' "La tabla debe guardar el correo de inscripción."
Assert-Contains $migration 'lower(btrim(correo))' "La tabla debe normalizar el correo."
Assert-Contains $migration 'enable row level security' "La tabla debe tener RLS habilitado."
Assert-Contains $migration 'grant insert on table public.eccia_masterclass_certificados to anon' "El rol anon solo debe poder insertar."
Assert-Contains $migration 'with check (true)' "Debe existir política de inserción pública controlada por constraints."

Write-Output "Certificate claim checks: OK"
