# Captación ECCIA · Taller técnico

Landing estática de ECCIA para registrar participantes del taller técnico
**Domina la lectura del Scan A**, almacenar las inscripciones en Supabase y
sincronizar únicamente los contactos con consentimiento promocional hacia
Resend.

## Estado actual

| Componente | Estado |
| --- | --- |
| Landing responsive ECCIA | Operativa |
| Formulario de inscripción | Operativo |
| Persistencia en Supabase | Operativa |
| Consentimiento promocional separado | Operativo |
| Sincronización Supabase → Resend | Operativa |
| Confirmación transaccional individual | Operativa |
| Segmento y Topic de Resend | Configurados |
| Plantilla visual de Broadcast | Creada y probada |
| Meta Pixel | Preparado; requiere configurar `META_PIXEL_ID` real |
| Meta Conversions API | Programada como evolución ideal |
| GitHub Pages con dominio y HTTPS | Operativo |
| Protección anti-bot | Pendiente antes de una campaña de alto tráfico |

## Arquitectura

```text
GitHub Pages
    │
    │ POST público limitado por RLS
    ▼
Supabase · eccia_taller_inscripciones
    │
    ├── trigger asíncrono para confirmación operativa
    │       └── Edge Function · send-registration-confirmation
    │               └── Resend · POST /emails
    │
    │ trigger asíncrono, solo con consentimiento
    ▼
Supabase Edge Function · sync-resend-contact
    │
    │ RESEND_API_KEY almacenada como secreto
    ▼
Resend · Contacts + Segment + Topic + Broadcasts

Meta Ads
    ▲
    │ Meta Pixel: PageView + Lead post-Supabase
    │ Conversions API: pendiente para medición server-side
```

### Principios de seguridad

- GitHub Pages utiliza únicamente una **publishable key** de Supabase.
- La `RESEND_API_KEY` vive en **Supabase Edge Function Secrets**.
- Nunca se debe copiar una clave `re_...`, `service_role` o `sb_secret_...` al
  frontend, al repositorio o a una captura de pantalla.
- Los roles públicos de Supabase solo pueden insertar los campos expresamente
  permitidos.
- RLS impide consultar, modificar o eliminar inscripciones desde el navegador.
- Una persona puede registrarse al taller sin aceptar comunicaciones
  promocionales.

## Estructura del repositorio

```text
.
├── public/
│   ├── index.html                 # Landing y formulario
│   ├── styles.css                 # Diseño responsive ECCIA
│   ├── app.js                     # Envío del formulario a Supabase
│   ├── brand/                     # Tokens, componentes y logos ECCIA
│   └── src/                       # Fotografías utilizadas en la landing
├── supabase/
│   └── functions/
│       └── sync-resend-contact/
│           └── index.ts           # Sincronización segura con Resend
│       └── send-registration-confirmation/
│           ├── index.ts           # Envío idempotente de confirmación
│           └── template.ts        # HTML transaccional ECCIA
├── emails/
│   └── eccia-base.html            # Respaldo HTML de la plantilla de correo
├── tests/
│   └── landing.tests.ps1          # Validaciones estáticas del proyecto
├── EMAIL_OPERATIONS.md            # Manual para operar campañas
└── AGENTS.md                      # Reglas de marca para agentes
```

## Desarrollo local

El proyecto no utiliza framework, bundler ni proceso de compilación. Es HTML,
CSS y JavaScript estático.

Podés abrir `public/index.html` directamente para revisar la interfaz. Para
probarla con un servidor local, usá una herramienta como VS Code Live Server o:

```powershell
npx serve public
```

No hace falta ejecutar un build.

## Pruebas

La suite valida estructura, accesibilidad, marca, integración con Supabase,
consentimiento y archivos de correo.

En PowerShell moderno:

```powershell
.\tests\landing.tests.ps1
```

Si la política de ejecución bloquea el script o PowerShell 5 interpreta mal los
caracteres UTF-8:

```powershell
$testsRoot = (Resolve-Path .\tests).Path.Replace("'", "''")
$source = Get-Content .\tests\landing.tests.ps1 -Raw -Encoding UTF8
$source = $source.Replace('$PSScriptRoot', "'$testsRoot'")
& ([scriptblock]::Create($source))
```

Resultado esperado:

```text
Landing checks: OK
```

## Supabase

### Proyecto

- Proyecto: `airen`
- Tabla: `public.eccia_taller_inscripciones`
- Edge Function: `sync-resend-contact`

### Datos principales

La tabla conserva:

- nombre;
- correo normalizado;
- código del taller;
- fecha de inscripción;
- consentimiento promocional;
- fecha de consentimiento controlada por PostgreSQL;
- identificador y estado de sincronización con Resend;
- último error de sincronización, si existe.
- identificador, fecha y último error del email de confirmación.

### Flujo de inscripción

1. La persona completa nombre y correo.
2. Puede aceptar opcionalmente futuras comunicaciones ECCIA.
3. El navegador inserta los datos mediante la API REST de Supabase.
4. Si no existe consentimiento, la inscripción termina allí.
5. PostgreSQL invoca asincrónicamente la confirmación individual para toda
   inscripción.
6. Si existe consentimiento, PostgreSQL invoca asincrónicamente la Edge
   Function.
7. Cada función vuelve a consultar la fila real antes de llamar a Resend.
8. El contacto promocional se crea o actualiza y queda asociado al segmento.
9. Supabase registra por separado el estado de confirmación y sincronización.

## Resend

### Configuración operativa

- Dominio verificado: `mail.littusgroup.com`
- Remitente:
  `ECCIA <gestioneccia@mail.littusgroup.com>`
- Reply-To: `formanager@littusgroup.com`
- Segmento: `ECCIA · Talleres y actividades`
- Topic: `Talleres y actividades ECCIA`
- Borrador maestro: `PLANTILLA MAESTRA · ECCIA`

### Regla para nuevas campañas

La plantilla maestra debe permanecer como borrador y **nunca enviarse
directamente**.

Para crear una campaña:

1. duplicar la plantilla maestra;
2. cambiar el nombre del Broadcast;
3. actualizar asunto y preview text;
4. editar etiqueta, título y contenido;
5. actualizar el botón y su URL;
6. confirmar segmento y Topic;
7. enviar un Test email;
8. revisar escritorio, móvil, enlaces y cancelación de suscripción;
9. usar **Review** solamente cuando todo esté validado.

El procedimiento completo está en [EMAIL_OPERATIONS.md](EMAIL_OPERATIONS.md).

## Comunicaciones operativas y promocionales

### Operativas

Son necesarias para prestar el servicio solicitado:

- confirmación de inscripción;
- enlace de acceso;
- recordatorios del taller;
- entrega del certificado.

### Promocionales

Solo pueden enviarse a quienes aceptaron expresamente:

- invitaciones a futuros talleres;
- cursos y actividades;
- promociones;
- novedades de ECCIA.

No mezclar ambas finalidades ni suscribir automáticamente a una persona por
haberse registrado a un taller.

## Meta Ads y medición

### Integración mínima activa

La landing tiene soporte para **Meta Pixel** en `public/app.js`.

- `PageView` se envía cuando existe un `META_PIXEL_ID` configurado.
- `Lead` se envía únicamente después de que Supabase responde correctamente al
  `POST` de inscripción.
- Si `META_PIXEL_ID` está vacío, el tracking queda desactivado de forma segura.

Antes de publicar la campaña en Meta Ads, reemplazar:

```js
const META_PIXEL_ID = "";
```

por el identificador real del pixel entregado por Meta Events Manager.

### Evolución ideal programada

Para una medición más robusta, implementar **Conversions API** desde Supabase
Edge Functions. La evolución recomendada es:

1. generar un `event_id` por inscripción exitosa;
2. enviar `Lead` desde el navegador con ese mismo `event_id`;
3. enviar `Lead` desde servidor hacia Conversions API con el mismo `event_id`;
4. dejar que Meta deduplique navegador + servidor;
5. guardar el resultado server-side para auditoría de conversiones.

No implementar Conversions API copiando tokens secretos al frontend. El token de
Meta debe vivir como secreto de Supabase, igual que `RESEND_API_KEY`.

## Despliegue en GitHub Pages

El workflow `.github/workflows/pages.yml` publica el contenido de `public/`
como artefacto de GitHub Pages. El dominio
`https://preinscripcion.littusgroup.com` está configurado con HTTPS activo.

## Marca ECCIA

Antes de cualquier cambio visual:

1. resolver `LITTUS_BRAND_KIT`;
2. comprobar `brands/eccia/manifest.json`;
3. leer las reglas indicadas en `AGENTS.md`;
4. reutilizar tokens y assets existentes;
5. no inventar colores, logos, tipografías ni contenido comercial.

## Operación y mantenimiento

### Antes de publicar la landing

- ejecutar las pruebas;
- verificar el formulario con datos controlados;
- comprobar que los registros consentidos llegan a Resend;
- borrar los contactos de prueba;
- revisar los límites del plan de Resend;
- configurar protección anti-bot si se espera tráfico alto.

### Antes de enviar una campaña

- comprobar remitente y Reply-To;
- confirmar segmento y Topic;
- revisar asunto y preview;
- validar todos los enlaces;
- comprobar el enlace de cancelación;
- enviar una prueba interna;
- revisar que el volumen no exceda los límites diarios del plan.

## Documentación relacionada

- [Operación de correos ECCIA](EMAIL_OPERATIONS.md)
- [Plantilla HTML de respaldo](emails/eccia-base.html)
- [Reglas de marca para agentes](AGENTS.md)
- [Edge Function de sincronización](supabase/functions/sync-resend-contact/index.ts)
