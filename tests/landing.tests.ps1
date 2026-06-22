$ErrorActionPreference = "Stop"

$indexPath = Join-Path $PSScriptRoot "..\public\index.html"
$stylesPath = Join-Path $PSScriptRoot "..\public\styles.css"
$appPath = Join-Path $PSScriptRoot "..\public\app.js"
$emailTemplatePath = Join-Path $PSScriptRoot "..\emails\eccia-base.html"
$emailGuidePath = Join-Path $PSScriptRoot "..\EMAIL_OPERATIONS.md"
$resendSyncPath = Join-Path $PSScriptRoot "..\supabase\functions\sync-resend-contact\index.ts"
$confirmationEmailPath = Join-Path $PSScriptRoot "..\emails\eccia-registration-confirmation.html"
$confirmationFunctionPath = Join-Path $PSScriptRoot "..\supabase\functions\send-registration-confirmation\index.ts"
$confirmationTemplatePath = Join-Path $PSScriptRoot "..\supabase\functions\send-registration-confirmation\template.ts"

if (-not (Test-Path -LiteralPath $indexPath)) {
    throw "Falta public/index.html"
}

$html = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
$styles = Get-Content -LiteralPath $stylesPath -Raw -Encoding UTF8
$app = Get-Content -LiteralPath $appPath -Raw -Encoding UTF8
$emailTemplate = if (Test-Path -LiteralPath $emailTemplatePath) {
    Get-Content -LiteralPath $emailTemplatePath -Raw -Encoding UTF8
} else {
    ""
}
$emailGuide = if (Test-Path -LiteralPath $emailGuidePath) {
    Get-Content -LiteralPath $emailGuidePath -Raw -Encoding UTF8
} else {
    ""
}
$resendSync = if (Test-Path -LiteralPath $resendSyncPath) {
    Get-Content -LiteralPath $resendSyncPath -Raw -Encoding UTF8
} else {
    ""
}
$confirmationEmail = if (Test-Path -LiteralPath $confirmationEmailPath) {
    Get-Content -LiteralPath $confirmationEmailPath -Raw -Encoding UTF8
} else {
    ""
}
$confirmationFunction = if (Test-Path -LiteralPath $confirmationFunctionPath) {
    Get-Content -LiteralPath $confirmationFunctionPath -Raw -Encoding UTF8
} else {
    ""
}
$confirmationTemplate = if (Test-Path -LiteralPath $confirmationTemplatePath) {
    Get-Content -LiteralPath $confirmationTemplatePath -Raw -Encoding UTF8
} else {
    ""
}

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
Assert-Contains 'class="skip-link"' "La página debe permitir saltar directamente al contenido."
Assert-Contains 'id="contenido-principal"' "El contenido principal debe ser un destino accesible."
Assert-True (-not $html.Contains('class="primary-nav"')) "El header no debe mostrar el menú de navegación antiguo."
Assert-True (-not $styles.Contains('.primary-nav')) "No deben quedar estilos sin uso del menú de navegación antiguo."
Assert-Contains 'name="nombre"' "Falta el campo nombre."
Assert-Contains 'type="email"' "Falta el campo correo electrónico."
Assert-Contains 'name="marketing_consent"' "Falta el consentimiento opcional para comunicaciones futuras."
Assert-Contains 'type="checkbox"' "El consentimiento de marketing debe usar una casilla explícita."
Assert-Contains 'Quiero recibir informaci' "El consentimiento debe explicar claramente qué acepta la persona."
Assert-Contains 'aria-describedby="form-note"' "El formulario debe asociar su nota informativa."
Assert-Contains 'id="form-note"' "La nota informativa del formulario debe tener un identificador."
Assert-Contains 'aria-describedby="nombre-help"' "El campo nombre debe asociar la indicación de obligatoriedad."
Assert-Contains 'id="nombre-help"' "El campo nombre debe tener ayuda accesible."
Assert-Contains 'aria-describedby="correo-help"' "El campo correo debe asociar la indicación de obligatoriedad."
Assert-Contains 'id="correo-help"' "El campo correo debe tener ayuda accesible."
Assert-Contains 'aria-hidden="true">*</span>' "Los campos obligatorios deben incluir un indicador visual no redundante."
Assert-Contains 'role="status"' "El resultado del formulario debe declararse como región de estado."
Assert-Contains 'aria-live="polite"' "El resultado del formulario debe anunciarse sin interrumpir."
Assert-Contains 'tabindex="-1"' "El resultado del formulario debe poder recibir foco programático."
Assert-Contains 'class="mobile-cta"' "La versión móvil debe mantener disponible el CTA principal."
Assert-Contains 'Con certificado' "Falta el beneficio de certificado."
Assert-Contains 'Online y en directo' "Falta el beneficio online."
Assert-Contains '2 horas' "Falta la duración del taller técnico."
Assert-Contains 'hero-editorial"' "El hero debe usar una composición editorial independiente."
Assert-Contains 'class="hero-metrics"' "Los datos clave del evento deben formar una banda técnica."
Assert-Contains 'class="registration-rail"' "El formulario debe funcionar como rail secundario y no competir con el titular."
Assert-Contains 'Taller t' "La experiencia debe presentar la actividad como taller técnico."
Assert-Contains 'cnico gratuito' "La experiencia debe presentar la actividad como taller técnico."
Assert-Contains 'Ultrasonido - Interpretaci' "La experiencia debe usar el nombre técnico definido para el evento."
Assert-Contains 'n del Scan A' "El nombre técnico del evento debe mencionar la interpretación del Scan A."
Assert-True ($html.Contains('<h1>Ultrasonido - Interpretación del <span>Scan A</span></h1>')) "El H1 debe contener el nombre estable del evento."
Assert-True ([regex]::IsMatch($html, 'Domina la lectura del Scan A y detecta lo que otros\s+inspectores\s+pasan por alto')) "La frase de impacto debe conservarse como apoyo editorial."
Assert-True (-not $html.Contains('<title>Domina el Scan A')) "La frase de impacto no debe utilizarse como nombre del evento en el título del documento."
Assert-True (-not [regex]::IsMatch($html, '\bwebinar\b', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) "No debe utilizarse la palabra webinar."
Assert-True (-not $html.Contains('hero-index')) "El hero no debe incluir índices ni texto vertical."
Assert-True (-not $html.Contains('hero-signal')) "El hero no debe incluir una simulación decorativa del Scan A."
Assert-True (-not $html.Contains('scan-waveform')) "El hero no debe incluir waveforms decorativos."

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
Assert-Contains 'Este taller t' "Debe indicarse que el taller técnico no tiene límite de cupos."
Assert-Contains 'cnico no tiene' "Debe indicarse que el taller técnico no tiene límite de cupos."
Assert-Contains 'por el canal de YouTube.' "Debe indicarse que el taller técnico se transmitirá por YouTube."
Assert-Contains 'https://www.youtube.com/live/yW3OQFl76kg?si=F1X3As2vkM9lQ6v_' "La landing debe incluir el enlace real del live."
Assert-True (-not $html.Contains('acceso se enviará cuando esté disponible')) "La landing no debe conservar el texto obsoleto sobre el acceso."
Assert-Contains 'Solo necesitas una laptop' "Deben mostrarse los requisitos confirmados."
Assert-Contains 'estable a internet.' "Deben mostrarse los requisitos confirmados."
Assert-Contains 'src/foto_instructor.png' "La sección del instructor debe mostrar la fotografía disponible."
Assert-Contains 'alt="Marco Aucancela, instructor de Ultrasonido - Interpretaci' "La fotografía debe usar el nombre técnico del evento."
Assert-Contains 'n del Scan A"' "La fotografía debe tener un texto alternativo descriptivo."
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

$globalUxSelectors = @(
    '.skip-link',
    ':focus-visible',
    '.mobile-cta',
    'scroll-margin-top'
)

foreach ($selector in $globalUxSelectors) {
    Assert-True ($styles.Contains($selector)) "Falta la mejora UX global '$selector'."
}

Assert-True ($styles.Contains('env(safe-area-inset-bottom')) "El CTA fijo móvil debe respetar el área segura inferior."
Assert-True ($styles.Contains('.required-mark')) "Falta el estilo del indicador de campo obligatorio."
Assert-True ($styles.Contains('.field-help')) "Falta el estilo de la ayuda accesible de los campos."
Assert-True ($app.Contains('prefers-reduced-motion: reduce')) "El spotlight debe respetar la preferencia de movimiento reducido."
Assert-True ($app.Contains('status.focus()')) "El mensaje de resultado debe recibir foco tras completar el formulario."
Assert-True ($app.Contains('https://qfbhyzynpyqqcpuuibod.supabase.co/rest/v1/eccia_taller_inscripciones')) "El formulario debe enviar las inscripciones a la tabla ECCIA de Supabase."
Assert-True ($app.Contains('sb_publishable_')) "El frontend debe usar una publishable key de Supabase."
Assert-True ($app.Contains('method: "POST"')) "La inscripción debe enviarse mediante POST."
Assert-True ($app.Contains('apikey: SUPABASE_PUBLISHABLE_KEY')) "La solicitud debe incluir el header apikey."
Assert-True ($app.Contains('Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`')) "La solicitud debe incluir autorización con la publishable key."
Assert-True ($app.Contains('nombre: form.elements.nombre.value.trim()')) "El nombre debe normalizarse antes de enviarse."
Assert-True ($app.Contains('correo: form.elements.correo.value.trim().toLowerCase()')) "El correo debe normalizarse antes de enviarse."
Assert-True ($app.Contains('marketing_consent: form.elements.marketing_consent.checked')) "La preferencia de comunicaciones debe persistirse de forma explícita."
Assert-True (-not [regex]::IsMatch($app, '\b(necesitás|revisá|intentá)\b', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) "El microcopy ECCIA debe usar español neutro tuteado."
Assert-True ($app.Contains('submitButton.disabled = true')) "El formulario debe impedir envíos duplicados mientras procesa la solicitud."
Assert-True ($app.Contains('response.status === 409')) "La interfaz debe manejar inscripciones duplicadas."
Assert-True ($app.Contains('error.code === "23505"')) "La interfaz debe reconocer la restricción única de PostgreSQL."
Assert-True ($app.Contains('No pudimos completar tu inscripción')) "La interfaz debe mostrar un error recuperable cuando falle la solicitud."
Assert-True ($app.Contains('Inscripción confirmada')) "La interfaz debe confirmar una inscripción persistida."
Assert-True ($app.Contains('Ultrasonido - Interpretación del Scan A')) "La confirmación del frontend debe usar el nombre técnico del evento."
Assert-True (-not $app.Contains('taller técnico Domina el Scan A')) "El frontend no debe tratar la frase editorial como nombre del evento."
Assert-True (-not $app.Contains('Registro de demostración completado')) "El formulario no debe conservar el flujo demostrativo."
Assert-True (-not $html.Contains('Formulario demostrativo')) "La nota del formulario debe describir la persistencia real."
Assert-True ($styles.Contains('.submit-button:disabled')) "El botón debe comunicar visualmente el estado de carga."
Assert-True ($styles.Contains('.form-status[data-state="error"]')) "El formulario debe diferenciar visualmente los errores."
Assert-True ($styles.Contains('.consent-field')) "El consentimiento debe tener un tratamiento visual accesible."
Assert-True ($styles.Contains('.consent-field input')) "La casilla de consentimiento debe conservar un control nativo claramente visible."
Assert-Contains 'id="registration-success-modal"' "Falta el modal posterior a la inscripción."
Assert-Contains 'role="dialog"' "El modal debe exponerse como diálogo accesible."
Assert-Contains 'aria-modal="true"' "El modal debe declararse modal para tecnologías de asistencia."
Assert-Contains 'aria-labelledby="registration-success-title"' "El modal debe tener un nombre accesible."
Assert-Contains 'data-modal-close' "El modal debe ofrecer un control de cierre."
Assert-Contains 'https://chat.whatsapp.com/EnFIAc8hBNc5Xn4jufjeGD' "El modal debe incluir la comunidad de WhatsApp."
Assert-Contains 'rel="noopener noreferrer"' "Los enlaces externos deben abrirse de forma segura."
Assert-True ($styles.Contains('.registration-modal')) "Faltan estilos para el modal de confirmación."
Assert-True ($styles.Contains('.registration-modal::backdrop')) "El modal debe tener un backdrop identificable."
Assert-True ($styles.Contains('.registration-modal__dialog')) "El diálogo debe tener una superficie visual ECCIA."
Assert-True ($app.Contains('registrationModal.showModal()')) "El modal debe abrirse tras una inscripción exitosa."
Assert-True ($app.Contains('event.key === "Escape"')) "El modal debe poder cerrarse con Escape."
Assert-True ($app.Contains('event.target === registrationModal')) "El modal debe cerrarse al activar el backdrop."
Assert-True ($app.Contains('previouslyFocusedElement?.focus()')) "El modal debe devolver el foco al elemento previo."
Assert-True ($app.Contains('getFocusableElements')) "El modal debe contener el foco mientras está abierto."
Assert-True ($app.Contains('modalPrimaryAction.focus()')) "El foco inicial debe ir a la acción principal."
Assert-True ($styles.Contains('clamp(2.75rem, 7vw, 4.75rem)')) "El titular del hero debe usar la escala editorial definida por ECCIA."
Assert-True ($styles.Contains('.hero-editorial')) "Faltan estilos para la composición editorial del hero."
Assert-True ($styles.Contains('.registration-rail')) "Faltan estilos para subordinar visualmente el formulario."
Assert-True (-not $styles.Contains('writing-mode: vertical-rl')) "El diseño no debe usar texto vertical."
Assert-True (-not $styles.Contains('counter-increment: editorial-section')) "Las secciones no deben numerarse artificialmente."
Assert-True (-not $styles.Contains('.section::before')) "Las secciones no deben mostrar numeración decorativa."
Assert-True (-not $styles.Contains('.hero-signal')) "No deben quedar estilos de la simulación Scan A eliminada."
Assert-True (-not $styles.Contains('.scan-waveform')) "No deben quedar estilos del waveform eliminado."
Assert-True (-not $styles.Contains('.hero::after')) "El hero no debe incluir una línea vertical decorativa."
Assert-True (-not $styles.Contains('padding-left: var(--space-xl); border-left: 1px solid var(--eccia-border-strong)')) "El formulario no debe separarse con una línea vertical decorativa."
Assert-True (-not $styles.Contains('padding-top: var(--space-xl); border-top: 1px solid var(--eccia-border-strong)')) "Los layouts de sección no deben comenzar con líneas horizontales decorativas."
Assert-True (-not $styles.Contains('.card-grid { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; border-block: 1px solid var(--eccia-border-strong); }')) "El bloque de recursos no debe encerrarse entre líneas horizontales."
Assert-True (-not $styles.Contains('border-width: 1px 0')) "El bloque institucional no debe usar líneas horizontales decorativas."
Assert-Contains 'class="section authority-section"' "El respaldo institucional debe ser una sección autónoma."
Assert-Contains 'class="container authority-layout"' "El respaldo institucional debe usar un layout editorial, no una tarjeta."
Assert-Contains 'class="authority-media"' "El respaldo institucional debe incluir una imagen protagonista."
Assert-Contains 'src="src/portada.webp"' "El respaldo institucional debe usar la fotografía portada.webp."
Assert-Contains 'alt="Participantes de una formaci' "La fotografía institucional debe tener texto alternativo descriptivo."
Assert-Contains 'n t' "La fotografía institucional debe tener texto alternativo descriptivo."
Assert-Contains 'cnica de Littus Group Am' "La fotografía institucional debe tener texto alternativo descriptivo."
Assert-Contains 'rica con sus certificados"' "La fotografía institucional debe tener texto alternativo descriptivo."
Assert-True (-not $html.Contains('container authority-card tech-card')) "El respaldo institucional no debe ser una tarjeta dentro de otra sección."
Assert-True (-not $html.Contains('class="authority-brand"')) "La sección institucional no debe forzar otra aparición del logo."
Assert-True (-not $styles.Contains('.authority-card')) "No deben quedar estilos de la tarjeta institucional anterior."
Assert-True ($styles.Contains('.authority-layout')) "Faltan estilos para el nuevo layout institucional."
Assert-True ($styles.Contains('.authority-media')) "Faltan estilos para la imagen institucional."
Assert-True ($styles.Contains('.authority-copy')) "Faltan estilos para el contenido institucional."
Assert-True ($styles.Contains('.authority-media::after')) "La fotografía institucional debe incorporar un overlay."
Assert-True ($styles.Contains('linear-gradient(180deg, rgba(10,14,19,.04)')) "El overlay debe usar un gradiente negro progresivo."
Assert-True ($styles.Contains('pointer-events: none')) "El overlay de la fotografía no debe interceptar interacción."
Assert-Contains 'footer-grid"' "El footer debe organizar identidad, navegación y redes."
Assert-Contains 'href="https://cursos.littusgroup.com"' "El footer debe enlazar al sitio real de cursos."
Assert-Contains 'href="https://littusgroup.com"' "El footer debe enlazar al sitio real de servicios."
Assert-Contains 'class="social-placeholder"' "Las redes sin URL deben ser placeholders semánticos no interactivos."
Assert-True (-not [regex]::IsMatch($html, '<a[^>]+href="#"[^>]*>\s*(Facebook|Instagram|TikTok|LinkedIn|YouTube)')) "El footer no debe inventar enlaces de redes."
foreach ($network in @('Facebook', 'Instagram', 'TikTok', 'LinkedIn', 'YouTube')) {
    Assert-Contains ">$network<" "Falta el placeholder semántico para $network."
}
Assert-True ($styles.Contains('.footer-navigation')) "Faltan estilos para la navegación del footer."
Assert-True ($styles.Contains('.footer-socials')) "Faltan estilos para las redes del footer."

Assert-True (Test-Path -LiteralPath $emailTemplatePath) "Falta la plantilla maestra de correo ECCIA."
Assert-True ($emailTemplate.Contains('{{{contact.first_name|profesional}}}')) "La plantilla debe admitir personalización segura del saludo."
Assert-True ($emailTemplate.Contains('{{{RESEND_UNSUBSCRIBE_URL}}}')) "La plantilla debe incluir la baja automática de campañas."
Assert-True ($emailTemplate.Contains('{{LOGO_URL}}')) "La plantilla debe declarar una URL reemplazable para el logo alojado públicamente."
Assert-True ($emailTemplate.Contains('#00AEEF')) "La plantilla debe usar el color de acción oficial de ECCIA."
Assert-True ($emailTemplate.Contains('Littus Group America')) "El footer debe identificar a la empresa matriz."
Assert-True ($emailTemplate.Contains('max-width: 600px')) "La plantilla debe mantener un ancho compatible con clientes de correo."
Assert-True (Test-Path -LiteralPath $emailGuidePath) "Falta la guía operativa de campañas."
Assert-True ($emailGuide.Contains('Nunca envíes una campaña sin')) "La guía debe incluir una lista de control previa al envío."
Assert-True ($emailGuide.Contains('RESEND_API_KEY')) "La guía debe explicar la credencial pendiente sin exponerla."
Assert-True (Test-Path -LiteralPath $resendSyncPath) "Falta la Edge Function que sincroniza contactos con Resend."
Assert-True ($resendSync.Contains('109cb30f-74b0-47d3-810b-aa7b18994166')) "La función debe usar el segmento ECCIA confirmado."
Assert-True ($resendSync.Contains("Deno.env.get('RESEND_API_KEY')")) "La función debe leer la API key desde Supabase Secrets."
Assert-True ($resendSync.Contains('SUPABASE_SECRET_KEYS')) "La función debe validar el registro usando credenciales privadas del backend."
Assert-True ($resendSync.Contains("marketing_consent")) "La función solo debe sincronizar registros con consentimiento."
Assert-True ($resendSync.Contains("resend_synced_at")) "La función debe ser idempotente y registrar la sincronización."
Assert-True ($resendSync.Contains('encodeURIComponent(registration.correo)')) "La gestión de contactos existentes debe codificar el correo en la URL."
Assert-True (-not $resendSync.Contains('re_')) "La API key de Resend no debe quedar escrita en el código."
Assert-True ($emailGuide.Contains('sync-resend-contact')) "La guía debe documentar la sincronización automática desplegada."
Assert-True (Test-Path -LiteralPath $confirmationEmailPath) "Falta la plantilla transaccional de confirmación."
Assert-True ($confirmationEmail.Contains('{{FIRST_NAME}}')) "La confirmación debe personalizar el nombre sin depender de Contacts."
Assert-True ($confirmationEmail.Contains('02 de julio')) "La confirmación debe incluir la fecha real del taller."
Assert-True ($confirmationEmail.Contains('18h00 a 20h00')) "La confirmación debe incluir el horario real del taller."
Assert-True ($confirmationEmail.Contains('https://chat.whatsapp.com/EnFIAc8hBNc5Xn4jufjeGD')) "La confirmación debe incluir la comunidad de WhatsApp."
Assert-True ($confirmationEmail.Contains('https://www.youtube.com/live/yW3OQFl76kg?si=F1X3As2vkM9lQ6v_')) "La confirmación debe incluir el live."
Assert-True ($confirmationEmail.Contains('href="https://cursos.littusgroup.com/"')) "La confirmación debe enlazar al aula virtual desde el footer."
Assert-True ($confirmationEmail.Contains('Visitar el aula virtual')) "El enlace al aula virtual debe tener un texto de acción claro."
Assert-True (-not $confirmationEmail.Contains('cuando esté disponible')) "La confirmación no debe conservar el texto obsoleto sobre el acceso."
Assert-True (-not $confirmationEmail.Contains('RESEND_UNSUBSCRIBE_URL')) "Una confirmación operativa no debe incluir baja promocional."
Assert-True (-not $confirmationEmail.Contains('aceptaste comunicaciones')) "Una confirmación operativa no debe afirmar consentimiento comercial."
Assert-True (Test-Path -LiteralPath $confirmationFunctionPath) "Falta la Edge Function de confirmación."
Assert-True ($confirmationFunction.Contains("`${RESEND_API_URL}/emails")) "La confirmación debe usar POST /emails de Resend."
Assert-True ($confirmationFunction.Contains("'Idempotency-Key'")) "La confirmación debe usar una clave de idempotencia."
Assert-True ($confirmationFunction.Contains('registration-confirmation/')) "La clave de idempotencia debe estar vinculada a la inscripción."
Assert-True ($confirmationFunction.Contains('confirmation_sent_at')) "La función debe registrar la fecha de confirmación."
Assert-True ($confirmationFunction.Contains('confirmation_resend_email_id')) "La función debe auditar el identificador de Resend."
Assert-True ($confirmationFunction.Contains('confirmation_error')) "La función debe registrar el último error."
Assert-True (-not $confirmationFunction.Contains('marketing_consent')) "El envío operativo no debe depender del consentimiento comercial."
Assert-True (-not $confirmationFunction.Contains('/contacts')) "La confirmación individual no debe crear ni modificar Contacts."
Assert-True (Test-Path -LiteralPath $confirmationTemplatePath) "Falta el template de la confirmación."
Assert-True ($confirmationTemplate.Contains('https://chat.whatsapp.com/EnFIAc8hBNc5Xn4jufjeGD')) "El template TS debe incluir la comunidad de WhatsApp."
Assert-True ($confirmationTemplate.Contains('https://www.youtube.com/live/yW3OQFl76kg?si=F1X3As2vkM9lQ6v_')) "El template TS debe incluir el live."
Assert-True ($confirmationTemplate.Contains('href="https://cursos.littusgroup.com/"')) "El template TS debe enlazar al aula virtual desde el footer."
Assert-True ($confirmationTemplate.Contains('Visitar el aula virtual')) "El template TS debe identificar claramente el acceso al aula virtual."
Assert-True (-not $confirmationTemplate.Contains('cuando esté disponible')) "El template TS no debe conservar el texto obsoleto sobre el acceso."
Assert-True (-not $confirmationTemplate.Contains('marketing_consent')) "El template operativo no debe depender del consentimiento comercial."

Write-Output "Landing checks: OK"
