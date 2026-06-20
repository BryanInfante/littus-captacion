$ErrorActionPreference = "Stop"

$indexPath = Join-Path $PSScriptRoot "..\public\index.html"
$stylesPath = Join-Path $PSScriptRoot "..\public\styles.css"

if (-not (Test-Path -LiteralPath $indexPath)) {
    throw "Falta public/index.html"
}

$html = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
$styles = Get-Content -LiteralPath $stylesPath -Raw -Encoding UTF8

function Assert-Contains {
    param(
        [string]$Needle,
        [string]$Message
    )

    if (-not $html.Contains($Needle)) {
        throw $Message
    }
}

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

$sectionIds = @(
    "hero",
    "perfil",
    "beneficios",
    "instructor",
    "respaldo",
    "cierre",
    "faq"
)

$lastPosition = -1
foreach ($sectionId in $sectionIds) {
    $position = $html.IndexOf("id=`"$sectionId`"")
    Assert-True ($position -gt $lastPosition) "La sección '$sectionId' falta o está fuera de orden."
    $lastPosition = $position
}

Assert-Contains 'id="inscripcion"' "El formulario principal debe usar id='inscripcion'."
Assert-Contains 'name="nombre"' "Falta el campo nombre."
Assert-Contains 'type="email"' "Falta el campo correo electrónico."
Assert-Contains 'Con certificado' "Falta el beneficio de certificado."
Assert-Contains 'Online y en directo' "Falta el beneficio online."
Assert-Contains '2 horas' "Falta la duración del webinar."

$formCount = ([regex]::Matches($html, "<form\b")).Count
Assert-True ($formCount -eq 1) "Debe existir exactamente un formulario."

$ctaCount = ([regex]::Matches($html, 'href="#inscripcion"')).Count
Assert-True ($ctaCount -ge 6) "Los CTA secundarios deben apuntar a #inscripcion."

Assert-Contains 'Inspector Senior de Soldadura AWS SCWI' "Falta la certificación AWS SCWI."
Assert-Contains '23050028' "Falta el registro AWS SCWI."
Assert-Contains 'Inspector ASNT Nivel III' "Falta la certificación ASNT Nivel III."
Assert-Contains '175531' "Falta el registro ASNT."
Assert-Contains 'Inspector Autorizado API 577' "Falta la certificación API 577."
Assert-Contains '111363' "Falta el registro API."
Assert-Contains '20 a' "Falta la experiencia declarada."

Assert-Contains '02 de julio' "Debe mostrarse la fecha confirmada."
Assert-Contains '18h00 a 20h00' "Debe mostrarse el horario confirmado."
Assert-Contains 'Validez internacional, avalado por Littus Group America.' "Debe mostrarse la validez internacional del certificado."
Assert-Contains 'Este webinar no tiene' "Debe indicarse que el webinar no tiene límite de cupos."
Assert-Contains 'por el canal de YouTube.' "Debe indicarse que el webinar se transmitirá por YouTube."
Assert-Contains 'El enlace de' "Debe aclararse que el enlace de YouTube aún no está disponible."
Assert-Contains 'acceso se enviar' "Debe aclararse que el enlace de YouTube aún no está disponible."
Assert-Contains 'cuando est' "Debe aclararse que el enlace de YouTube aún no está disponible."
Assert-Contains 'Solo necesitas una laptop' "Deben mostrarse los requisitos confirmados."
Assert-Contains 'estable a internet.' "Deben mostrarse los requisitos confirmados."
Assert-Contains 'src/foto_instructor.png' "La sección del instructor debe mostrar la fotografía disponible."
Assert-Contains 'alt="Marco Aucancela, instructor del webinar Domina el Scan A"' "La fotografía debe tener un texto alternativo descriptivo."
Assert-True (-not $html.Contains('[PENDIENTE: foto de Marco Aucancela]')) "No debe mostrarse el placeholder cuando la fotografía está disponible."
Assert-Contains 'class="instructor-intro"' "La sección del instructor debe tener una introducción visual independiente."
Assert-Contains 'class="speaker-identity"' "La fotografía debe incluir una ficha de identidad profesional."
Assert-Contains 'class="speaker-highlights"' "La sección debe destacar la experiencia y credenciales principales."
Assert-Contains 'class="speaker-details"' "La trayectoria debe presentarse en un bloque estructurado."

Assert-True (-not $html.Contains('[PENDIENTE: confirmar cupo disponible o fecha del evento]')) "No debe quedar pendiente la información de cupos o fecha."
Assert-True (-not $html.Contains('[PENDIENTE: indicar plataforma y proceso de acceso]')) "No debe quedar pendiente la plataforma de acceso."
Assert-True (-not $html.Contains('[PENDIENTE: confirmar si se requiere software o equipo adicional]')) "No deben quedar pendientes los requisitos técnicos."

Assert-Contains 'brand/tokens.css' "La landing debe cargar los tokens ECCIA."
Assert-Contains 'brand/assets/logo-dark.png' "La landing debe usar el logo ECCIA para interfaz oscura."

if ($styles.Contains('font-size: .72rem')) {
    throw "Los textos funcionales no deben usar tamaños inferiores a .8rem."
}

if ($styles.Contains('font-size: .75rem')) {
    throw "Los textos funcionales pequeños deben tener al menos .8rem."
}

if ($styles.Contains('font-size: .78rem')) {
    throw "El texto del footer debe tener al menos .8rem."
}

$functionalDetailSelectors = @(
    '.authority-line',
    '.form-note, .form-status',
    '.topic-list span',
    '.pending-inline',
    '.footer-inner'
)

foreach ($selector in $functionalDetailSelectors) {
    $rulePattern = [regex]::Escape($selector) + '\s*\{[^}]*font-family:\s*var\(--font-body\)'
    Assert-True ([regex]::IsMatch($styles, $rulePattern)) "El selector '$selector' debe usar Inter mediante --font-body."
}

$instructorStyleSelectors = @(
    '.instructor-section',
    '.instructor-intro',
    '.speaker-identity',
    '.speaker-highlights',
    '.speaker-details'
)

foreach ($selector in $instructorStyleSelectors) {
    Assert-True ($styles.Contains($selector)) "Faltan estilos para '$selector' en la sección del instructor."
}

Write-Output "Landing checks: OK"
