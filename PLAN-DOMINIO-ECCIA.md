# Plan: dominio `eccia.littusgroup.com` y raíz única de Nextcloud

Estado: propuesto (2026-10-18). Nada implementado. **Debe revisarse contra la
arquitectura de `CLAUDE.md`** (funnel por evento, grupos de funciones, una
página por paso con `?evento=<slug>`): las rutas `/inscripcion/ut2/` de este
plan se reemplazan por rutas por paso, y NC-01/DOM-01 pasan a
`_shared/config.ts`.

## Objetivo

1. Publicar el sitio en `https://eccia.littusgroup.com`, con una ruta por
   función, y retirar `preinscripcion.littusgroup.com`.
2. Definir una sola raíz de Nextcloud por variable de entorno y derivar de ella
   todas las carpetas (certificados, firmas, plantillas, fotos de inscripción).

## Por qué

- `preinscripcion` nombra una acción, pero el sitio ya aloja preinscripción,
  inscripción a UT2, regalos, descargas y validación de certificados. El dominio
  debe nombrar a la marca (ECCIA) y cada función debe tener su ruta.
- Hoy cada función decide su carpeta en Nextcloud con rutas fijas en el código
  (`firmas/`, `templates/`, `masterclass-ultrasonido-nivel-i/2026/`) y la de
  fotos con su propia variable (`NEXTCLOUD_FICHAS_FOTOS_DIR`). Mover el
  almacenamiento obliga a tocar código en varios lugares.

## Decisiones tomadas

- Dominio nuevo: `eccia.littusgroup.com` (usuario, 2026-10-18).
- **El dominio viejo queda solo para validar QR.** Los PDF emitidos se descartan
  en Nextcloud (usuario, 2026-10-18: quien no descargó su certificado lo
  pierde), pero el QR de los certificados ya descargados debe seguir validando
  (usuario, 2026-10-18). Ese QR apunta a
  `https://preinscripcion.littusgroup.com/validar-certificado.html?code=...`,
  así que `preinscripcion` no se borra: lo sirve un repositorio mínimo de GitHub
  Pages que solo redirige a
  `https://eccia.littusgroup.com/certificados/validar/` conservando `?code=`
  (tarea DOM-06). No requiere cPanel ni hosting.
- **Regalos se apaga** (usuario, 2026-10-18): la página cambia y se activa con
  cada curso nuevo. No se publica en el dominio nuevo; `regalos.html` y
  `certificados.js` (reclamo de certificado) salen de `public/` hacia una
  carpeta no publicada, como base para la próxima campaña. `issue-certificate`
  sigue desplegada.
- El validador no depende de Nextcloud: `validate-certificate` lee solo la base
  (`index.ts:8`, `48`). Descartar los PDF no afecta la validación mientras las
  filas de certificados se conserven con su estado.
- La base de datos sí debe quedar coherente: un `UPDATE` de una sola vez
  reescribe `validation_url` al dominio y la ruta nuevos (usuario, 2026-10-18).
- Raíz única de Nextcloud por variable de entorno, con ramas derivadas en el
  código (usuario, 2026-10-18). Ver la sección "Nextcloud".

## Evidencia (estado actual)

| Tema                 | Dónde                                                                                                                                                                          | Hecho                                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosting              | `.github/workflows/pages.yml`, `README.md:253`                                                                                                                                 | GitHub Pages publica `public/`; un dominio propio por repositorio.                                                                                       |
| DNS                  | consulta NS pública                                                                                                                                                            | `littusgroup.com` se administra en BanaHosting; `preinscripcion` es un CNAME a GitHub Pages.                                                             |
| Validador            | `supabase/functions/validate-certificate/index.ts:48`                                                                                                                          | Busca por código; no depende del dominio.                                                                                                                |
| URL de validación    | `issue-certificate/index.ts:80`                                                                                                                                                | `CERTIFICATE_PUBLIC_BASE_URL` + `/validar-certificado.html?code=`.                                                                                       |
| Reutilización        | `issue-certificate/index.ts:668`, `728`                                                                                                                                        | Al regenerar se conserva `validation_url` existente: sin el `UPDATE`, un certificado regenerado vuelve a salir con el dominio viejo.                     |
| CORS                 | `submit-ficha-inspector/index.ts:37`                                                                                                                                           | `Access-Control-Allow-Origin` fijo en `https://preinscripcion.littusgroup.com`: el formulario UT2 deja de funcionar en el dominio nuevo si no se cambia. |
| Logos en correos     | `send-registration-confirmation/template.ts:32,91`, `send-ut2-registration-confirmation/template.ts:32`, `send-course-access/template.ts:64`, `issue-certificate/index.ts:555` | URL absoluta al logo en el dominio viejo: los correos futuros saldrían sin logo.                                                                         |
| Logo del certificado | `issue-certificate/index.ts:86`                                                                                                                                                | `buildLogoUrl` usa `CERTIFICATE_PUBLIC_BASE_URL`.                                                                                                        |
| Nextcloud            | `issue-certificate/index.ts:104-105,113,772`, `download-certificate/index.ts:65`, `submit-ficha-inspector`                                                                     | Rutas relativas a `NEXTCLOUD_WEBDAV_URL`; `nextcloud_path` y `foto_path` guardan la ruta relativa.                                                       |

Referencias al dominio o a los nombres de página también en: `CLAUDE.md`,
`README.md`, `RECOVERY.md`, `.env.example`, `supabase/config.toml`,
`emails/*.html`, `tests/*.ps1` y `scripts/recover-certificates.py`. La migración
histórica `20260905050000_ajustar_curso_metalograficas.sql` no se edita.

## Diseño

### Rutas del sitio

GitHub Pages sirve `carpeta/index.html` como `carpeta/`, así que las rutas
limpias no necesitan configuración.

| Hoy                                                    | Nuevo                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `/index.html`                                          | `/`                                                                     |
| `/inscripcion-ut2.html`                                | `/inscripcion/ut2/`                                                     |
| `/regalos.html`                                        | apagada: sale de `public/` (ver Decisiones)                             |
| `/validar-certificado.html`                            | `/certificados/validar/`                                                |
| `/descargas/...`                                       | sin cambios                                                             |
| `/brand/...`                                           | sin cambios                                                             |
| `certificado.html`, `certificado_variante_blanca.html` | por confirmar en DOM-02 (revisar si son páginas públicas o solo diseño) |

Los recursos relativos (`styles.css`, `app.js`, imágenes) se ajustan a la nueva
profundidad o pasan a rutas absolutas desde la raíz (`/styles.css`).

### URL pública en un solo lugar

Una variable `PUBLIC_SITE_URL` (`https://eccia.littusgroup.com`) reemplaza a
`CERTIFICATE_PUBLIC_BASE_URL` y alimenta: la URL de validación, el logo del
certificado, los logos de los correos y el origen CORS de
`submit-ficha-inspector`. Así un próximo cambio de dominio es un cambio de
secreto, no de código.

### Nextcloud

Diseño confirmado por el usuario (2026-10-18):

- `NEXTCLOUD_WEBDAV_URL` queda como la raíz WebDAV del usuario
  (`.../remote.php/dav/files/<usuario>`).
- Variable nueva `NEXTCLOUD_ROOT_DIR` (por ejemplo `ECCIA`): carpeta raíz del
  proyecto. Se valida con la misma regla de ruta segura que hoy usa
  `parsePhotoBaseDir`.
- Las ramas son fijas en el código, debajo de la raíz:

  | Uso                  | Ruta                                                  |
  | -------------------- | ----------------------------------------------------- |
  | Certificados         | `<raíz>/certificados/<curso>/<año>/<código>.pdf`      |
  | Firmas               | `<raíz>/firmas/`                                      |
  | Plantillas           | `<raíz>/plantillas/certificate-base.pdf`              |
  | Fotos de inscripción | `<raíz>/inscripciones/<curso>/fotos/<dni>_<id>.<ext>` |

- `NEXTCLOUD_FICHAS_FOTOS_DIR` (UT2-FU2) se retira: la carpeta de fotos pasa a
  ser una rama de la raíz.
- `nextcloud_path` y `foto_path` siguen guardando la ruta completa relativa a la
  raíz WebDAV, para que cada fila diga dónde está su archivo.
- `NEXTCLOUD_WEBDAV_URL` ya apunta a la raíz WebDAV del usuario (confirmado por
  el usuario, 2026-10-18). Por eso los archivos actuales están directamente en
  esa raíz y deben moverse debajo de `NEXTCLOUD_ROOT_DIR`:
  `firmas/firma_mena.png`, `firmas/firma_aucancela.png`,
  `templates/certificate-base.pdf` y los PDF emitidos en
  `masterclass-ultrasonido-nivel-i/2026/` (24 según `RECOVERY.md`, 2026-09-04).
  Los PDF emitidos se descartan (usuario, 2026-10-18): NC-02 solo mueve las
  firmas y la plantilla, sin `UPDATE` de `nextcloud_path`. La descarga de esos
  certificados deja de funcionar; su validación no.

## Tareas

Cada tarea cierra con su commit. Pruebas: suites `.ps1` con Windows PowerShell
5.1 y `node --test` para la lógica pura; sin Deno en esta máquina, `index.ts` se
revisa por lectura.

- [ ] **NC-01** Raíz única de Nextcloud: `NEXTCLOUD_ROOT_DIR`, ramas derivadas
      en `issue-certificate`, `download-certificate` y `submit-ficha-inspector`;
      retirar `NEXTCLOUD_FICHAS_FOTOS_DIR`; ajustar el `CHECK` de `foto_path`
      (migración UT2-01, todavía sin aplicar).
- [ ] **NC-02** Mover `firmas/` y `templates/certificate-base.pdf` debajo de
      `NEXTCLOUD_ROOT_DIR` antes de desplegar NC-01 (si no, la emisión falla).
      Los PDF emitidos no se mueven. Con regalos apagado no hay reclamo de
      certificados desde el sitio. Requiere aprobación explícita.
- [ ] **DOM-01** `PUBLIC_SITE_URL`: reemplaza a `CERTIFICATE_PUBLIC_BASE_URL` y
      a las URL fijas del dominio en funciones y plantillas de correo. Durante
      la transición, el CORS de `submit-ficha-inspector` acepta ambos orígenes.
- [ ] **DOM-02** Rutas limpias en `public/` según la tabla; enlaces internos,
      `emails/*.html`, `supabase/config.toml` y pruebas actualizadas. Apagar
      regalos: mover `regalos.html` y `certificados.js` fuera de `public/` y
      quitar los enlaces a regalos de `index.html`, `validar-certificado.html` e
      `inscripcion-ut2.js`; ajustar `tests/certificate-claim.tests.ps1` y
      `tests/certificate-generation.tests.ps1` a la nueva ubicación.
- [ ] **DOM-03** `buildValidationUrl` genera `/certificados/validar/?code=`; la
      página nueva lee `code` igual que la actual.
- [ ] **DOM-04** Corte (pasos del usuario marcados con *):
  1. \* Crear el CNAME `eccia` hacia GitHub Pages en el DNS de BanaHosting.
  2. Configurar el dominio propio en GitHub Pages y esperar HTTPS.
  3. \* Definir `PUBLIC_SITE_URL` en los secretos de Supabase.
  4. Integrar a `main` (despliega Pages y las funciones del workflow; las demás
     se despliegan a mano según `CLAUDE.md`).
  5. Comprobar en el dominio nuevo: landing, inscripción UT2, validación con un
     código real y emisión de un certificado de prueba.
- [ ] **DOM-05** Migración de datos de una sola vez: `validation_url` pasa de
      `https://preinscripcion.littusgroup.com/validar-certificado.html?code=` a
      `https://eccia.littusgroup.com/certificados/validar/?code=`. Conteo antes
      y después; ninguna fila conserva el prefijo viejo.
- [ ] **DOM-06** Redirector de QR y retiro:
  1. Repositorio mínimo de GitHub Pages con dominio
     `preinscripcion.littusgroup.com` y una sola página
     `validar-certificado.html` que redirige a
     `https://eccia.littusgroup.com/certificados/validar/` conservando `?code=`;
     cualquier otra ruta redirige a la portada nueva.
  2. Quitar `preinscripcion.littusgroup.com` del repositorio principal y
     configurarlo en el redirector. El CNAME `preinscripcion` se conserva.
  3. Comprobar con un QR real de un certificado descargado.
  4. Quitar el origen viejo del CORS y actualizar `README.md`, `CLAUDE.md`,
     `RECOVERY.md` y `.env.example`.

Orden por dependencia: NC-01 y DOM-01 primero (lo demás lee esas variables);
DOM-02 y DOM-03 antes del corte; DOM-05 después de comprobar el dominio nuevo;
DOM-06 al final.

## Relación con UT2

La rama `feat/inscripcion-ut2` todavía no se integró y el formulario no se
publicó. Recomendación: hacer este plan en una rama que parta de
`feat/inscripcion-ut2` e integrar ambas juntas, para que el formulario se
publique directamente en `eccia.littusgroup.com/inscripcion/ut2/` y nunca en el
dominio viejo.

## Consecuencias aceptadas

- Los PDF emitidos dejan de poder descargarse; quien no lo descargó lo pierde.
  Su QR sigue validando a través del redirector.
- Los correos ya enviados que enlazan al dominio viejo (botón de regalos y logo
  del lanzamiento de UT1, logos de confirmaciones) dejan de mostrar esos
  recursos.

## Avance

- 2026-10-18: plan propuesto.
