# Plan maestro: funnel de captación ECCIA sobre la arquitectura de `CLAUDE.md`

Estado: propuesto (2026-10-18). Nada implementado. Rama de partida:
`feat/inscripcion-ut2` (sin push, sin merge, sin migraciones aplicadas ni
funciones desplegadas desde ella). Sin fecha de lanzamiento: todo lanzamiento
queda postergado (usuario, 2026-10-18) y el orden de este plan es solo por
dependencia arquitectónica.

Este es el plan maestro. Los demás planes pasan a ser subplanes:

| Plan                              | Estado frente a este plan                                                                                                                                                                                                                                                                                                                                                                                              | Dónde se absorbe                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLAN-INSCRIPCION-UT2.md`         | Implementado en la rama, nunca aplicado ni desplegado. Siguen vigentes sus decisiones sobre la ficha (campos, foto `.jpg/.jpeg/.png`, fotos en Nextcloud privado, alta en `certgen` por el agente operador, unicidad por documento y curso). Quedan revocadas por `CLAUDE.md` las decisiones por curso: trigger, plantilla y función propias de UT2, lista fija de cursos, helpers de WebDAV copiados y "sin captcha". | F2 y F3. Se marca como reemplazado (FN-02-11).                                                                                              |
| `PLAN-CERTIFICADOS-MULTICURSO.md` | Vigente como diagnóstico (valores fijos de `issue-certificate`, columnas faltantes, plantilla sin generador, búsqueda por correo solo). Sus números de línea se reverifican al empezar F4.                                                                                                                                                                                                                             | F4.                                                                                                                                         |
| `PLAN-DOMINIO-ECCIA.md`           | **Debe revisarse contra `CLAUDE.md`** (lo dice su propio encabezado): las rutas `/inscripcion/ut2/` se reemplazan por una página por paso con `?evento=<slug>`, y NC-01/DOM-01 pasan a `_shared/config.ts`. Siguen vigentes: dominio `eccia.littusgroup.com`, redirector de QR en `preinscripcion`, PDF emitidos descartados.                                                                                          | Las variables `PUBLIC_SITE_URL` y `NEXTCLOUD_ROOT_DIR` nacen en F2 con su primer consumidor; el corte de dominio es F6. Revisión: FN-06-01. |

## Objetivo

Migrar el funnel completo a la arquitectura de `CLAUDE.md`: un solo funnel, con
`eccia_eventos` como centro, una implementación genérica por paso y un evento
nuevo como una fila, nunca como código.

| # | Paso                                        | Hoy                                                                             | Destino                                                                                               |
| - | ------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1 | Inscripción al webinar                      | `public/app.js` inserta directo por PostgREST; formulario cerrado (`app.js:13`) | `public/inscripcion.html?evento=<slug>` → `public-api` (`registerForEvent`)                           |
| 2 | Certificado de participación                | `issue-certificate` con valores de UT1 fijos                                    | grupo `certificates` (`issueCertificate`), datos del evento                                           |
| 3 | Regalos de participación                    | `public/regalos.html` con contenido fijo                                        | `public/regalos.html?evento=<slug>`, regalos en datos del evento                                      |
| 4 | Correo masivo de invitación                 | `send-workshop-reminder` (gate por frase)                                       | grupo `operator`, Broadcasts API con `segment_id`                                                     |
| 5 | Inscripción al curso                        | `public/inscripcion-ut2.*` + `submit-ficha-inspector`                           | misma página y mismo caso de uso del paso 1; la ficha del inspector es un paso configurado por evento |
| 6 | Certificado del curso (opcional por evento) | no existe                                                                       | `certificates`, activado por el evento                                                                |
| 7 | Validación de cualquier certificado         | `validate-certificate` + `public/validar-certificado.html`                      | `public-api` (`validateCertificate`); URL del QR congelada                                            |

UT2 ("Ultrasonido Nivel II") es el primer evento basado en datos y guía el
diseño de F2; no es una fecha.

### Fuera de alcance

- Abrir inscripciones o lanzar cualquier evento: decisión del usuario, posterior
  a F3.
- Importador de fichas en `certgen` (descartado en `PLAN-INSCRIPCION-UT2.md`,
  UT2-05).
- Introducir una herramienta de build o npm en el frontend.
- Recuperar los PDF emitidos que se descartan (`PLAN-DOMINIO-ECCIA.md`).
- Cambios de marca: se rigen por `AGENTS.md`.

## Estado verificado

### Base de datos en vivo (SQL de solo lectura, proyecto `dkvuihkwuuocjjsscuso`, 2026-10-18)

| Hecho                                                                                                                                                                                                                                                                                                                                                                              | Consecuencia                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tablas públicas en vivo: solo `eccia_eventos`, `eccia_masterclass_certificados`, `eccia_taller_inscripciones`, las tres con RLS habilitado (no forzado).                                                                                                                                                                                                                           | `eccia_fichas_inspector` no existe: las migraciones de UT2 (`20261018140000`, `20261018150000`) nunca se aplicaron y pueden editarse o eliminarse.                                                                                                                                                                                 |
| `eccia_masterclass_certificados`: `anon` y `authenticated` tienen todos los privilegios de tabla (`relacl` `arwdDxtm`, incluido TRUNCATE). Única política: `Permitir registro público de nombres para certificados`, INSERT, `{anon}`, `with check (true)`.                                                                                                                        | Con `validate-certificate` aceptando `external` como válido (`validate-certificate/index.ts:10`), cualquiera con la publishable key puede insertar un certificado que valida. SELECT/UPDATE/DELETE quedan bloqueados por RLS (sin política); TRUNCATE no pasa por RLS (PostgREST no lo expone, pero el privilegio debe retirarse). |
| Certificados por estado: `emailed` 19, `external` 2. Los `external` son `LEYV-PMM-164093C0` (`preparador-muestras-metalograficas`, creado 2026-09-05) y `DF-DMST-09810D69` (`diseno-modelado-sistemas-tuberias-autocad-arcgis`, creado 2026-10-07).                                                                                                                                | Ambas fechas coinciden con altas manuales del operador registradas en la bitácora del proyecto (2026-09-05 y 2026-10-07). Se consideran legítimos (DU-03).                                                                                                                                                                         |
| `eccia_taller_inscripciones`: sin privilegios de tabla en `relacl`, pero `information_schema.column_privileges` muestra `INSERT (correo, marketing_consent, nombre, taller_codigo)` para `anon` y `authenticated`; existe la política `publico_puede_registrar_inscripcion_eccia` (INSERT, `{anon,authenticated}`, `taller_codigo = 'domina-scan-a'` y largos de nombre y correo). | La inscripción pública por PostgREST está habilitada a nivel de permisos para `domina-scan-a`. Hoy no se usa porque el formulario está cerrado (C2).                                                                                                                                                                               |
| `eccia_masterclass_certificados`: además del privilegio de tabla, `anon` y `authenticated` tienen `INSERT`, `SELECT`, `UPDATE` y `REFERENCES` por columna sobre todas las columnas.                                                                                                                                                                                                | F0 debe revocar privilegios de tabla **y** de columna; un `revoke all on table` los cubre a ambos, y la verificación posterior consulta `column_privileges`, no solo `relacl`.                                                                                                                                                     |
| `eccia_eventos`: sin privilegios para `anon`/`authenticated`.                                                                                                                                                                                                                                                                                                                      | Coincide con `20260905020000_add_eccia_eventos.sql:47`.                                                                                                                                                                                                                                                                            |
| `pg_default_acl` de `public`, tablas: los dueños `postgres` y `supabase_admin` conceden `arwdDxtm` a `anon` y `authenticated`.                                                                                                                                                                                                                                                     | Causa raíz del hueco de certificados: toda tabla nueva nace abierta salvo `revoke` explícito. F0 cierra también los defaults de `postgres`.                                                                                                                                                                                        |
| Historial `supabase_migrations` remoto: 10 versiones `20260905003437 … 20260921190337`, con nombres que coinciden con archivos locales cuyas versiones son otras (`20260607233000`, …). `20260905050000_ajustar_curso_metalograficas.sql` no figura en el historial remoto.                                                                                                        | `supabase db push` trataría todos los archivos locales como pendientes. Las migraciones llegan al remoto una a una con `apply_migration` del MCP, como hasta ahora; la reconciliación es FN-01-07.                                                                                                                                 |

### Lo que el repositorio confirma o contradice

- **C1. Privilegios por columna.**
  `20260607233000_create_eccia_taller_inscripciones.sql:82-84` revoca todo y
  concede `insert (nombre, correo, taller_codigo, marketing_consent)` a
  `anon, authenticated`. Un privilegio por columna vive en
  `pg_attribute.attacl`, no en `relacl`. **Verificado en vivo el 2026-10-18**
  con `information_schema.column_privileges`: el privilegio por columna existe,
  así que la inscripción pública no falla por permisos.
- **C2. El formulario del webinar está cerrado.** `public/app.js:13`
  `const REGISTRATION_CLOSED = true` y `app.js:117-125` corta el envío antes del
  `fetch` (`app.js:145`). Hoy ninguna inscripción pública llega a PostgREST,
  falle o no el permiso.
- **C3. La tabla de certificados sí tiene fecha de creación.**
  `20260703145000_add_masterclass_certificate_claims.sql:6` define
  `creado_en timestamptz not null default now()`. **Verificado en vivo**: la
  columna existe y fecha los 2 `external` (ver la tabla anterior); ambos son
  posteriores a la restauración del 2026-09-04.
- **C4. Un webinar, dos claves.** Las inscripciones usan `domina-scan-a`
  (default y política en `20260607233000:27,69`; trigger en
  `20260921190000:33`), mientras que el evento y los certificados usan
  `ultrasonido-industrial-scan-a` (`20260905020000:75`,
  `issue-certificate/index.ts:10`). `issue-certificate` busca la inscripción
  solo por correo (`index.ts:648-652`) y emite para
  `ultrasonido-industrial-scan-a`, lo que indica que son el mismo webinar.
  **Supuesto** a confirmar por el usuario (DU-04).
- El frontend no usa el privilegio público sobre certificados: `public/` solo
  llama a `functions/v1/issue-certificate` (`certificados.js:14`),
  `submit-ficha-inspector` (`inscripcion-ut2.js:6`), `validate-certificate`
  (`validar-certificado.html:92`) y `rest/v1/eccia_taller_inscripciones`
  (`app.js:11`). Ninguna referencia a `rest/v1/eccia_masterclass_certificados`.

### Deuda conocida (de `CLAUDE.md`, verificada por lectura)

| Deuda                                                                            | Evidencia                                                                                                                | Fase                             |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| Insert público de certificados con `with check (true)`                           | `20260703145000:28,34-38`                                                                                                | F0                               |
| `external` válido sin control de quién lo escribe                                | `validate-certificate/index.ts:10`                                                                                       | F0 (escritura), F4 (caso de uso) |
| Webhooks sin autenticación; `pg_net` envía solo `Content-Type`                   | `20260904140000_eccia_config_table.sql:65`; `verify_jwt = false` en todo `supabase/config.toml`                          | F3                               |
| Log de un objeto de error completo                                               | `issue-certificate/index.ts:821`                                                                                         | F4                               |
| Log de la ruta de la foto (incluye el documento)                                 | `submit-ficha-inspector/index.ts:122`                                                                                    | F2                               |
| Sin `_shared/`; lectura de la secret key duplicada                               | `validate-certificate/index.ts:24-28` y equivalentes                                                                     | F2 en adelante                   |
| Plantilla de otra función importada por ruta relativa                            | `send-workshop-reminder/index.ts:3`                                                                                      | F5                               |
| Sin `deno.json`; imports sin versión                                             | `issue-certificate/index.ts:3-5` (`npm:pdf-lib`, `npm:@pdf-lib/fontkit`, `npm:qrcode`)                                   | F1, F4                           |
| `issue-certificate` mezcla todo y fija UT1                                       | `issue-certificate/index.ts:10-13`; ver `PLAN-CERTIFICADOS-MULTICURSO.md`                                                | F4                               |
| Búsqueda de inscripción solo por correo con `maybeSingle()`                      | `issue-certificate/index.ts:648-652`                                                                                     | F4                               |
| `taller_codigo` texto libre, sin FK; default y política fijos en `domina-scan-a` | `20260607233000:27,64-74`                                                                                                | F2                               |
| Confirmaciones copiadas con triggers por evento                                  | `20260921190000:30-33`, `20261018150000:42-45`, `send-registration-confirmation/`, `send-ut2-registration-confirmation/` | F3                               |
| Origen CORS fijo                                                                 | `submit-ficha-inspector/index.ts:37`                                                                                     | F2                               |
| Páginas con contenido de evento fijo y scripts clásicos                          | `public/inscripcion-ut2.*`, `public/regalos.html`, `public/app.js`                                                       | F2, F5                           |
| El workflow despliega 3 de 9 funciones; sin `check` previo                       | `.github/workflows/deploy-supabase-functions.yml:7-12`                                                                   | F1                               |
| Pruebas estáticas de texto; único test de runtime en Node                        | `tests/*.ps1`, `tests/submit-ficha-inspector.validation.test.ts`                                                         | F1 en adelante                   |
| Ninguna Edge Function se compiló nunca                                           | Deno no está instalado en esta máquina                                                                                   | F1                               |

## Decisiones tomadas

| #    | Decisión                                                                                                                                                                                                                                                                                                                                                      | Fuente                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| D-01 | La arquitectura de `CLAUDE.md` es obligatoria: hexagonal, grupos `public-api`, `db-events`, `certificates`, `operator`; el evento es el centro; una implementación por paso.                                                                                                                                                                                  | `CLAUDE.md`                            |
| D-02 | Nada de MVP ni diseño mínimo: cada pieza se construye bien una vez.                                                                                                                                                                                                                                                                                           | usuario                                |
| D-03 | Rebanadas verticales; ninguna superficie de API sin consumidor en el mismo cambio; el ratchet llega con la primera rebanada; prueba primero.                                                                                                                                                                                                                  | `CLAUDE.md`                            |
| D-04 | UT2 se generaliza como primer evento basado en datos, con interfaz parametrizada. Las piezas específicas de UT2 de esta rama (`public/inscripcion-ut2.*`, `send-ut2-registration-confirmation`, migración `20261018150000`) son deuda a reemplazar.                                                                                                           | usuario                                |
| D-05 | Las migraciones no aplicadas en ningún lugar (`20261018140000`, `20261018150000`) se editan en su lugar o se eliminan. Las aplicadas son inmutables.                                                                                                                                                                                                          | `CLAUDE.md`, verificación en vivo      |
| D-06 | **Sin hotfix de la inscripción pública al webinar** (usuario, 2026-10-18): espera a la rebanada genérica (F2). Consecuencia aceptada: la inscripción pública al webinar queda sin servicio hasta F2. No hay necesidad de negocio de inscribir a nadie por ahora, así que no es un impulsor de la ruta de trabajo. Hoy además el formulario está cerrado (C2). | usuario                                |
| D-07 | **Todos los lanzamientos quedan postergados, incluido el curso UT2** (usuario, 2026-10-18). No hay fecha externa; las fases se ordenan solo por dependencia arquitectónica.                                                                                                                                                                                   | usuario                                |
| D-08 | Aplicar migraciones al proyecto remoto, desplegar funciones, hacer push a `main` y abrir inscripciones son decisiones del usuario.                                                                                                                                                                                                                            | `CLAUDE.md`                            |
| D-09 | La protección contra abuso (Turnstile y límites por correo e IP en Postgres) es obligatoria en inscripción y emisión; revoca la decisión "captcha por ahora no" de `PLAN-INSCRIPCION-UT2.md`.                                                                                                                                                                 | `CLAUDE.md`                            |
| D-10 | Las URL públicas ya impresas o enviadas quedan congeladas: `<sitio>/validar-certificado.html?code=` (`issue-certificate/index.ts:80-81`, en los QR) y `<supabase>/functions/v1/download-certificate?code=` (`index.ts:83-84`, en los correos).                                                                                                                | `CLAUDE.md`                            |
| D-11 | `PUBLIC_SITE_URL` y `NEXTCLOUD_ROOT_DIR` nacen en `_shared/config.ts` con su primer consumidor (F2), no en F6, para no crear `NEXTCLOUD_FICHAS_FOTOS_DIR` ni un origen CORS fijo en código nuevo.                                                                                                                                                             | este plan, por "una fuente por ajuste" |

## Decisiones pendientes del usuario

### DU-01. Toolchain: Deno, Supabase CLI y Docker

**Resuelta el 2026-10-18**: el usuario aprobó instalar los tres y quedaron
instalados (Deno 2.9.7 vía winget, Supabase CLI 2.121.0 vía Scoop, Docker
Desktop 29.8.2 vía winget sobre WSL2 Ubuntu). Queda pendiente revisar la
licencia de Docker Desktop para la empresa.

Recomendación original: instalar los tres en esta máquina antes de F1.

- Deno es la cadena obligatoria (`deno task check`) y el runtime de Supabase.
  Sin Deno no hay prueba primero ni F1 en adelante; F0 sí puede avanzar.
- Supabase CLI + Docker dan el stack local para las pruebas de contrato y para
  aplicar migraciones localmente. Sin ellos, los adaptadores solo se prueban
  contra memoria, lo que incumple la regla de pruebas de contrato.
- Costo: Docker Desktop en Windows es pesado y su licencia debe revisarse para
  la empresa. Alternativa: correr el stack local solo en CI (los runners de
  GitHub traen Docker); la retroalimentación pasa de segundos a minutos por
  iteración. Se recomienda local.

### DU-02. Camino de la inscripción pública

**Resuelta el 2026-10-19**: el usuario eligió la opción A (toda inscripción por
`public-api`). Se compararon dos alternativas y se descartaron: B, insert
directo de PostgREST con una política genérica (sin reto ni límites posibles,
reglas en SQL y un segundo camino frente a la ficha con foto), y C, sesión
anónima de Supabase Auth con captcha e insert como `authenticated` (un usuario
de Auth por inscrito, sin límite por correo, reglas en SQL). El ajuste de la
regla "Writes" de `CLAUDE.md` (ningún rol público escribe en ninguna tabla) y
del ratchet de privilegios públicos (lista de inscripción vacía) se hace en la
misma rebanada que retira el privilegio (FN-02-03), no antes.

Recomendación original: **toda inscripción pasa por `public-api`**
(`registerForEvent`), con Turnstile y límites por correo e IP en Postgres, y se
retira todo privilegio de escritura de `anon`/`authenticated`: `revoke insert`
sobre `eccia_taller_inscripciones` y
`drop policy publico_puede_registrar_inscripcion_eccia`.

- Por qué: `CLAUDE.md` exige reto y límites en la inscripción, y eso no se puede
  verificar en un insert directo de PostgREST. Además la ficha del inspector ya
  necesita una función (foto en Nextcloud); tener dos caminos de inscripción
  sería un pipeline duplicado.
- Implica: `anon` queda sin escritura en ninguna tabla; la publishable key solo
  sirve para llamar funciones y leer `eccia_eventos_publicos`. Hacen falta una
  cuenta de Cloudflare Turnstile, la site key en `public/js/core/` y el secreto
  como secreto de Edge Function (nombre propuesto: `TURNSTILE_SECRET_KEY`).
- Costo: el arranque en frío de la función en cada inscripción. Se mitiga con
  dependencias livianas en `public-api` (regla de `CLAUDE.md`).
- `CLAUDE.md` ("Writes") permite el insert directo con lista de columnas; si se
  acepta esta recomendación, conviene endurecer esa regla en `CLAUDE.md` (cambio
  del usuario, no de este plan).

### DU-03. Los 2 certificados `external`

Recomendación: se conservan válidos. Desde F0, un `external` solo lo escribe la
service role mediante el procedimiento del operador (FN-00-04). Sus códigos y
fechas ya se cotejaron con las altas del operador (Estado verificado); ambos se
reconocen. Si en el futuro apareciera un `external` no reconocido, el usuario
decide si se invalida (`certificate_status = 'failed'` en una migración de
datos). Nunca se borran filas de certificados.

### DU-04. Clave del webinar Scan A

**Resuelta el 2026-10-19**: el usuario confirmó que `domina-scan-a` y
`ultrasonido-industrial-scan-a` son el mismo webinar; las inscripciones pasan a
`ultrasonido-industrial-scan-a` (FN-02-02). El conteo en vivo (FN-02-01) mostró
además dos cursos con inscripciones y sin fila en `eccia_eventos`:
`end-vt-pt-mt-2026-09` (11) y `end-vt-ii-pt-ii-ut-i-2026-10` (2); se crean sus
eventos como datos antes de la FK (FN-02-12).

Recomendación: migración de datos idempotente que pasa las inscripciones de
`domina-scan-a` a `ultrasonido-industrial-scan-a` (la clave que ya usan el
evento y los 19 certificados), y después la FK. La alternativa, insertar un
evento `domina-scan-a`, deja un webinar con dos filas y se descarta. Requiere
confirmar C4 y el conteo por `taller_codigo` en vivo (FN-02-01).

## Fases

Orden por dependencia, no por tamaño:

1. **F0** no depende de nada y cierra un hueco de seguridad explotable hoy; es
   solo SQL y no necesita Deno.
2. **F1** es la cadena que toda rebanada necesita para probar primero y pasar
   `check`. Contiene solo herramientas y ratchets, no código de aplicación.
3. **F2** crea las inscripciones por evento con FK: todo lo demás (confirmación,
   certificado por correo y evento, segmentos) lee esa fila.
4. **F3** reacciona a la inscripción creada en F2.
5. **F4** necesita la inscripción por evento (F2) y reutiliza el adaptador de
   Nextcloud de F2.
6. **F5** necesita el certificado por evento (F4) para el reclamo en regalos y
   la sincronización de contactos (F3) para los segmentos.
7. **F6** corta el dominio cuando todas las páginas ya son una por paso.

### F0. Privilegios públicos sobre tablas

- **Causa raíz** (verificada en vivo, 2026-10-18): los privilegios por defecto
  (`pg_default_acl`) del esquema `public`, para los dueños `postgres` y
  `supabase_admin`, conceden `arwdDxtm` a `anon` y `authenticated` sobre toda
  tabla nueva. `eccia_taller_inscripciones` y `eccia_eventos` lo revocan de
  forma explícita; la tabla de certificados no. `postgres` no puede modificar
  los defaults de `supabase_admin`; las migraciones crean tablas como
  `postgres`, y el ratchet verifica el privilegio efectivo de cada tabla, sea
  quien sea su dueño.
- Migración `20261018130000_revoke_public_table_privileges.sql` (ordena antes de
  las migraciones de UT2 no aplicadas): `revoke all` sobre
  `eccia_masterclass_certificados` para `anon, authenticated` (retira también
  los privilegios por columna), `drop policy if exists` de la política abierta y
  `alter default privileges for role postgres in schema public revoke all on tables
  from anon, authenticated`,
  para que las tablas futuras nazcan cerradas. Idempotente; no toca filas;
  `service_role` conserva sus grants. La migración `20260703145000` no se toca.
- Secuencias y funciones: los defaults de `postgres` en `public` siguen
  concediendo `USAGE/SELECT/UPDATE` (secuencias) y `EXECUTE` (funciones) a
  `anon`/`authenticated`, pero hoy no existe ninguna secuencia ni función en
  `public` (consulta local), así que no hay exposición y quedan fuera de esta
  migración. Se cierran con la primera secuencia o función en `public` (por
  ejemplo, una identidad), junto con una aserción nueva del ratchet.
- Conteo por `certificate_status` antes y después (esperado: 19 `emailed`, 2
  `external`, sin cambios) y privilegios antes y después, registrados en Avance
  (FN-00-03).
- Prueba: ratchet en Deno
  `supabase/functions/tests/db/public_privileges_test.ts` contra el stack local
  (ver "Pruebas de base de datos"). Las aserciones
  `tests/certificate-claim.tests.ps1:98-99` fijaban el privilegio inseguro y se
  eliminaron en el mismo commit.

#### Pruebas de base de datos (decisión)

- Tarea propia `deno task test:db`
  (`--allow-net=127.0.0.1:54322
  --allow-env=PG*`); `deno task check` las
  ignora (`--ignore`), para que `check` no pase ni falle según haya o no un
  stack levantado. Requisito: `supabase start`.
- La URL de la base es una constante en la prueba: la del stack local
  (`postgresql://postgres:postgres@127.0.0.1:54322/postgres`, puerto por
  defecto, que `supabase/config.toml` no cambia). No se lee de una variable de
  entorno: así la prueba no puede apuntar al proyecto remoto por error, y no
  choca con la regla de que solo `_shared/config.ts` lee `Deno.env` (las pruebas
  no son código de función, pero no hace falta excepción). `--allow-env=PG*`
  existe solo porque el cliente `postgres.js` consulta sus variables `PG*` por
  defecto; la URL explícita prevalece sobre `PGHOST`, `PGPORT`, `PGUSER` y
  `PGPASSWORD`.
- Los privilegios se miden con `has_table_privilege` y `has_column_privilege`
  (privilegio efectivo, incluye concesiones a `PUBLIC`, por columna y de
  cualquier dueño), no con `relacl` ni con las vistas de `information_schema`,
  que solo muestran concesiones en las que el otorgante o el receptor es un rol
  habilitado del usuario conectado.
- Pglast no está instalado en esta máquina; la verificación de sintaxis de la
  migración fue aplicarla con `supabase db reset`. El job de CI (FN-01-05)
  agrega pglast.

### F1. Cadena de herramientas

Solo lo que la primera rebanada consume. `config.ts`, `log.ts` y `http/` **no**
se crean aquí: nacen en F2 con el primer caso de uso y crecen con cada rebanada.
`_shared/deps.ts` y el `deno.json` raíz ya nacieron en FN-00-02 con su primer
consumidor (el ratchet de privilegios), con `fmt` y `lint` limitados a
`_shared/` y `tests/` mientras el legado no pase por `deno fmt`.

- `deno.json` en la raíz (existe desde FN-00-02): ampliar `fmt`/`lint` al legado
  después de su primer `deno fmt`, y tarea para servir `public/` con el file
  server de Deno con versión fija.
- Primer `deno fmt` sobre el código legado en su propio commit.
- Primer `deno check` de la historia sobre las funciones legadas: los errores se
  corrigen o quedan en una lista de legado explícita.
- Ratchets de arquitectura en `supabase/functions/tests/architecture/`:
  specifiers de terceros solo en `_shared/deps.ts`, cliente Supabase solo en
  `adapters/supabase`, `Deno.env` solo en `config.ts`, `console.*` solo en
  `log.ts`, `domain/` sin imports externos, privilegios públicos (de F0). El
  código legado entra en una lista permitida que **solo puede achicarse**: la
  prueba falla si un archivo nuevo viola la regla o si un archivo migrado sigue
  en la lista.
- CI: job `check` (`deno task check` + sintaxis de migraciones con pglast) en
  todo push y pull request; `pages.yml` y `deploy-supabase-functions.yml` con
  `needs: check`.
- El workflow de despliegue publica las funciones que corresponden a producción.
  Cada carpeta de función debe estar en la lista de despliegue o en una lista
  comentada de exclusiones; el ratchet detecta carpetas sin decisión y
  exclusiones obsoletas.

### F2. Primera rebanada: inscripción genérica por evento (UT2 como guía)

El diseño se valida con dos eventos reales: el webinar Scan A (inscripción
simple) y UT2 (inscripción con ficha y foto).

- **Esquema del evento.** Columnas nuevas en `eccia_eventos` solo si la página o
  el caso de uso las leen en esta rebanada. Propuesta, a fijar con la prueba que
  falla primero: `tipo` (`webinar` | `curso`), ventana de inscripción
  (`inscripcion_abre_en`, `inscripcion_cierra_en`), `requiere_ficha_inspector`
  (boolean) y el copy de la página. Con solo dos formas de formulario, un
  boolean basta; un esquema genérico de campos sería superficie sin consumidor.
- **Catálogo.** Vista `eccia_eventos_publicos` con lista explícita de columnas y
  solo eventos publicados; `grant select` a `anon` sobre la vista, nunca sobre
  la tabla. Es la única vía de lectura del catálogo: no se crea un endpoint de
  catálogo hasta que un consumidor lo necesite. La vista corre con permisos del
  dueño (con `security_invoker` `anon` necesitaría leer la tabla base, que está
  prohibido); el aviso del asesor de Supabase se registra como aceptado.
- **Clave del evento.** Migración de datos idempotente (DU-04); migración que
  quita el default de `taller_codigo`, agrega la FK `not valid` y aplica DU-02 a
  privilegios y política; migración aparte con `validate constraint`. Conteos
  antes y después en Avance.
- **`public-api`.** Caso de uso `registerForEvent`: dominio (evento activo,
  inscripción abierta, elegibilidad, consentimiento), puertos `Events` y
  `Registrations`, adaptadores `supabase/` y `memory/`, `_shared/http` (parseo,
  CORS desde `PUBLIC_SITE_URL`, mapeo de errores), `config.ts`, `log.ts`,
  `deps.ts`. Turnstile y límites por correo e IP en Postgres (tabla nueva,
  nombre propuesto `eccia_limites_solicitud`). Se divide en FN-02-05a
  (inscripción vertical y ventana de inscripción, sin despliegue) y FN-02-05b
  (desafío y límites; primer despliegue separado en FN-02-13). La ventana acepta
  inscripciones solo con `activo = true`, apertura no nula y
  `inscripcion_abre_en <= now`; el cierre puede ser nulo o debe cumplir
  `now < inscripcion_cierra_en`. Las filas existentes conservan ambas fechas
  nulas y permanecen cerradas.
- **Contrato de FN-02-05b (pruebas primero).** Se agrega
  `registerPublicRegistration` como envoltorio de `registerForEvent`, sin copiar
  la inscripción ni volver opcional la protección en la ruta pública. Orden:
  parseo completo (incluye `Email`, `challenge_token` e IP), desafío, límite IP,
  límite correo, caso de uso existente. Cada rechazo corta el flujo sin
  escritura; un desafío fallido no consume límites. Los límites cuentan intentos
  posteriores al desafío, incluso si el evento resulta cerrado o la inscripción
  duplicada. Token e IP no pasan a `Registrations.create`.
  - Política de dominio: 5 intentos por correo normalizado por 3600 segundos y
    20 por IP por 3600 segundos, globales entre eventos. Son ventanas fijas
    desde el primer consumo; los rechazos no prolongan la ventana. El reintento
    se redondea hacia arriba a segundos enteros positivos. Es un equilibrio
    inicial entre correcciones legítimas y abuso; una IP compartida puede agotar
    el cupo de varias personas.
  - IP: únicamente la primera entrada de `x-forwarded-for`, recortada y válida
    como IPv4 o IPv6 sin puerto ni zona. Si falta o es inválida, usar la misma
    clave `unknown`, nunca omitir el límite ni buscar otra entrada válida.
    Turnstile recibe `remoteip` para IP válidas; se omite ese campo opcional
    para `unknown`. La confianza en la cabecera depende del gateway y debe
    verificarse antes del despliegue, no inferirse de la prueba del handler.
  - Persistencia: HMAC-SHA-256 con secreto independiente de Turnstile, entrada
    `JSON.stringify([kind, value])`, salida hexadecimal en minúsculas. La tabla
    `public.eccia_limites_solicitud` contiene solo `clave_hash`, `intentos` y
    `vence_en`; nunca correos o IP sin hash. La función atómica
    `public.eccia_consumir_limite(text, integer, integer)` recibe
    `p_clave_hash`, `p_limite`, `p_ventana_segundos` y devuelve `allowed` y
    `retry_after_seconds`. Usa reloj de Postgres, `security definer`,
    `search_path` vacío, `EXECUTE` solo para `service_role` entre roles API y
    revocación de `PUBLIC`; sin acceso a tabla ni columnas para `anon` o
    `authenticated`. El consumo elimina filas vencidas para no retener hashes
    indefinidamente después de la siguiente solicitud. Deben seguir pasando los
    ratchets de privilegios públicos y funciones de despacho.
  - HTTP: token ausente, vacío o de tipo incorrecto → 400 `INVALID_INPUT`;
    desafío inválido o verificación fallida → 403 `CHALLENGE_FAILED`; cupo
    agotado → 429 `RATE_LIMITED` y `Retry-After` en segundos. Mantener CORS
    exacto también en errores. No registrar token, secreto, IP, correo, hash,
    cuerpo ni error sin filtrar; solo campos permitidos por `log.ts`.
  - Configuración: `TURNSTILE_SECRET_KEY` y `REQUEST_LIMIT_HASH_SECRET`
    obligatorios y no vacíos; propiedades `turnstileSecretKey` y
    `requestLimitHashSecret`. Fallar al arrancar sin revelar valores. Secretos
    separados permiten rotar Turnstile sin cambiar las claves de los límites.
    Los secretos de prueba de Cloudflare solo pertenecen a pruebas/fixtures.
  - Turnstile: POST con formulario a su endpoint `siteverify`, `fetch`
    inyectable; aceptar solo HTTP 200 con JSON y `success === true`. Error de
    red, promesa rechazada, otro estado o JSON inválido deben fallar cerrados.

  **Módulos/exportaciones estables para fase 2** (rutas relativas a
  `supabase/functions/_shared/`):

  | Ruta                                        | Contrato                                                                                                                                                                                            |
  | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `domain/requestLimits.ts`                   | `EMAIL_REGISTRATION_LIMIT`, `IP_REGISTRATION_LIMIT` (`{ limit, windowSeconds }`); `extractClientIp(header: string \| null): string`.                                                                |
  | `ports/humanChallenge.ts`                   | `HumanChallenge.verify(token: string, remoteIp: string): Promise<boolean>`.                                                                                                                         |
  | `ports/requestLimits.ts`                    | `RequestLimitKey = { kind: "email" \| "ip"; value: string }`; `RequestLimits.consume(key, policy): Promise<{ allowed: true } \| { allowed: false; retryAfterSeconds: number }>`.                    |
  | `application/registerPublicRegistration.ts` | `registerPublicRegistration(input, ports, now): Promise<Registration>`; entrada de `registerForEvent` más `challengeToken` y `remoteIp`; puertos existentes más `humanChallenge` y `requestLimits`. |
  | `adapters/turnstile/humanChallenge.ts`      | `TurnstileHumanChallenge({ secretKey, fetch, logger })` implementa `HumanChallenge`; no red real en pruebas.                                                                                        |
  | `adapters/memory/humanChallenge.ts`         | `MemoryHumanChallenge(passes: boolean)` implementa `HumanChallenge`.                                                                                                                                |
  | `adapters/memory/requestLimits.ts`          | `MemoryRequestLimits(now: () => Date)` implementa `RequestLimits`, con reloj inyectado.                                                                                                             |
  | `adapters/crypto/requestLimitHash.ts`       | `createRequestLimitHasher(secret)` devuelve `(key: RequestLimitKey) => Promise<string>`.                                                                                                            |
  | `adapters/supabase/requestLimits.ts`        | `createSupabaseRequestLimits({ url, serviceRoleKey, hashSecret }): RequestLimits`; reutiliza la dependencia de Supabase existente.                                                                  |
  | `domain/errors.ts`, `http/errors.ts`        | Ampliar `DomainError` y su mapeo único; `RATE_LIMITED` lleva `retryAfterSeconds`.                                                                                                                   |
  | `http/registration.ts`                      | Ampliar `parseRegistrationRequest` con token y extracción de IP antes de efectos.                                                                                                                   |
  | `config.ts`, `../public-api/index.ts`       | Ampliar `Config` y `HandlerDependencies` con los campos/puertos anteriores; componer el envoltorio sin ruta alternativa sin protección.                                                             |

  Fase 1 modifica solo pruebas y este plan. Fase 2 implementará los módulos y la
  migración después del RED observado por el orquestador; regenerará tipos
  locales y ejecutará formato, lint, tipos, unitarias, contratos y ratchets.
  FN-02-13 requiere además widget real, secretos proporcionados por el usuario y
  verificación del CORS real del gateway; hasta entonces no se modifica ni el
  workflow de despliegue ni `NOT_DEPLOYED`.
- **Correo normalizado en la entrada** (pedido del usuario, 2026-10-19): la
  persona puede escribir el correo con mayúsculas o espacios, y eso no debe
  producir un error ni un duplicado. Un valor de dominio `Email` lo normaliza
  (recorte de espacios y minúsculas) al parsear la solicitud en `public-api`,
  antes de validar el formato, de aplicar el límite por correo y de comprobar la
  inscripción duplicada; todo el sistema usa solo el valor normalizado. El
  formulario aplica la misma normalización al salir del campo y muestra el
  correo tal como se guardará, para que la persona vea qué dirección recibirá
  los avisos. El `check` de la base (`eccia_taller_inscripciones_correo_check`)
  y el índice único sobre `lower(btrim(correo))` quedan como última defensa.
  Pruebas: unitarias del valor `Email` (mayúsculas, espacios, formato inválido),
  de la ruta (un correo con mayúsculas se inscribe y se guarda en minúsculas; el
  mismo correo con otra capitalización da "ya inscrito") y de la vista del
  formulario. Hoy `public/app.js:143` sí normaliza, pero
  `submit-ficha-inspector/validation.ts:77` solo recorta: con mayúsculas la base
  rechazaría la ficha. Esa función no está desplegada y F2 la reemplaza
  (FN-02-09).
- **Ficha del inspector** como paso activado por `requiere_ficha_inspector`:
  puertos `InspectorProfiles` y `FileStorage` (adaptador Nextcloud), validación
  de `submit-ficha-inspector/validation.ts` movida a `domain/`, foto bajo
  `<NEXTCLOUD_ROOT_DIR>/inscripciones/<evento>/fotos/` (rama de
  `PLAN-DOMINIO-ECCIA.md`), estado persistido y compensación: si el insert falla
  se borra la foto; si el borrado también falla, se registra sin la ruta. La
  migración `20261018140000` se reescribe en su lugar: sin el `insert` del
  evento, con el `CHECK` de `foto_path` alineado a la nueva ruta. El trigger que
  crea la inscripción desde la ficha es de integridad (misma transacción, sin
  I/O) y se conserva.
- **Página genérica** `public/inscripcion.html?evento=<slug>` con
  `public/js/core/` (cliente API: única ubicación de la URL de Supabase y la
  publishable key) y `public/js/inscripcion/` (contenedor y vista pura, probada
  con DOM falso). Marca según `AGENTS.md`. Ratchet: la URL de Supabase y la key
  solo en `public/js/core/` (legado permitido: `app.js`, `certificados.js`,
  `validar-certificado.html`; la lista se achica).
- **Rebanada FN-02-04 + FN-02-07 (decisión del usuario, 2026-10-24).** La página
  es el primer consumidor de la vista, así que ambas tareas llegan en la misma
  rebanada vertical (rama `feat/inscripcion-generica`, desde `main`).
  - `?evento=` es `masterclass_codigo`; no se agrega columna de slug.
  - Columnas nuevas en `eccia_eventos`, leídas por la página: `tipo` (`webinar`
    | `curso`, etiqueta visible) y `resumen` (párrafo descriptivo).
    `requiere_ficha_inspector` llega con FN-02-06, su consumidor.
  - Vista `eccia_eventos_publicos`: solo `activo = true`; columnas explícitas
    (código, `event_title`, `tipo`, `resumen`, `fecha_texto`, `fecha_evento`,
    `duracion`, `inscripcion_abre_en`, `inscripcion_cierra_en`); `select` para
    `anon` solo sobre la vista; permisos del dueño.
  - Formulario: `nombre`, `correo` y `marketing_consent` opcional con el texto
    actual de la landing; sin casilla de tratamiento de datos (la API no tiene
    ese campo).
  - Evento ausente, inexistente o cerrado: mensaje claro, sin formulario. Éxito:
    mensaje en la misma página, con foco, sin prometer correo (la confirmación
    llega en F3).
  - `public/js/core/` es la única ubicación de la URL de Supabase, la
    publishable key y la site key de Turnstile (`0x4AAAAAAFkQkWGC4HttCEQB`).
    Vista probada con DOM falso (`linkedom` en `tests/dev_deps.ts`).
  - Meta Pixel y formulario de la landing quedan en FN-02-10.
  - Marca: kit en `C:\Users\bryan\dev\littus-brand-kit`, confirmado por el
    usuario como valor de `LITTUS_BRAND_KIT`.
  - Prueba en vivo solo en producción después de Pages: CORS acepta un único
    origen. Todos los eventos siguen cerrados.
- **Curso de Ultrasonido Convencional Nivel II (datos del usuario,
  2026-10-24).** Inscripción directa al curso, sin preinscripción. Fila de datos
  (FN-02-08), no migración: `masterclass_codigo = 'ultrasonido-nivel-ii'`,
  `event_title = 'Ultrasonido Convencional Nivel II'`, `tipo = 'curso'`,
  `resumen = 'Curso de Ultrasonido Convencional Nivel II.'`,
  `fecha_texto = 'Del 17 al 25 de octubre de 2026'`,
  `fecha_evento = '2026-10-17'` (inicio), `duracion = '40 horas'`,
  `codigo_prefijo = 'ECCIA-UT2-'` (propuesto en `PLAN-INSCRIPCION-UT2.md`),
  `activo = true`, ventana de inscripción nula (cerrado). Orden según el plan:
  FN-02-08 carga la fila cerrada; FN-02-06 agrega la ficha del inspector, que es
  parte de la inscripción directa; F3 agrega la confirmación; abrir la ventana
  es decisión del usuario (D-06). El curso termina el 2026-10-25, antes de que
  FN-02-06 y F3 estén listos: los participantes se inscriben después del curso,
  lo que no afecta la certificación, que es posterior. El cierre de la ventana
  se define al abrirla.
- **Eventos como datos.** Las filas de UT2 y del webinar las carga el operador
  con la service role (SQL registrado en Avance), no una migración; para el
  stack local, `supabase/seed.sql`.
- **Retiro de deuda.** Se eliminan `public/inscripcion-ut2.*`, la función
  `submit-ficha-inspector` (y su entrada en `config.toml` y en el workflow) y
  `tests/inscripcion-ut2.tests.ps1`; el formulario de `public/index.html` y
  `public/app.js` pasan a la página genérica.

Esta rebanada también restituye la inscripción pública al webinar (D-06), sin
urgencia: abrirla es una decisión del usuario después de F3, porque una
inscripción sin confirmación entregada no está completa.

### F3. Entrega de eventos

- Secreto de webhook en Vault o `private.eccia_config`;
  `private.eccia_post_to_edge_function` (nueva migración con
  `create or replace`) envía `x-eccia-webhook-secret`; `_shared/http` rechaza
  webhooks sin él.
- Grupo `db-events`, ruta "inscripción creada"; un solo trigger de despacho por
  tipo de evento, que reemplaza el trigger con `WHEN` de `20260921190000` y la
  migración `20261018150000` (se elimina, no aplicada).
- Caso de uso `sendRegistrationConfirmation`: puerto `Mailer` (adaptador
  Resend), plantilla alimentada por el evento, snapshot por evento (Scan A y
  UT2), idempotente sobre `confirmation_sent_at` (ya existe, `20260621173138:3`)
  y columnas nuevas de intentos y error. Consolida
  `send-registration-confirmation` y `send-ut2-registration-confirmation`.
- Reconciliador con `pg_cron` que llama a `db-events` para las filas pendientes
  vencidas.
- `sync-resend-contact` pasa a `db-events`; la regla de consentimiento queda
  dentro del caso de uso; el reconciliador recupera los contactos pendientes.

### F4. Certificados

Absorbe `PLAN-CERTIFICADOS-MULTICURSO.md`.

- Grupo `certificates`; `issueCertificate` busca la inscripción por (correo,
  evento) y toma título, prefijo, carpeta, plantilla y firmantes de la fila del
  evento (columnas del subplan, rutas derivadas de `NEXTCLOUD_ROOT_DIR`).
- Puertos `Certificates`, `CertificateRenderer` (pdf-lib cargado con `import()`
  dinámico) y QR; versiones exactas en `deps.ts`; las URL de fuentes estáticas
  se conservan (ver "Certificate gotchas" en `CLAUDE.md`).
- Se conserva la máquina de estados `pending → rendering → uploaded → emailed`
  con recuperación de render vencido.
- Logs solo por `log.ts` (corrige `issue-certificate/index.ts:821`).
- URL congeladas (D-10): `download-certificate` sigue desplegada con ese nombre
  como adaptador delgado; `validate-certificate` sigue leyendo solo la base y
  aceptando `external`.
- Generación de plantillas: una de las tres salidas del subplan, a decidir al
  empezar F4.
- Certificado de curso, activado por el evento; su primer consumidor es la
  acción del operador que emite al cierre de un curso.
- `public/certificado.html` y `public/certificado_variante_blanca.html` salen de
  `public/` junto con el cambio de geometría que las referencia.

### F5. Regalos y correo masivo de invitación

- `public/regalos.html?evento=<slug>` genérica; los regalos son datos del
  evento; sin regalos, la página lo dice. Concilia con `PLAN-DOMINIO-ECCIA.md`
  ("regalos se apaga"): la página fija actual sale de `public/`.
- El reclamo de certificado desde regalos llama a `certificates` con el evento.
- Grupo `operator`: invitación por Broadcasts API con `segment_id`, vista previa
  por defecto y envío solo con `mode: 'send'` y la frase exacta. Absorbe
  `send-workshop-reminder` y `send-course-access`. Ver `EMAIL_OPERATIONS.md`.

### F6. Dominio y corte (`PLAN-DOMINIO-ECCIA.md`, revisado)

- Revisar el subplan contra `CLAUDE.md` (FN-06-01): rutas por paso, `?evento=`,
  variables ya en `config.ts`.
- `PUBLIC_SITE_URL` reemplaza a `CERTIFICATE_PUBLIC_BASE_URL` en el código
  legado que quede (logos de correo, URL de validación).
- Mover firmas y plantilla debajo de `NEXTCLOUD_ROOT_DIR` (NC-02), corte de
  dominio y redirector de QR (DOM-04 a DOM-06 del subplan).

## Tareas

Cada tarea cierra con al menos un commit (Conventional Commits) con pruebas y
documentación junto al comportamiento. La columna "Commit" se completa al
cerrar.

| ID        | Tarea                                                                                                                                                                                                                                                                                                                                                                                                                              | Estado                                                          | Depende de                | Commit    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------- | --------- |
| FN-00-01  | Consulta en vivo de solo lectura: privilegios por columna (C1), certificados por estado, `codigo_certificado` y `creado_en` de los `external` (C3). Registrar en Avance.                                                                                                                                                                                                                                                           | hecho (2026-10-18)                                              | —                         |           |
| FN-00-02  | Migración que revoca `anon`/`authenticated` en certificados, elimina la política abierta y cierra los defaults de tablas de `postgres` en `public`; ratchet `deno task test:db`; `deno.json` y `deps.ts`; eliminar `certificate-claim.tests.ps1:98-99`.                                                                                                                                                                            | hecho (2026-10-18)                                              | FN-00-01, DU-03           | `f4b1f49` |
| FN-00-03  | Usuario aplica `20261018130000` con `apply_migration` del MCP (no `db push`, ver FN-01-07); antes y después, consultas de solo lectura: conteo por `certificate_status`, `has_table_privilege`/`has_column_privilege` de `anon`/`authenticated` sobre las tablas de `public`, `pg_policies` y `pg_default_acl` de `postgres`.                                                                                                      | hecho (2026-10-19; remoto `20261019002307`)                     | FN-00-02                  |           |
| FN-00-04  | Procedimiento del operador para registrar un certificado `external` con service role (`README.md`).                                                                                                                                                                                                                                                                                                                                | hecho (2026-10-19)                                              | FN-00-03                  |           |
| FN-01-01  | Usuario instala Deno, Supabase CLI y Docker (DU-01).                                                                                                                                                                                                                                                                                                                                                                               | hecho (2026-10-18, DU-01)                                       | DU-01                     |           |
| FN-01-02  | Primer `deno fmt` del legado en commit propio y ampliación de `fmt`/`lint` de `deno.json` (creado en FN-00-02); tarea para servir `public/`.                                                                                                                                                                                                                                                                                       | hecho (`7c6ad5b`, `8635acc`, `e4549b9`)                         | FN-01-01                  |           |
| FN-01-03  | Primer `deno check` del legado; correcciones o lista de legado.                                                                                                                                                                                                                                                                                                                                                                    | hecho (`dc75769`, `cd48426`)                                    | FN-01-02                  |           |
| FN-01-04  | Ratchets de arquitectura con lista de legado decreciente (el de privilegios públicos ya existe, FN-00-02).                                                                                                                                                                                                                                                                                                                         | hecho (`e6b6ee0`)                                               | FN-01-02                  |           |
| FN-01-05  | Job `check` en CI (Deno + pglast); `needs: check` en todo despliegue.                                                                                                                                                                                                                                                                                                                                                              | implementado, pendiente de primera ejecución en CI              | FN-01-04                  |           |
| FN-01-06  | Workflow de despliegue de las funciones de producción, con exclusiones explícitas.                                                                                                                                                                                                                                                                                                                                                 | implementado, pendiente de primera ejecución en CI              | FN-01-05                  |           |
| FN-01-07  | Reconciliar el historial de migraciones remoto con los archivos locales (hallazgo de deriva en Avance, 2026-10-18), con decisión del usuario sobre el método; hasta entonces las migraciones llegan una a una por `apply_migration`.                                                                                                                                                                                               | pendiente                                                       | FN-00-03                  |           |
| FN-01-08  | Incorporar HTML, CSS y YAML al alcance de `deno fmt` (hoy fuera: marcado de marca y workflows), cuando las suites PowerShell que fijan su texto estén reemplazadas; vaciar las listas de legado de `fmt` y `lint` de `deno.json`.                                                                                                                                                                                                  | pendiente                                                       | FN-01-04                  |           |
| FN-02-01  | Consulta en vivo: inscripciones por `taller_codigo`; usuario confirma DU-04.                                                                                                                                                                                                                                                                                                                                                       | hecho (2026-10-19)                                              | DU-04                     |           |
| FN-02-02  | Migración de datos idempotente de la clave del webinar; conteos.                                                                                                                                                                                                                                                                                                                                                                   | hecho (2026-10-19)                                              | FN-02-01                  |           |
| FN-02-12  | Migración de datos idempotente que crea en `eccia_eventos` las filas de los cursos `end-vt-pt-mt-2026-09` (11 inscripciones) y `end-vt-ii-pt-ii-ut-i-2026-10` (2), como eventos pasados: `activo = false`, título derivado del código, `codigo_prefijo` provisorio y `fecha_evento`, `fecha_texto` y `duracion` nulos (sin datos inventados); requisito de la FK. Decisión del usuario 2026-10-19: conservar las 13 inscripciones. | hecho (2026-10-19)                                              | FN-02-01                  |           |
| FN-02-03  | Migración: quitar default, FK `not valid`, privilegios y política según DU-02; migración aparte con `validate`.                                                                                                                                                                                                                                                                                                                    | hecho (2026-10-19)                                              | FN-02-02, FN-02-12, DU-02 |           |
| FN-02-04  | Columnas del evento que la rebanada lee y vista `eccia_eventos_publicos`.                                                                                                                                                                                                                                                                                                                                                          | hecho y publicado (2026-10-24)                                  | FN-01-05                  |           |
| FN-02-05a | Inscripción vertical en `public-api`: dominio (`Email`, ventana de inscripción), puertos `Events`/`Registrations`, adaptadores de memoria y Supabase, HTTP, configuración y registro seguro; migración de `inscripcion_abre_en`/`inscripcion_cierra_en` y pruebas de contrato locales. Sin despliegue ni protección contra abuso en esta rebanada.                                                                                 | hecho localmente (2026-10-19); sin desplegar                    | FN-02-03                  |           |
| FN-02-05b | Protección contra abuso: puertos `HumanChallenge`/`RequestLimits`, Turnstile y memoria, HMAC-SHA-256 y consumo atómico en Postgres; 5 intentos por correo/hora y 20 por IP/hora. Fase 1: pruebas; fase 2: implementación y migración tras RED observado. Sin despliegue (FN-02-13).                                                                                                                                                | hecho localmente (2026-10-24); sin desplegar                    | FN-02-05a                 |           |
| FN-02-13  | Primer despliegue de `public-api`, separado del desarrollo: usuario crea widget Turnstile y configura `TURNSTILE_SECRET_KEY`, `REQUEST_LIMIT_HASH_SECRET` y `PUBLIC_SITE_URL` como secretos de Edge Function. Con autorización de despliegue, actualizar workflow y `NOT_DEPLOYED` juntos; verificar CORS real y rechazos 403/429. No abrir eventos.                                                                               | hecho (2026-10-24); 429 extremo a extremo pendiente de FN-02-07 | FN-02-05b                 |           |
| FN-02-06  | Paso de ficha del inspector: `InspectorProfiles`, `FileStorage` Nextcloud, compensación; reescritura de `20261018140000`; validación movida a `domain/`.                                                                                                                                                                                                                                                                           | pendiente                                                       | FN-02-05b                 |           |
| FN-02-07  | Página `public/inscripcion.html?evento=` con `js/core/` y `js/inscripcion/`; ratchet del cliente API.                                                                                                                                                                                                                                                                                                                              | hecho y publicado (2026-10-24)                                  | FN-02-05b                 |           |
| FN-02-08  | Filas de eventos como datos (operador) y `supabase/seed.sql` local.                                                                                                                                                                                                                                                                                                                                                                | pendiente                                                       | FN-02-04                  |           |
| FN-02-09  | Retirar `public/inscripcion-ut2.*`, `submit-ficha-inspector` y su suite.                                                                                                                                                                                                                                                                                                                                                           | pendiente                                                       | FN-02-06, FN-02-07        |           |
| FN-02-10  | Formulario de la landing a la página genérica; retirar el `fetch` de `public/app.js`.                                                                                                                                                                                                                                                                                                                                              | pendiente                                                       | FN-02-07                  |           |
| FN-02-11  | Marcar `PLAN-INSCRIPCION-UT2.md` como reemplazado por F2 y F3.                                                                                                                                                                                                                                                                                                                                                                     | pendiente                                                       | FN-02-09                  |           |
| FN-03-01  | Secreto de webhook, `eccia_post_to_edge_function` con cabecera, autenticación en `_shared/http`.                                                                                                                                                                                                                                                                                                                                   | pendiente                                                       | FN-02-05b                 |           |
| FN-03-02  | `db-events` y `sendRegistrationConfirmation` con estado, idempotencia y snapshots por evento.                                                                                                                                                                                                                                                                                                                                      | pendiente                                                       | FN-03-01                  |           |
| FN-03-03  | Un trigger de despacho "inscripción creada"; eliminar `20261018150000` y las dos funciones de confirmación.                                                                                                                                                                                                                                                                                                                        | pendiente                                                       | FN-03-02                  |           |
| FN-03-04  | Reconciliador `pg_cron`.                                                                                                                                                                                                                                                                                                                                                                                                           | pendiente                                                       | FN-03-02                  |           |
| FN-03-05  | `sync-resend-contact` dentro de `db-events` con la regla de consentimiento en el caso de uso.                                                                                                                                                                                                                                                                                                                                      | pendiente                                                       | FN-03-04                  |           |
| FN-04-01  | `certificates`: `issueCertificate` por (correo, evento), datos del evento, columnas del subplan.                                                                                                                                                                                                                                                                                                                                   | pendiente                                                       | FN-02-03, FN-02-06        |           |
| FN-04-02  | Renderer PDF y QR como adaptadores con versiones exactas e `import()` dinámico.                                                                                                                                                                                                                                                                                                                                                    | pendiente                                                       | FN-04-01                  |           |
| FN-04-03  | `download-certificate` y `validate-certificate` como adaptadores delgados con URL congeladas.                                                                                                                                                                                                                                                                                                                                      | pendiente                                                       | FN-04-01                  |           |
| FN-04-04  | Generación de plantillas (salida elegida del subplan).                                                                                                                                                                                                                                                                                                                                                                             | pendiente                                                       | FN-04-02                  |           |
| FN-04-05  | Certificado de curso activado por evento, con acción del operador.                                                                                                                                                                                                                                                                                                                                                                 | pendiente                                                       | FN-04-02                  |           |
| FN-04-06  | Sacar las referencias de diseño del certificado de `public/`.                                                                                                                                                                                                                                                                                                                                                                      | pendiente                                                       | FN-04-02                  |           |
| FN-05-01  | Página de regalos genérica y reclamo de certificado por evento.                                                                                                                                                                                                                                                                                                                                                                    | pendiente                                                       | FN-04-01                  |           |
| FN-05-02  | `operator`: invitación por Broadcasts con `segment_id`; absorber `send-workshop-reminder` y `send-course-access`.                                                                                                                                                                                                                                                                                                                  | pendiente                                                       | FN-03-05                  |           |
| FN-06-01  | Revisar `PLAN-DOMINIO-ECCIA.md` contra `CLAUDE.md`.                                                                                                                                                                                                                                                                                                                                                                                | pendiente                                                       | —                         |           |
| FN-06-02  | `PUBLIC_SITE_URL` en el legado restante; mover firmas y plantilla (NC-02).                                                                                                                                                                                                                                                                                                                                                         | pendiente                                                       | FN-06-01, FN-04-01        |           |
| FN-06-03  | Corte de dominio y redirector de QR (DOM-04 a DOM-06 revisados).                                                                                                                                                                                                                                                                                                                                                                   | pendiente                                                       | FN-06-02, FN-05-01        |           |

### Reemplazo de las aserciones PowerShell

Ninguna suite `.ps1` recibe aserciones nuevas. Cuando el código que una aserción
cubre se mueve, la aserción se reemplaza por una prueba de comportamiento con
`deno test` en el mismo commit.

| Suite                                                    | Aserciones sobre                                                                       | Se reemplazan en                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `tests/certificate-claim.tests.ps1`                      | privilegio y política de `20260703145000` (líneas 98-99)                               | FN-00-02 (eliminadas) y FN-01-04 (ratchet)                                 |
| `tests/certificate-claim.tests.ps1`                      | `public/regalos.html`, `public/certificados.js`, `public/styles.css`, descargas        | FN-05-01                                                                   |
| `tests/certificate-generation.tests.ps1`                 | `issue-certificate`, `download-certificate`, `validate-certificate`, `config.toml`     | FN-04-01 a FN-04-03                                                        |
| `tests/certificate-generation.tests.ps1`                 | `public/certificado.html`, `public/certificados.js`, `public/validar-certificado.html` | FN-04-06, FN-05-01, y FN-04-03 cuando la página de validación pase a `js/` |
| `tests/landing.tests.ps1`                                | `public/app.js` (incluido `REGISTRATION_CLOSED`), `public/index.html`                  | FN-02-10                                                                   |
| `tests/landing.tests.ps1`                                | `send-registration-confirmation`, su plantilla, `20260921190000`                       | FN-03-02, FN-03-03                                                         |
| `tests/landing.tests.ps1`                                | `sync-resend-contact`                                                                  | FN-03-05                                                                   |
| `tests/landing.tests.ps1`                                | `send-workshop-reminder`, `send-course-access` y sus plantillas                        | FN-05-02                                                                   |
| `tests/landing.tests.ps1`                                | `README.md`, `EMAIL_OPERATIONS.md`, `emails/*.html`, `public/styles.css`               | cuando cambie el documento o archivo correspondiente                       |
| `tests/inscripcion-ut2.tests.ps1`                        | toda la suite                                                                          | FN-02-06, FN-02-07, FN-02-09 (la suite se elimina)                         |
| `tests/submit-ficha-inspector.validation.test.ts` (Node) | validación de la ficha                                                                 | FN-02-06 (pasa a `deno test`)                                              |

## Orden de aplicación y despliegue

Regla general: primero las migraciones de esquema que una función lee (aditivas
y compatibles hacia atrás), después las funciones, y al final las migraciones
cuyos triggers llaman a esas funciones. Nada de esta rama se integra a `main`
mientras contenga piezas de UT2 que el workflow desplegaría
(`deploy-supabase-functions.yml:9-10`) y que F2 y F3 reemplazan.

| Fase | Orden                                                                                                                                                                                                                                                                                                                           | Lo que hace el usuario                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F0   | Migración sola (`20261018130000`).                                                                                                                                                                                                                                                                                              | Aplicarla al remoto con `apply_migration` del MCP (no `db push`, FN-01-07); aprobar las consultas de verificación antes y después.                         |
| F1   | Solo CI y archivos de configuración; no despliega funciones nuevas.                                                                                                                                                                                                                                                             | Push y merge cuando la rama esté libre de la deuda de UT2 o en una rama propia desde `main`.                                                               |
| F2   | 1) datos de la clave del webinar; 2) default, FK `not valid`, columnas del evento, vista, tabla de límites; 3) despliegue de `public-api`; 4) privilegios y política según DU-02 (después de que ninguna página use el insert directo); 5) `validate constraint`; 6) carga de las filas de eventos; 7) Pages publica la página. | Cuenta de Turnstile y secretos (`TURNSTILE_SECRET_KEY`, `REQUEST_LIMIT_HASH_SECRET`, `PUBLIC_SITE_URL`, `NEXTCLOUD_ROOT_DIR`); aplicar migraciones; merge. |
| F3   | 1) despliegue de `db-events` (acepta el secreto); 2) migración del secreto y de `eccia_post_to_edge_function`; 3) migración del trigger de despacho; 4) `pg_cron`; 5) borrar con la CLI las funciones reemplazadas.                                                                                                             | Crear el secreto de webhook; aplicar migraciones; borrar funciones; decidir cuándo abrir inscripciones.                                                    |
| F4   | 1) columnas del evento para certificados; 2) despliegue de `certificates` y de los adaptadores congelados; 3) plantillas en Nextcloud.                                                                                                                                                                                          | Aplicar migraciones; subir plantillas si la salida elegida lo requiere.                                                                                    |
| F5   | Despliegue de `operator`; Pages publica regalos.                                                                                                                                                                                                                                                                                | Segmentos en Resend; frase de aprobación para envíos.                                                                                                      |
| F6   | Según `PLAN-DOMINIO-ECCIA.md` revisado.                                                                                                                                                                                                                                                                                         | DNS, dominio en GitHub Pages, redirector, secretos.                                                                                                        |

### Entrega de F1 y F2 a `main` (decisión del usuario, 2026-10-24)

- **Estrategia:** cadena de PRs sobre una rama de integración
  (`delivery/funnel-f1-f2`, creada desde `main`, PR de seguimiento en borrador y
  sin merge hasta que todos los PRs hijos estén revisados). El PR hijo 1 apunta
  a la rama de integración y cada PR siguiente apunta a su padre inmediato. Un
  único merge a `main` produce un único despliegue; los slices de CI y de
  `config.toml` no redespliegan las funciones heredadas por separado.
- **Contenido:** el árbol final de `feat/inscripcion-ut2` sin la deuda de UT2:
  `public/inscripcion-ut2.*`, `submit-ficha-inspector`,
  `send-ut2-registration-confirmation`, su prueba de validación, la suite
  `tests/inscripcion-ut2.tests.ps1`, `PLAN-INSCRIPCION-UT2.md` y las migraciones
  `20261018140000` y `20261018150000`, que nunca se aplicaron al remoto. Se
  retiran también sus entradas en `NOT_DEPLOYED`, `LEGACY_*` de
  `architecture_test.ts`, `deno.json`, `config.toml`, los `paths` del workflow y
  `CLAUDE.md`; `database.types.ts` se regenera sin `eccia_fichas_inspector`.
  `feat/inscripcion-ut2` sigue viva como referencia para FN-02-06 y FN-02-07.
- **Presupuesto:** unas 8.575 líneas en unos 20 slices de 400 líneas o menos. Se
  pide `size:exception` solo para unidades indivisibles: escáner de ratchets con
  su prueba, archivos generados (`deno.lock`, `database.types.ts`), `CLAUDE.md`
  y `PLAN-FUNNEL.md`.
- **Último slice:** habilita `public-api` en el workflow (`FUNCTIONS`, `paths`
  de `public-api/**` y `_shared/**`) y la retira de `NOT_DEPLOYED`. Antes del
  merge a `main`: aplicar `20261024100000` al remoto, configurar los secretos de
  FN-02-13 y crear el widget de Turnstile.
- Push, creación de PRs y merge son decisiones del usuario.
- **Resultado (2026-10-24, con autorización del usuario):** PRs hijos #1 a #19
  integrados en orden en `delivery/funnel-f1-f2` con commits de merge; el árbol
  resultante es idéntico al del slice 19. PR de seguimiento #21 con el check de
  CI en verde, mergeado a `main` en `4a95ffb`. En `main`, `Check`,
  `Deploy GitHub Pages` y `Deploy Supabase Functions` terminaron correctamente;
  se desplegaron solo las siete funciones heredadas (`download-certificate`,
  `issue-certificate`, `send-course-access`, `send-registration-confirmation`,
  `send-workshop-reminder`, `sync-resend-contact`, `validate-certificate`), no
  `public-api`. El PR #20 (habilitar el despliegue de `public-api`) queda
  abierto contra `main` hasta aplicar `20261024100000` al remoto y completar los
  requisitos de FN-02-13. `feat/inscripcion-ut2` diverge de `main` en la
  historia, no en el contenido fuera de UT2; debe rebasarse sobre `main` antes
  de FN-02-06.

## Riesgos

| Riesgo                                                                                                                       | Mitigación                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Sin Deno nada se compila; el código de la rama nunca se verificó.                                                            | DU-01 bloquea F1; F0 avanza sin Deno. FN-01-03 es la primera verificación real del legado.                                                 |
| El hueco de certificados sigue abierto hasta aplicar F0.                                                                     | F0 primero y sin dependencias; no espera a la cadena de herramientas.                                                                      |
| Integrar la rama actual despliega funciones de UT2 sin compilar.                                                             | No se integra hasta retirar la deuda (FN-02-09) o se integra F0/F1 desde una rama propia.                                                  |
| El workflow que despliega todo activa funciones sin secretos cargados (`RECOVERY.md`: 5 funciones pendientes de despliegue). | `config.ts` falla rápido con un error claro; los secretos se cargan antes del merge que despliega.                                         |
| La vista del catálogo corre con permisos del dueño.                                                                          | Lista explícita de columnas, filtro de eventos publicados y prueba de contrato que falla si la vista expone una columna fuera de la lista. |
| La FK falla por filas con claves inesperadas.                                                                                | Conteo por `taller_codigo` antes (FN-02-01), migración de datos idempotente, `not valid` y `validate` por separado.                        |
| Las aserciones `.ps1` que fijan texto bloquean el movimiento del código.                                                     | Se reemplazan por pruebas de comportamiento en el mismo commit que mueve el código (tabla anterior).                                       |
| Se abre un evento sin confirmación ni reconciliador.                                                                         | Abrir inscripciones es una decisión del usuario posterior a F3.                                                                            |

## Avance

- 2026-10-18: plan propuesto. Decisiones D-06 (sin hotfix del webinar) y D-07
  (todos los lanzamientos postergados) registradas. Pendientes DU-01 a DU-04.
- 2026-10-18: FN-00-01 hecho. Privilegios por columna confirmados en
  `eccia_taller_inscripciones` (C1: la inscripción no falla por permisos) y en
  `eccia_masterclass_certificados` (todas las columnas para `anon` y
  `authenticated`). `creado_en` existe; los 2 `external` se reconocen como altas
  del operador.
- 2026-10-18: DU-01 resuelta. Deno 2.9.7, Supabase CLI 2.121.0 y Docker Desktop
  29.8.2 instalados en la máquina de desarrollo.
- 2026-10-18: FN-00-02 hecho (`f4b1f49`), ruta delegada (un escritor). Stack
  local con `supabase start` (Postgres 17.11). RED, con las migraciones
  existentes: `deno task test:db` falla en 4 de 5 pasos con 177 violaciones,
  entre ellas `eccia_masterclass_certificados: anon has INSERT` (y los demás
  privilegios de tabla, incluido `MAINTAIN`), los mismos privilegios por columna
  en todas sus columnas,
  `policy "Permitir registro público de nombres para certificados"
  (INSERT) targets anon`
  y `default privileges of postgres (public): anon gets
  SELECT on new tables`
  (y el resto, también para `authenticated`). GREEN, después de
  `supabase db reset` con `20261018130000`: `ok | 1 passed (5 steps)`.
  Verificación local: `service_role` inserta y lee certificados (en transacción
  revertida); `anon` recibe
  `permission denied for table
  eccia_masterclass_certificados`; el grant por
  columna de `eccia_taller_inscripciones`
  (`INSERT (correo, marketing_consent, nombre,
  taller_codigo)`) sigue intacto;
  reaplicar la migración sobre la base migrada no falla (idempotente).
  `deno task check` pasa; `tests/certificate-claim.tests.ps1` pasa ("Certificate
  claim checks: OK"). Pglast no está instalado: la sintaxis se verificó
  aplicando la migración. Siguiente: FN-00-03.
- 2026-10-19: FN-00-03 hecho. El usuario aprobó aplicar `20261018130000` en el
  proyecto remoto; se aplicó con `apply_migration` del MCP y quedó registrada en
  el historial remoto como `20261019002307_revoke_public_table_privileges` (la
  deriva de versiones sigue, FN-01-07). Antes: `anon` y `authenticated` con
  `DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE` sobre
  `eccia_masterclass_certificados` (tabla y todas las columnas), política
  `Permitir registro público de nombres para certificados` presente, defaults de
  `postgres` en `public` con `anon=arwdDxtm` y `authenticated=arwdDxtm`.
  Después: `has_table_privilege` de `anon` es `false` en las tres tablas
  `eccia_`; ningún privilegio de tabla para `anon`/`authenticated`; solo queda
  el `INSERT` por columna `(correo, marketing_consent, nombre, taller_codigo)`
  en `eccia_taller_inscripciones` y su política; la política abierta de
  certificados no existe; defaults de `postgres` =
  `postgres=arwdDxtm service_role=arwdDxtm` (los de `supabase_admin` siguen
  abiertos, como se esperaba). Conteos sin cambios: 19 `emailed`, 2 `external`.
  `validate-certificate?code=DF-DMST-09810D69` responde 200 con `valid: true`.
  Siguiente: FN-00-04.
- **2026-10-19 · FN-00-04 hecho.** `README.md` (sección «Registrar un
  certificado `external`») documenta el procedimiento: SQL como administrador,
  curso previo en `eccia_eventos`, código en mayúsculas con el prefijo del
  curso. Verificado en el stack local: el `insert` documentado como
  `service_role` (con un curso de prueba) tiene éxito y el mismo `insert` como
  `anon` falla con
  `permission denied for table
  eccia_masterclass_certificados`; todo dentro de
  una transacción con `rollback`, sin filas residuales. No se tocó el remoto.
- **2026-10-18 · FN-01-02 hecho** (ruta delegada, un escritor). Fin de línea:
  `.gitattributes` con `* text=auto eol=lf` y binarios explícitos (`7c6ad5b`);
  el índice ya estaba en LF, de modo que `git add --renormalize` no cambió
  contenido (`git diff -w` limpio) y el árbol de trabajo se regeneró en LF.
  Primer `deno fmt` (`8635acc`): TypeScript, JavaScript y Markdown; HTML, CSS y
  YAML quedan fuera del alcance (FN-01-08). Suites PowerShell, línea base (CRLF)
  y tras LF: las cuatro `OK`; `tests/submit-ficha-inspector.validation.test.ts`:
  17 pasan con `--no-check` (con verificación de tipos falla con TS2345; es de
  FN-01-03). Tras el formateo, 8 archivos rompían aserciones fijadas por las
  suites y se excluyeron de `fmt` sin tocar su contenido:
  `download-certificate`, `issue-certificate` y `validate-certificate`
  (`certificate-generation`); `send-course-access`,
  `send-registration-confirmation`, `send-workshop-reminder` y
  `sync-resend-contact` (`landing`); `submit-ficha-inspector`
  (`inscripcion-ut2`), todos `index.ts`. Lista de legado de `lint`: 11 archivos
  con 47 hallazgos (`public/app.js`, `public/certificados.js` y 9 `index.ts` de
  funciones). Tarea `deno task serve`: `jsr:@std/http@1.1.4/file-server`
  (publicada el 2026-09-24) sobre `public/`; responde 200 en `/` y
  `/index.html`. `deno task check` y `deno task test:db` pasan. `deno check` no
  cambió de alcance (FN-01-03).
- **2026-10-18 · FN-01-03 hecho** (ruta delegada, un escritor). Primer
  `deno check` del legado, línea base por archivo: `issue-certificate/index.ts`
  3 errores (TS2353 x2 en `characterSpacing` y TS2769 de `fetch` con
  `Uint8Array` como cuerpo, líneas 162, 219 y 482);
  `submit-ficha-inspector/index.ts` 1 (TS2769, línea 101);
  `tests/submit-ficha-inspector.validation.test.ts` 1 (TS2345, línea 300); los
  otros 12 archivos de `.ts` (los 8 `index.ts` restantes y los 4 auxiliares) sin
  errores. Corregidos (`dc75769`): el cuerpo de la subida a Nextcloud en
  `submit-ficha-inspector` pasa una copia `new Uint8Array(bytes)` (mismo
  contenido, tipo `ArrayBuffer`) y la prueba usa `assert.throws(fn,
  mensaje)`;
  ahora pasa con verificación de tipos y entra en `deno task check` (`tests/` se
  añade a `deno check` y a `deno test`). Lista de legado de tipos (`exclude` de
  `deno.json`, 1 archivo, `cd48426`): `issue-certificate/index.ts`; clase: API
  de librería sin fijar (`npm:pdf-lib` flotante no declara `characterSpacing`;
  quitarlo exige decidir el diseño del espaciado) y tipo del cuerpo de `fetch`;
  se migra en F4. `deno.lock` se versiona. Suites PowerShell antes y después:
  las cuatro `OK`. `deno task check` y `deno task test:db` pasan.
- **2026-10-18 · FN-01-04 hecho** (ruta delegada, un escritor; `e6b6ee0`). Un
  primer intento en un entorno aislado no pudo ejecutar Deno (`Access denied`) y
  dejó un borrador sin verificar; se revisó y se reescribió. Ratchets en
  `supabase/functions/tests/architecture/`: `scanner.ts` extrae los hechos del
  árbol sintáctico de `@babel/parser` (`npm:@babel/parser@7.29.9`, publicado el
  2026-09-18, en `deps.ts`), no de expresiones regulares sobre el texto;
  `rules.ts` define las reglas y el ratchet; `scanner_test.ts` (13 pruebas con
  fixtures en memoria) cubre las brechas que señaló la auditoría del borrador:
  código dentro de `${...}`, `obj.import()`, escapes Unicode, hexadecimales y de
  continuación de línea, subpaths con versión exacta
  (`jsr:@std/http@1.1.4/file-server`), alias y reexportación de `createClient`,
  `import()` calculado, directivas `/// <reference>` y `@deno-types`, y
  `Deno.env` por alias, desestructuración, `globalThis` o clave calculada. Un
  archivo que no se puede analizar hace fallar la prueba en lugar de contar como
  limpio. Se descartó la API del compilador de TypeScript: su build de npm lee
  `process.env` al cargar y obligaría a `--allow-env` en toda tarea que importe
  `deps.ts`. `architecture_test.ts` escanea todos los módulos de
  `supabase/functions/`, `tests/` incluido, dentro de `deno task check`
  (`--allow-read=supabase/functions/`); cada regla falla si un archivo fuera de
  su lista la viola (`unlisted`) o si un archivo de la lista ya no la viola
  (`stale`).

  RED sin listas de legado (observado): regla 1 (specifiers de terceros fuera de
  `deps.ts`; cuenta todo specifier que no sea relativo ni `node:`, también los
  nombres desnudos que un import map podría redirigir) 21 violaciones en 9
  archivos; regla 2 (cliente Supabase fuera de `_shared/adapters/supabase/`) 27
  en 9; regla 3 (`Deno.env` fuera de `config.ts`) 30 en 9; regla 4 (`console`
  fuera de `log.ts`) 7 en 2; versiones exactas en `deps.ts` 0 (sus 3 specifiers
  están fijados); regla 5 (`domain/` sin imports externos) 0, porque `domain/`
  aún no existe. Estas dos se comprobaron con fixtures en memoria que las
  violan. GREEN con las listas: 19 pruebas pasan. Listas de legado: reglas 1 a
  3, los 9 `index.ts` legados (`download-certificate`, `issue-certificate`,
  `send-course-access`, `send-registration-confirmation`,
  `send-ut2-registration-confirmation`, `send-workshop-reminder`,
  `submit-ficha-inspector`, `sync-resend-contact`, `validate-certificate`);
  regla 4, `issue-certificate/index.ts` y `submit-ficha-inspector/index.ts`;
  versiones de `deps.ts` y regla 5, vacías. Entrada obsoleta: con
  `send-course-access/template.ts` agregado a la lista de `console`, la prueba
  falla con `stale: ["send-course-access/template.ts"]`; se retiró.

  `tests/` entra en las reglas 3 y 4 (el borrador lo excluía): hoy no aporta
  violaciones y la regla protege una propiedad del ratchet de privilegios, que
  no puede apuntarse al remoto con una variable de entorno. Las pruebas de
  `config.ts` (F2) le pasan un registro de variables en lugar de leer
  `Deno.env`. `deps.ts` queda fuera de la regla 2 porque debe reexportar
  `supabase-js` para el adaptador. Límites conocidos: no sigue nombres armados
  con cadenas concatenadas ni `require()`, y cuenta cualquier `createClient`,
  aunque sea de otra librería. Pendiente de decisión antes de F2: `deps.ts`
  reúne dependencias de pruebas (`@std/assert`, `postgres`, `@babel/parser`) y
  la primera función que lo importe las cargaría todas; hay que dividirlo o
  admitir en la regla 1 un segundo archivo de dependencias de pruebas.
  `deno task check` y `deno task test:db` pasan; las cuatro suites PowerShell,
  `OK`.
- 2026-10-19: decisión del usuario sobre `deps.ts`: separar dependencias por
  frontera de ejecución. `_shared/deps.ts` queda solo para dependencias que
  importa el código desplegado y `supabase/functions/tests/dev_deps.ts` para
  herramientas de prueba; ningún paquete puede estar en ambos. Como hoy ninguna
  función usa dependencias, las tres (`@std/assert`, `@babel/parser`,
  `postgres`) pasan a `dev_deps.ts` y `_shared/deps.ts` se elimina hasta que lo
  cree su primer llamador en F2. Reglas nuevas en
  `supabase/functions/tests/architecture/`: dependencias externas solo en esos
  dos archivos, versión exacta en ambos, sin paquetes duplicados, `dev_deps.ts`
  importado solo desde `tests/`, y toda exportación de `deps.ts` usada fuera de
  `tests/`. RED observado antes del cambio: falla
  `every runtime dependency export
  is used outside tests` con `assertEquals`,
  `assertThrows`, `babelParse` y `postgres` sin importadores fuera de `tests/`
  (24 pruebas pasan). GREEN: `deno task check` 42 pasan, `deno task test:db` 1
  pasa (5 pasos), las cuatro suites PowerShell `OK`. `CLAUDE.md` actualizado
  (Layout y Testing). Reglas escritas por Codex (`gpt-6-luna`); verificación y
  commit del orquestador.
- 2026-10-19: FN-01-05 implementado; pendiente de la primera ejecución en CI
  (requiere push, decisión del usuario). `.github/workflows/check.yml` corre en
  `push` y `pull_request` y se reutiliza (`workflow_call`) desde `pages.yml` y
  `deploy-supabase-functions.yml`; sus jobs de despliegue tienen `needs: check`.
  El job parsea todas las migraciones con pglast
  (`.github/scripts/check_migrations.py`), ejecuta `deno task check`, levanta el
  stack local y ejecuta `deno task test:db`, y lo detiene en un paso `always()`.
  Versiones fijadas y verificadas (tags existentes en GitHub, versión en PyPI):
  Deno 2.9.7, Supabase CLI 2.121.0, Python 3.12.10, pglast 7.20 (línea 7 =
  parser de PostgreSQL 17; la 7.4 propuesta inicialmente no existe);
  `actions/checkout@v6.0.0` (`deploy-supabase-functions.yml` queda en
  `@v4.2.2`), `denoland/setup-deno@v2.0.3`, `actions/setup-python@v6.0.0`,
  `supabase/setup-cli@v1.4.0`, `actions/configure-pages@v5.0.0`,
  `actions/upload-pages-artifact@v4.0.0`, `actions/deploy-pages@v4.0.5`. El
  grupo de concurrencia incluye `github.workflow` para que la ejecución directa
  y la de cada despliegue no se cancelen entre sí. Redactado por Codex
  (`gpt-6-luna`); revisión, correcciones y commit del orquestador.
- 2026-10-19: FN-01-06 implementado, pendiente de primera ejecución en CI.
  `deploy-supabase-functions.yml` despliega las siete funciones de producción:
  `validate-certificate`, `download-certificate`, `sync-resend-contact`,
  `send-registration-confirmation`, `send-workshop-reminder`,
  `issue-certificate` y `send-course-access`. Se excluyen
  `submit-ficha-inspector` y `send-ut2-registration-confirmation`: son deuda de
  UT2 que F2 reemplaza y no están desplegadas en producción. El nuevo ratchet de
  arquitectura contrasta las carpetas, la lista de despliegue y
  `supabase/config.toml`; falla ante exclusiones obsoletas, funciones sin
  cobertura, nombres desplegados sin carpeta o configuración explícita de
  `verify_jwt`. RED observado por el orquestador con el workflow anterior: falla
  `every Edge
  Function is deployed or explicitly excluded` (seis funciones de
  producción sin desplegar; `submit-ficha-inspector` y
  `send-ut2-registration-confirmation` desplegadas pese a estar excluidas);
  GREEN con el nuevo: `deno task check` 45 pasan. Redactado por Codex
  (`gpt-6-luna`); el orquestador corrigió un error de tipos (TS2345) en la
  prueba, verificó y confirmó.
- 2026-10-19: DU-04 resuelta y FN-02-01 hecho. Conteo en vivo de solo lectura de
  inscripciones por `taller_codigo`: `domina-scan-a` 101, `end-vt-pt-mt-2026-09`
  11, `end-vt-ii-pt-ii-ut-i-2026-10` 2,
  `diseno-modelado-sistemas-tuberias-autocad-arcgis` 1,
  `preparador-muestras-metalograficas` 1. Eventos existentes: estos dos últimos
  y `ultrasonido-industrial-scan-a` (19 certificados). El usuario confirmó que
  `domina-scan-a` es `ultrasonido-industrial-scan-a`. Nueva tarea FN-02-12 para
  los dos cursos END sin evento.
- 2026-10-19: el usuario ya no necesita los datos de los cursos
  `end-vt-pt-mt-2026-09` y `end-vt-ii-pt-ii-ut-i-2026-10` y decidió conservar
  sus 13 inscripciones con eventos pasados. FN-02-12 crea esas dos filas con
  `activo = false`, título derivado del código y prefijo provisorio; las fechas
  y la duración quedan nulas porque son opcionales y no se inventan datos.
- 2026-10-19: FN-02-02, FN-02-12 y FN-02-03 implementados localmente, pendientes
  de aplicar en remoto. Cuatro migraciones nuevas, posteriores a
  `20261018140000` y `20261018150000` (ambas intactas):
  1. `20261019100000_move_scan_a_registrations.sql`: actualización idempotente
     de `domina-scan-a` a `ultrasonido-industrial-scan-a`, sin borrar filas ni
     cambiar identificadores. Bloquea escrituras concurrentes durante la
     comprobación y falla explícitamente si un correo normalizado con
     `lower(btrim(correo))` existe bajo ambas claves; no descarta duplicados.
     Emite conteos antes/después mediante `NOTICE`.
  2. `20261019100100_add_past_end_course_events.sql`: altas idempotentes de los
     dos cursos END inactivos. Títulos derivados de sus códigos y prefijos
     provisionales `ECCIA-END09-` y `ECCIA-END10-`, sin colisiones con otros
     eventos; fechas y duración nulas, sin inventar datos.
  3. `20261019100200_close_public_registration_writes.sql`: retira el default,
     el INSERT por columna de `anon`/`authenticated` y la política
     `publico_puede_registrar_inscripcion_eccia`; agrega
     `eccia_taller_inscripciones_evento_fkey` como `not valid`.
  4. `20261019100300_validate_registration_event_fk.sql`: valida esa FK en una
     migración posterior, separada del cambio destructivo.

  **Decisión sobre el despacho Scan A:** se elimina explícitamente el trigger
  `eccia_send_registration_confirmation_after_insert` en la tercera migración,
  en vez de dejar su filtro `domina-scan-a` sin coincidencias o ampliar una
  plantilla histórica a inscripciones nuevas. Se conserva su función privada
  hasta la limpieza de F3. No se modifican el despacho UT2 ni el trigger de
  integridad de la ficha. La actualización de datos no dispara confirmaciones de
  INSERT. No se abren inscripciones: la confirmación genérica y la apertura
  siguen dependiendo de F3.

  **Conteos:** base en vivo verificada por el orquestador antes de esta tarea:
  `domina-scan-a` 101 → 0 esperado; `ultrasonido-industrial-scan-a` 0 → 101
  esperado; END septiembre 11 → 11 esperado; END octubre 2 → 2 esperado;
  tuberías 1 → 1 esperado; metalografía 1 → 1 esperado. Total 116 → 116
  esperado. Eventos END 0 → 2 esperado. Los conteos posteriores son objetivos,
  no resultados observados: quedan pendientes la prueba local con filas
  sembradas y la verificación remota antes/después de cada aplicación.

  **Pruebas:** ratchet de privilegios con lista de INSERT vacía y sin políticas
  para roles públicos; nueva prueba local de FK validada y destino exacto,
  ausencia de default, eventos END inactivos con metadatos desconocidos nulos,
  ausencia de la clave antigua y rechazo `23503` como `service_role` dentro de
  una transacción revertida. RED, `supabase db reset`, GREEN, conservación de
  filas, idempotencia y colisiones quedan a cargo del orquestador; no ejecutados
  por el trabajador. El intérprete Python disponible no tiene pglast: queda
  pendiente el análisis de sintaxis, además de `deno task check` y
  `deno task test:db`. `CLAUDE.md` alinea Writes y Security invariants con
  DU-02.

  **Aplicación remota:** una migración a la vez mediante MCP `apply_migration`,
  en el orden anterior y con autorización explícita; nunca `db push` por la
  deriva del historial (FN-01-07). No se aplicaron migraciones, no se desplegó
  `public-api` y no se creó ningún commit en esta tarea.
- 2026-10-19: verificación del orquestador de FN-02-02, FN-02-12 y FN-02-03
  sobre el stack local. RED con la base anterior a las migraciones: fallan 6
  pasos (privilegios por columna y políticas para roles públicos, FK, default,
  eventos END, rechazo de evento desconocido). Datos:
  `supabase db reset
  --version 20261018150000`, carga de 5 inscripciones
  `domina-scan-a` y 1 por cada curso END, `supabase migration up`: quedan 5 en
  `ultrasonido-industrial-scan-a`, los cursos END intactos, sus eventos con
  `activo = false` y fecha nula, FK validada, sin default y sin el trigger de
  confirmación de Scan A. Reejecutar las dos migraciones de datos no cambia nada
  (`moved=0`). Con un mismo correo en ambas claves, la migración falla con el
  mensaje de colisión y no cambia filas. GREEN tras `supabase db reset`:
  `deno task test:db` 2 pasan (10 pasos), `deno task check` 45 pasan, las cuatro
  suites PowerShell `OK`. Pglast sigue sin ejecutarse localmente; lo hará el job
  `check` de CI. Pendiente: aplicar las cuatro migraciones en remoto (decisión
  del usuario), una por una con `apply_migration`.
- 2026-10-19: revisión nativa de Gentle AI sobre el commit `286681a` (la de la
  rama completa no entraba en el presupuesto de contexto de los revisores):
  aprobada con el lente `review-reliability` y reconocida (lineage
  `review-b5817d7b40733c7b`). Cuatro observaciones informativas, como trabajo
  posterior: cerrar la escritura pública antes de que exista `public-api` (sin
  impacto hoy: el formulario está cerrado), probar la migración de datos con una
  prueba automática (hoy verificada a mano), afirmar en una prueba que el
  trigger de Scan A ya no existe, y comprobar huérfanos antes de `validate`.
- 2026-10-19: FN-02-02, FN-02-12 y FN-02-03 aplicados en remoto con autorización
  del usuario, uno por uno con `apply_migration` (historial remoto
  `20261019021628`, `20261019021637`, `20261019021712`, `20261019021717`).
  Antes: 101 inscripciones `domina-scan-a`, ninguna con el mismo correo en ambas
  claves, `INSERT` por columna para `anon`/`authenticated`, default
  `'domina-scan-a'`, política pública y trigger de confirmación de Scan A. Entre
  la segunda y la tercera: 0 inscripciones huérfanas. Después: 101 en
  `ultrasonido-industrial-scan-a`, 11 y 2 en los cursos END (eventos con
  `activo = false`, prefijos `ECCIA-END09-` y `ECCIA-END10-`, fechas nulas), 116
  inscripciones en total como antes; FK validada, sin default, sin privilegios
  por columna ni políticas para roles públicos en ninguna tabla `eccia_`,
  `has_table_privilege` de `anon` falso en las tres; solo queda el trigger
  `eccia_sync_resend_contact_after_insert`. Certificados sin cambios (19
  `emailed`, 2 `external`).
- 2026-10-19: FN-02-05a, fase 1: redactadas únicamente las pruebas de dominio,
  aplicación, HTTP, configuración, contratos de puertos (memoria y Supabase
  local) y migración de la ventana de inscripción. Se fija HTTP 409 para la
  inscripción cerrada y el contrato `event_code` de la solicitud; la respuesta
  201 contiene solo `id` y `event_code`. `public-api` queda en `NOT_DEPLOYED`
  hasta FN-02-05b (Turnstile y límites). No se escribió código de producción ni
  migraciones, ni se ejecutaron pruebas o commits: el orquestador debe observar
  RED antes de la fase 2. Los contratos HTTP contra el stack local necesitan
  permiso de red para `127.0.0.1:54321`, además del puerto SQL `54322`; la tarea
  actual `test:db` solo permite este último. Las pruebas usan exclusivamente
  destinos locales y rechazan un stack con despacho de webhooks configurado.

- 2026-10-19: FN-02-05a, fase 2 implementada localmente; pendiente de
  verificación del orquestador. El orquestador observó RED en la fase 1 por los
  módulos ausentes (TS2307). Se incorporan dominio, puertos, caso de uso,
  adaptadores de memoria y Supabase, parseo HTTP, CORS, mapeo único de errores,
  configuración inyectable y registro con campos y valores permitidos. La
  composición de `public-api` usa la service role, reloj e identificador de
  solicitud; su importación en pruebas no lee el entorno ni inicia el servidor.
  Se corrigen los tipos de las pruebas sin reducir sus aserciones. La migración
  `20261019110000_add_event_registration_window.sql` agrega las fechas nulas sin
  defaults y exige cierre posterior a apertura cuando ambas existen; no abre
  eventos existentes. `test:db` permite únicamente los puertos locales 54321 y
  54322. `database.types.ts` es un marcador temporal: el orquestador debe
  regenerarlo desde el stack local después de aplicar la migración. Pendientes:
  formato, lint, tipos, pruebas unitarias y de contrato y análisis de
  migraciones. El trabajador no ejecutó Deno, Docker, Supabase CLI ni git. No
  hay despliegue, aplicación remota ni commit; Turnstile y límites siguen en
  FN-02-05b y `public-api` permanece en `NOT_DEPLOYED`.
- 2026-10-19: verificación del orquestador de FN-02-05a. RED de la fase 1:
  `deno task check` falla por los 12 módulos inexistentes (TS2307), y además por
  errores de tipos en las propias pruebas que se corrigieron en la fase 2. Tipos
  de la base regenerados con `supabase gen types typescript --local`
  (`_shared/database.types.ts`). El contrato del adaptador de Supabase falló con
  `permission denied for schema private`: las funciones de los triggers de
  despacho corrían con el rol que inserta, así que **ningún insert con la
  service role funcionaba, tampoco en producción**. Corrección en
  `20261019120000_run_dispatch_functions_as_owner.sql` (`security definer`,
  `search_path` vacío ya presente, `execute` revocado a los roles de la API) con
  el ratchet `tests/db/dispatch_functions_test.ts` (RED: funciones como
  invocador y `eccia_sync_resend_contact` ejecutable por `anon`). Con
  `supabase functions serve` la función falló al arrancar porque `config.ts`
  rechazaba el `SUPABASE_URL` interno del runtime local (`http://kong:8000`):
  `SUPABASE_URL` admite ahora `http` o `https` (lo inyecta la plataforma) y
  `PUBLIC_SITE_URL` mantiene HTTPS o localhost; prueba agregada (RED y GREEN).
  Prueba manual sobre la función servida: evento existente cerrado → 409
  `REGISTRATION_CLOSED`; código inexistente → 404; con la ventana abierta, un
  correo con mayúsculas y espacios → 201 `{ id, event_code }` y guardado en
  minúsculas; el mismo correo con otra capitalización → 409
  `ALREADY_REGISTERED`; filas de prueba borradas y ventana restaurada.
  Observación para FN-02-05b: el gateway local agrega
  `access-control-allow-origin: *` a todas las respuestas (también a
  `validate-certificate`); las pruebas de ruta fijan el origen exacto del
  handler, y el encabezado real se verifica en el primer despliegue. GREEN:
  `deno task check` 85 pasan, `deno task test:db` 6 pasan (27 pasos), las cuatro
  suites PowerShell `OK`. Pendiente: aplicar en remoto `20261019110000` y
  `20261019120000` (decisión del usuario).
- 2026-10-19: aplicadas en remoto, con autorización del usuario y una por una
  con `apply_migration`, `20261019110000_add_event_registration_window`
  (historial remoto `add_event_registration_window`) y
  `20261019120000_run_dispatch_functions_as_owner`
  (`run_dispatch_functions_as_owner`). Antes: las tres funciones de `private`
  con `prosecdef = false` y ejecutables por `anon`; sin columnas de ventana; 5
  eventos, 116 inscripciones. Después: las tres con `security definer` y sin
  `execute` para `anon` ni `authenticated`; `inscripcion_abre_en` e
  `inscripcion_cierra_en` como `timestamptz` sin default, `check` validado y 0
  eventos con ventana (todos siguen cerrados); 5 eventos y 116 inscripciones.
  Prueba del bug corregido en una transacción revertida: un insert como
  `service_role` funciona; después del `rollback` no queda la fila ni ninguna
  solicitud en `net.http_request_queue`.
- 2026-10-19: FN-02-05b, fase 1: redactadas únicamente pruebas de política e IP,
  envoltorio de aplicación, Turnstile con `fetch` inyectado, hash HMAC, memoria,
  ruta HTTP y configuración, además del contrato `RequestLimits` contra memoria
  y Postgres local. Se fijan 5 intentos por correo/hora y 20 por IP/hora,
  rechazo 403 `CHALLENGE_FAILED`, 429 `RATE_LIMITED` con `Retry-After`, CORS en
  errores y ausencia de datos personales, hashes y secretos en logs. Las pruebas
  cubren consumo concurrente, vencimiento con reloj inyectado o ventana real
  corta, eliminación de filas vencidas y cierre de privilegios. Se reutiliza el
  fixture JWT local de FN-02-05a desde `tests/fixtures/localStack.ts` en lugar
  de copiarlo. Contratos de módulos de fase 2 documentados en F2. FN-02-13
  separa el primer despliegue: widget Turnstile y secretos reales del usuario
  (`TURNSTILE_SECRET_KEY`, `REQUEST_LIMIT_HASH_SECRET`, `PUBLIC_SITE_URL`),
  autorización y verificación del CORS real. Sin código de producción,
  migraciones, cambios de workflow ni de `NOT_DEPLOYED`; sin delegación ni
  ejecución de Deno, Docker, Supabase CLI o git. Formato, RED, tipos, lint,
  pruebas, revisión y commit quedan pendientes del orquestador; no se afirma
  ningún resultado de ejecución. Próximo paso: observar RED antes de implementar
  la fase 2.
- 2026-10-24: FN-02-05b, fase 2: implementados los módulos del contrato de F2.
  Dominio `requestLimits.ts` (políticas de 5 intentos por correo y 20 por IP en
  3600 segundos; `extractClientIp` toma solo la primera entrada de
  `x-forwarded-for` y usa `unknown` si no es una IPv4 o IPv6 válida sin puerto
  ni zona), puertos `HumanChallenge` y `RequestLimits`, caso de uso
  `registerPublicRegistration` como envoltorio de `registerForEvent` (desafío,
  límite IP, límite correo; token e IP no llegan a `Registrations.create`),
  `DomainError` ampliado con `CHALLENGE_FAILED` (403) y `RATE_LIMITED` (429 con
  `Retry-After` entero positivo redondeado hacia arriba), adaptadores Turnstile
  (formulario a `siteverify`, `fetch` inyectable, tiempo límite de 5 s, falla
  cerrado y registra solo el evento `challenge.unavailable` con el estado HTTP),
  memoria, HMAC-SHA-256 con Web Crypto y Supabase (RPC `eccia_consumir_limite`).
  `parseRegistrationRequest` parsea `challenge_token` (cadena no vacía de hasta
  2048 caracteres) y la IP antes de cualquier efecto; `config.ts` exige
  `TURNSTILE_SECRET_KEY` y `REQUEST_LIMIT_HASH_SECRET`; `public-api` compone
  siempre el envoltorio. Migración `20261024100000_add_request_limits.sql`:
  tabla `public.eccia_limites_solicitud` (`clave_hash` hexadecimal de 64
  caracteres como clave primaria, `intentos >= 1`, `vence_en`), RLS sin
  políticas, sin privilegios para `anon` ni `authenticated`; función
  `security definer` con `search_path` vacío que valida argumentos, elimina
  filas vencidas (`skip
  locked`) y decide en un único
  `insert ... on conflict do update` con `clock_timestamp()`; `execute` solo
  para `service_role`. Tipos de `database.types.ts` agregados a mano con la
  forma de `supabase gen types`, porque Docker no está disponible. RED observado
  por el orquestador: 27 errores de tipos por módulos inexistentes, más un
  defecto de tipado en `tests/db/requestLimits_test.ts`
  (`assertEquals(rows, [])` sobre un `RowList` de postgres), corregido a
  `assertEquals(rows.length, 0)` sin cambiar la intención. Verificación
  ejecutada: `deno task check` correcto (formato, lint, tipos y 119 pruebas
  aprobadas, 0 fallidas); `check_migrations.py` con pglast 7.20 en un entorno
  virtual temporal: 21 migraciones analizadas sin errores, y el cuerpo PL/pgSQL
  de la función se analiza con `parse_plpgsql`. Pendiente hasta que el stack
  local funcione: `deno task test:db` (contrato `RequestLimits` contra Postgres,
  privilegios y ratchets de despacho) y la regeneración de tipos con
  `supabase gen types`. Sin despliegue ni migración remota. Commit `ec6e096`;
  riesgo evaluado: medio; revisión nativa omitida por el usuario para este
  candidato. Seguimiento menor: compartir con `registrationPorts.ts` la
  configuración del cliente de Supabase, hoy duplicada en
  `adapters/supabase/requestLimits.ts`.
- 2026-10-24: FN-02-05b, pendientes locales cerrados con el stack local (Docker
  29.8.2, Supabase CLI 2.121.0). `supabase migration up --local` aplicó
  `20261024100000_add_request_limits.sql`; `deno task test:db`: 11 pruebas (35
  pasos) aprobadas, 0 fallidas, incluido el contrato `RequestLimits` contra
  Postgres. `supabase gen types typescript --local`, tras `deno fmt`, es
  idéntico a `database.types.ts`; los tipos escritos a mano quedan confirmados.
- 2026-10-24: FN-02-13 cerrado. Widget Turnstile `ECCIA inscripción` (modo
  Managed; hostnames `preinscripcion.littusgroup.com` y `localhost`; site key
  pública `0x4AAAAAAFkQkWGC4HttCEQB`, para el cliente de FN-02-07). Secretos de
  Edge Function presentes: `TURNSTILE_SECRET_KEY` (cargado por el usuario en el
  dashboard), `REQUEST_LIMIT_HASH_SECRET` (generado y cargado con la CLI sin
  mostrarse) y `PUBLIC_SITE_URL=https://preinscripcion.littusgroup.com`.
  `20261024100000_add_request_limits.sql` aplicada con `apply_migration`
  (versión remota `20261024182302`), con aprobación del usuario. Antes: tabla y
  función inexistentes. Después: RLS activo, sin privilegios de tabla ni
  `execute` para `anon` y `authenticated`, `security definer`, `search_path=""`,
  `execute` para `service_role`, 0 filas. PR #20 mergeado en `main` (`13ff6b4`);
  `Check`, Pages y despliegue correctos; desplegadas `public-api` y las siete
  funciones heredadas. Verificación en vivo contra
  `/functions/v1/public-api/registrations`: preflight 204 con
  `Access-Control-Allow-Origin` exacto; origen ajeno sin esa cabecera; sin
  `challenge_token` 400 `INVALID_INPUT`; token falso 403 `CHALLENGE_FAILED`,
  ambos con CORS, y la tabla de límites siguió con 0 filas (el desafío fallido
  no consume cupo). 429 extremo a extremo no verificado: exige tokens válidos
  del widget real (FN-02-07). En su lugar, `eccia_consumir_limite` en el remoto
  con una clave de prueba y límite 5: intentos 1 a 5 permitidos, el 6 rechazado
  con `retry_after_seconds = 43`; la fila de prueba se borró (0 filas). Una
  primera prueba con la llamada no correlacionada devolvió seis permitidos
  porque Postgres evaluó la función una sola vez (fila con `intentos = 1`);
  defecto de la prueba, no del código. Pendientes: verificar que el gateway de
  Supabase no permite falsear la primera entrada de `x-forwarded-for` (si lo
  permite, el límite por IP es evadible; el desafío y el límite por correo se
  mantienen); revocar el token personal de Supabase usado para la CLI; ningún
  evento tiene la ventana de inscripción abierta.
- 2026-10-24: FN-02-04 y FN-02-07, rebanada vertical en
  `feat/inscripcion-generica`, hecha localmente; sin migración remota, sin
  despliegue y sin push. Commits: `10349ef` (catálogo: migración
  `20261024200000_add_public_event_catalog.sql`, tipos regenerados, contrato del
  catálogo y ratchet de vistas públicas; 415 líneas agregadas, 1 eliminada),
  `6633c49` (`public/js/core/config.js` y `api.js`, ratchet de configuración
  pública y cambios de `deno.json`; 689 agregadas, 4 eliminadas) y `f871c6f`
  (`public/inscripcion.html`, `public/js/inscripcion/`,
  `public/js/core/turnstile.js`, estilos y `linkedom@0.18.13` en
  `tests/dev_deps.ts`; 2344 agregadas). Marca: `brand_id` `eccia`, kit en
  `C:\Users\bryan\dev\littus-brand-kit` (valor confirmado por el usuario para
  `LITTUS_BRAND_KIT`); se leyeron `agents/brand-applicator.md`, `STEERING.md`,
  `manifest.json`, `BRAND.md`, `tokens.json` y `components.css`; el proyecto ya
  tenía `brand/tokens.css`, `brand/components.css` (idéntico al del kit salvo
  finales de línea) y logos en `brand/assets/` (la carpeta `assets/` del kit
  está vacía).
  - Decisiones: `tipo` y `resumen` son nulables, sin default y sin relleno. Un
    default rotularía un curso como webinar (o al revés) y escribir textos por
    evento en una migración convertiría datos en código; el operador los
    completa al preparar cada evento y la página omite la etiqueta y el resumen
    mientras sean nulos. `tipo` admite solo `webinar` o `curso`; `resumen` exige
    texto sin espacios al borde y de 1 a 600 caracteres. La vista usa permisos
    del dueño (`security_invoker = false`) y además `security_barrier = true`,
    para que los filtros del cliente no se evalúen sobre filas inactivas;
    `select` solo para `anon` (el sitio no tiene usuarios autenticados: la
    publishable key corresponde a `anon`). La configuración pública vive solo en
    `public/js/core/config.js` (más estricto que «bajo `public/js/core/`»); el
    ratchet detecta cualquier URL de proyecto Supabase, cualquier publishable
    key y cualquier site key de Turnstile, con legado exacto `public/app.js`,
    `public/certificados.js` y `public/validar-certificado.html`. La página
    valida nombre y correo con los mismos límites que el dominio y la ventana de
    inscripción con la misma regla; pruebas de paridad comparan caso por caso
    con `parseRegistrationName`, `Email.parse` y `acceptsRegistrations`. La
    solicitud a `public-api` no envía la publishable key (la función no verifica
    JWT).
  - RED observado antes de cada implementación: catálogo, `deno task test:db`
    con 4 pasos fallidos en el contrato nuevo (columnas `tipo` y `resumen`
    ausentes, vista inexistente) y «public view grants differ from the
    allow-list» en el ratchet de privilegios; cliente, `deno test` falló con
    `TS2307 Cannot find module .../public/js/core/api.js` y `TS2305` por
    `ratchetViolations` y `publicSettingsOutsideSource` inexistentes; página,
    `TS2307` para `turnstile.js`, `container.js`, `model.js` y `view.js`.
  - Verificación ejecutada: `supabase db reset --local` y `deno task test:db`,
    12 pruebas (44 pasos) aprobadas, 0 fallidas; incluye lectura por PostgREST
    con la publishable key local (solo eventos activos y solo las columnas de la
    lista), 401 `42501` al leer la tabla base y al escribir la vista, y 400
    `42703` al pedir `nextcloud_directorio`.
    `supabase gen types typescript
    --local`, tras `deno fmt`, es idéntico a
    `database.types.ts` (0 líneas de diferencia). `check_migrations.py` con
    pglast 7.20 en un entorno virtual temporal: 20 migraciones analizadas sin
    errores. `deno task check` correcto en cada commit (147 pruebas aprobadas al
    final, 0 fallidas). `deno task serve`: `inscripcion.html`, sus siete
    módulos, las hojas de estilo y los logos responden 200. Suites PowerShell
    heredadas `landing`, `certificate-claim` y `certificate-generation`: OK (la
    de landing detectó un `font-size: .75rem` nuevo, corregido a `.8rem` antes
    del commit).
  - Pendiente: aplicar la migración al remoto (decisión del usuario, antes del
    merge: sin la vista, la página publicada muestra «No pudimos cargar el
    evento»); Pages publica la página al mergear; la prueba en vivo solo es
    posible en producción, porque el CORS de `public-api` acepta un único
    origen. Ningún evento tiene la ventana abierta ni `tipo` y `resumen`
    cargados (FN-02-08). Hallazgo: `_shared/http/cors.ts` no expone
    `Retry-After` (`Access-Control-Expose-Headers`), así que el navegador no
    puede leer la espera de un 429; la página muestra entonces «Espera unos
    minutos antes de volver a intentarlo.». Corregido en la misma rebanada:
    `cors.ts` agrega `access-control-expose-headers: retry-after` para el origen
    permitido; la prueba de `public_api_test.ts` falló primero (RED en las tres
    variantes 403/429) y pasa con el cambio (`deno task check`: 147 pruebas
    aprobadas). Se despliega con `public-api` al mergear.
- 2026-10-24: FN-02-04 y FN-02-07 publicados, con aprobación del usuario.
  `20261024200000_add_public_event_catalog.sql` aplicada con `apply_migration`.
  Antes: sin vista ni columnas `tipo`/`resumen`; 3 eventos activos. Después:
  `anon` lee la vista y no puede escribirla ni leer la tabla base;
  `authenticated` sin acceso; 3 filas en la vista; 0 eventos con `tipo` o
  `resumen`; columnas exactas. Por PostgREST con la publishable key: vista 200
  con 3 filas, tabla base 401, escritura en la vista 401, columna ajena 400.
  Cadena de PRs #22 a #26 integrada en `delivery/inscripcion-generica`; PR de
  seguimiento #27 con CI en verde, mergeado en `main` (`dc5197d`); `Check`,
  Pages y despliegue de funciones correctos. En producción, `inscripcion.html`,
  sus siete módulos y `brand/tokens.css` responden 200; el preflight y un 403 de
  `public-api` incluyen `access-control-expose-headers: retry-after`. Pendiente:
  abrir la página en un navegador real (la extensión de Chrome no estaba
  conectada), cargar datos de un evento y abrir su ventana (FN-02-08) para la
  prueba de extremo a extremo con Turnstile, incluido el 429.
