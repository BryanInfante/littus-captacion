# Recuperación del wipe de Supabase (2026-07-25)

Estado: **datos recuperados** el 2026-09-04. El proyecto nuevo es
`dkvuihkwuuocjjsscuso`; las 7 migraciones están aplicadas, las 101 inscripciones y
los 19 certificados restaurados, y `validate-certificate` desplegada y probada
contra códigos reales.

Falta para cerrar del todo:

1. **Push a `main`** para que GitHub Pages sirva el `validar-certificado.html`
   actualizado. Hasta entonces el backend valida, pero los QR impresos siguen
   fallando para el público.
2. Cargar los 5 secrets en el proyecto nuevo y desplegar las otras 5 Edge
   Functions (`issue-certificate`, `download-certificate`,
   `send-registration-confirmation`, `sync-resend-contact`,
   `send-workshop-reminder`).
3. Mover los metadatos por-evento a una tabla, para poder emitir certificados de
   cursos nuevos sin tocar código.

## Qué pasó

El 2026-07-25 la migración `20260725201428_wipe_public_schema_for_persisto_staging`
se aplicó sobre el proyecto `qfbhyzynpyqqcpuuibod` (`airen`):

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

Ese proyecto pasó a ser el staging de otra aplicación (tablas `pwa_*`, `ndt_*`).
Las tablas `eccia_taller_inscripciones` y `eccia_masterclass_certificados` y
todas sus filas fueron destruidas.

Síntoma visible: los certificados ya emitidos dejaron de validar. `validate-certificate`
consulta una tabla inexistente, PostgREST devuelve error y la función cae en el
`return jsonResponse({ error: 'No se pudo validar el certificado.' }, 500)`.

Backups de Supabase: el wipe ocurrió 41 días antes de detectarse, lo que excede la
retención estándar (7 días de backups diarios, hasta 28 de PITR).

**Pero apareció un backup local, y lo cambia todo:**

```
C:\Users\bryan\backup_supabase.dump
formato pg_dump CUSTOM, creado 2026-07-25 13:06:08
```

El wipe corrió a las 20:14 UTC del mismo día. El dump es **anterior** y contiene
las tres tablas ECCIA con sus datos:

| Tabla | Filas |
| --- | --- |
| `eccia_taller_inscripciones` | 101 |
| `eccia_masterclass_certificados` | 19 (todas en estado `emailed`) |
| `eccia_inscritos` | 6 |

Más el DDL completo, los índices, las políticas RLS y las dos funciones de `private`.

Se lee sin conexión con el PostgreSQL 17 que ya está instalado localmente
(`C:\Users\bryan\pgsql-17\pgsql\bin`, no está en el PATH):

```powershell
& "C:\Users\bryan\pgsql-17\pgsql\bin\pg_restore.exe" -l "C:\Users\bryan\backup_supabase.dump"
```

Limitación: el dump se tomó **sin ACLs** (cero sentencias `GRANT`), así que los
permisos por columna no se pueden recuperar de ahí y están reconstruidos a mano
en `20260607233000`.

## Qué se rescató antes de dar de baja el proyecto viejo

Estos artefactos existían **solo** en la base y no en el repositorio. Se extrajeron
de `supabase_migrations.schema_migrations` y de `pg_get_functiondef()`, aprovechando
que el `DROP` fue únicamente sobre `public` y el esquema `private` sobrevivió:

| Artefacto | Dónde vive ahora |
| --- | --- |
| DDL de `eccia_taller_inscripciones` (nunca versionado, creado a mano) | `migrations/20260607233000_create_eccia_taller_inscripciones.sql` (reconstruido desde el código) |
| `private.eccia_sync_resend_contact()` (nunca versionado) | `migrations/20260904120000_parameterize_eccia_trigger_urls.sql` |
| Trigger `eccia_sync_resend_contact_after_insert` (nunca versionado) | misma migración |
| `private.eccia_send_registration_confirmation()` | ya estaba en `20260621173138` |

Además se corrigió que la cadena de migraciones **no podía construir una base
nueva**: `20260621173138` altera `eccia_taller_inscripciones` y `20260704120000`
declara una FK contra ella, pero ninguna migración la creaba. La nueva migración
`20260607233000` va fechada antes para restaurar el orden real.

### Reconstrucción inferida, no recuperada

En `20260607233000` los nombres de columna `creado_en` y `marketing_consent_at`
son **inferidos**: ningún código sobreviviente los lee, así que los originales no
se pudieron confirmar. El resto de las columnas está verificado contra el código
que las escribe y las lee. Si aparecen los nombres originales, renombrar ahí.

## Pasos pendientes

1. **Confirmar backups/PITR** en el dashboard del proyecto viejo. Si existen, restaurar y detenerse acá.
2. Crear el proyecto nuevo de Supabase, exclusivo de ECCIA.
3. Aplicar las 6 migraciones en orden. **No hay validación sintáctica previa**: no había
   `supabase` CLI, `psql` ni `docker` en el entorno, y probarlas contra el proyecto viejo
   habría repetido el error de mezclar entornos. Se validan al aplicarlas.
4. Configurar la URL base de las Edge Functions, requerida por los triggers:
   ```sql
   alter database postgres
     set app.eccia_functions_base_url = 'https://<nuevo-ref>.supabase.co/functions/v1';
   ```
   Reconectar después: la variable se lee por sesión. Si falta, las inscripciones se
   guardan igual pero se emite un `WARNING` en los logs y no sale ningún correo.
5. Cargar los secrets de Edge Functions: `RESEND_API_KEY`, `NEXTCLOUD_WEBDAV_URL`,
   `NEXTCLOUD_USERNAME`, `NEXTCLOUD_APP_PASSWORD`, `CERTIFICATE_PUBLIC_BASE_URL`.
6. Desplegar las 6 Edge Functions contra el ref nuevo.
7. Actualizar el ref y la publishable key en `public/app.js:9-11` y
   `public/certificados.js:12-14`.
8. **Repoblar los certificados emitidos** (ver abajo). Este es el paso que hace que
   los QR ya impresos vuelvan a validar.
9. Verificar escaneando un certificado real que ya esté en manos de un participante.

## Repoblación de certificados

Los PDFs sobrevivieron: Nextcloud no fue tocado por el wipe. `issue-certificate/index.ts:772`
los sube como:

```
masterclass-ultrasonido-nivel-i/2026/{CODIGO}.pdf
```

**El nombre de cada archivo es el código del certificado.** Un `PROPFIND` sobre ese
directorio devuelve la lista completa de certificados emitidos con éxito.

**Con el dump disponible, esta ya no es la vía principal.** Restaurar desde
`backup_supabase.dump` da correos reales, fechas reales y los vínculos
`registration_id`, cosas que el PDF no contiene. Usar `pg_restore --data-only`
sobre las tres tablas.

El script quedó como **herramienta de verificación**, y en ese rol ya demostró que
el dump está completo. Corrido el 2026-09-04 contra Nextcloud encontró 24 PDFs
frente a las 19 filas del dump:

- los 5 sobrantes son certificados de prueba del dueño del proyecto, generados con
  el mismo correo (el `unique (correo, masterclass_codigo)` deja una sola fila,
  pero cada corrida subió un PDF nuevo con otro código);
- `ECCIA-UT1-STUCKTEST.pdf` se descartó solo por no matchear el patrón hexadecimal;
- **cero filas del dump quedaron sin PDF**, y los 19 códigos impresos dentro de los
  PDFs coinciden con sus nombres de archivo.

Sirve para auditar que Nextcloud y la base estén sincronizados después de restaurar.

Cómo funciona, en dos fases separadas a propósito por una revisión humana:

```bash
python -m venv .recovery-venv
.recovery-venv/Scripts/python -m pip install pdfminer.six   # Windows

export NEXTCLOUD_WEBDAV_URL=... NEXTCLOUD_USERNAME=... NEXTCLOUD_APP_PASSWORD=...
python scripts/recover-certificates.py extract --out certificates.csv

# revisar certificates.csv a mano y completar la columna `correo`

export SUPABASE_URL=... SUPABASE_SECRET_KEY=... CERTIFICATE_PUBLIC_BASE_URL=...
python scripts/recover-certificates.py load --csv certificates.csv --dry-run
python scripts/recover-certificates.py load --csv certificates.csv
```

`extract` es de solo lectura y se puede repetir sin riesgo. `load` rechaza por defecto
las filas sin correo, las marcadas `revisar=SI` y las de nombre implausible; hay que
habilitarlas explícitamente con flags.

Cómo encuentra el nombre: `stampCertificate` dibuja solo tres cosas sobre la plantilla
(nombre, QR y el caption del código), y el nombre va en un baseline fijo calculable
desde `buildLayout()`. El script selecciona los glifos por coordenada usando
`matrix[5]` de pdfminer, **no** `y0` — `y0` es el borde del bounding box y cae 5.59pt
por debajo del baseline, con un desvío que escala con el tamaño de fuente. Como
`stampCertificate` elige entre 22, 25 y 27pt según el largo del nombre, usar `y0`
habría corrompido justo los nombres más largos sin emitir ningún error.

Control de integridad: el código impreso dentro del PDF debe coincidir con el nombre
del archivo. Si no coinciden, la fila sale marcada para revisión.

**El correo no está en el PDF.** Hay que recuperarlo de Resend y completarlo a mano en
el CSV. Con `--allow-placeholder-email` el script genera
`recuperado.<codigo>@recuperacion.littusgroup.com`, que es válido y trivialmente
identificable después, pero deja huecos en el sistema de registro: usarlo solo si
Resend no puede dar el dato.

Estado de pruebas: la extracción de PDF está cubierta por 18 asserts contra PDFs
sintéticos (nombres acentuados, los tres tamaños de fuente, layout cambiado, código
ausente, entrada corrupta) y la ruta `load` se validó en seco. **La ruta `extract`
contra Nextcloud no está probada**: no había credenciales disponibles. El PROPFIND y
el parseo de XML son el tramo sin verificar.

Las inscripciones (`eccia_taller_inscripciones`) son una pérdida distinta: solo se
reconstruyen parcialmente desde los contactos de Resend. Afectan el gate 403 de
`issue-certificate` al emitir certificados **nuevos**, no a la validación de los ya emitidos.

## Para que no vuelva a pasar

- ECCIA en proyecto propio. Fue la causa raíz: infraestructura compartida donde otro equipo corre `DROP SCHEMA public CASCADE`.
- Ningún cambio de esquema por dashboard. Si no está en `supabase/migrations/`, no existe: así se perdió el DDL de `eccia_taller_inscripciones`.
- Sin refs de proyecto hardcodeados en la base. Ver `app.eccia_functions_base_url`.
- `validate-certificate/index.ts` todavía tiene los metadatos del evento hardcodeados
  (`event_title`, `duration`, `event_date`). Para soportar un curso nuevo hay que
  moverlos a la base, indexados por `masterclass_codigo`.
